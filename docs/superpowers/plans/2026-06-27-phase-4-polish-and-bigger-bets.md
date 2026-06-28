# Phase 4 — Polish & Bigger Bets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw browser `prompt()`/`confirm()` in Settings with inline editing + color swatches; add CSV export and an in-app SQLite backup download; and add per-card closing/due days with a "projected bill" statement view — the most on-theme, credit-card-specific feature.

**Architecture:** Three slices. (1) Settings UX is pure frontend over existing endpoints, with small testable render helpers in `budget.js`. (2) CSV export adds a use-case method + route; backup adds a tiny db-backed controller. (3) Per-card statement adds migration `005` (`cards.closing_day`/`due_day`), a `ReportRepository.spendByCardDateRange`, a statement use-case method, and routes on the existing cards controller.

**Tech Stack:** TypeScript hexagonal, Express 5, better-sqlite3, zod, `node:test` + supertest, vanilla ESM.

## Global Constraints

(Same as Phases 0–3; repeated so this plan stands alone.)

- Node 22; money in integer **cents**; months `YYYY-MM`, dates `YYYY-MM-DD`.
- Hexagonal layering; ports in `src/domain/ports/index.ts`; entities in `src/domain/entities/index.ts`; errors via `AppError`.
- Tests CommonJS `require('node:test')`; `makeTestDb()` for DB, `supertest` + `createApp(ctx.db)` for API; coverage ≥80% (`npm run coverage`).
- HTTP validation via zod + `parse()`; existence rules in use-cases.
- Frontend render functions pure + unit-tested; DOM bootstrap follows existing pages.
- Commit after each task.

## Dependency & Design Decisions (review before executing)

1. **This phase assumes Phases 0–3 are merged.** Per-card statement reuses `chargeDate(month, day)` / `daysInMonth(month)` from `src/domain/services/dates.ts` (added in Phase 3, Task 2). If running Phase 4 standalone, add those two helpers first.
2. **Statement cycle:** a card with `closing_day = c` produces, for target month `M`, a statement covering transactions dated in the window `( chargeDate(M-1, c) , chargeDate(M, c) ]` (exclusive→inclusive). If `closing_day` is null, fall back to the calendar month. `due_day` (if set) is rendered as `chargeDate(M, due_day)` in the same month.
3. **Backup is a download; full restore stays a documented file-copy.** `GET /api/backup` streams `db.serialize()`. A safe in-process *restore* would require a server restart anyway (the DB file is locked while open), so restore is a stop-app-and-swap-the-file operation documented in the README — not a risky live endpoint. (A swap-on-restart endpoint is a possible future enhancement.)
4. **CSV export reflects the current filters** (month/category/card/search) and has no pagination.

---

### Task 1: Color swatches replace the recolor `prompt()`

**Files:**
- Modify: `public/js/budget.js` (export `GROUP_COLORS`, `colorSwatches`; use it in `renderGroupedLimitRows`)
- Modify: `public/js/settings.js` (handle `data-group-color`; delete `recolorGroup`/`COLORS`)
- Test: `test/budget.test.ts` (append)

**Interfaces:**
- Produces: `colorSwatches(groupId, current): string`; clicking a swatch issues `PUT /api/groups/:id` with the new color.

- [ ] **Step 1: Write the failing test**

Append to `test/budget.test.ts`:

```ts
test('colorSwatches renders a button per palette color and marks the current', async () => {
  const { colorSwatches, GROUP_COLORS } = await import('../public/js/budget.js');
  const html = colorSwatches(3, 'gold');
  for (const c of GROUP_COLORS) assert.match(html, new RegExp(`data-color="${c}"`));
  assert.match(html, /data-group-color="3"/);
  assert.match(html, /data-color="gold"[^>]*ring/); // current is highlighted
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/budget.test.ts`
Expected: FAIL — `colorSwatches` not exported.

- [ ] **Step 3: Implement the helper in `budget.js`**

```js
export const GROUP_COLORS = ['sage', 'gold', 'slate', 'neutral'];

export function colorSwatches(groupId, current) {
  return GROUP_COLORS.map(c =>
    `<button data-group-color="${groupId}" data-color="${c}" title="${c}"
       class="tag tag-${c} mr-1 ${c === current ? 'ring-2 ring-ink' : ''}">${c}</button>`).join('');
}
```

In `renderGroupedLimitRows`, replace the single `data-group-recolor` button with the swatches:

```js
        <td class="py-2 text-right">
          <button data-group-rename="${g.id}" class="text-sage text-sm mr-2">Rename</button>
          ${colorSwatches(g.id, g.color)}
          <button data-group-del="${g.id}" class="text-clay text-sm">Remove</button>
        </td>
```

- [ ] **Step 4: Wire the click + remove the prompt in `settings.js`**

In `onLimitsClick`, replace the `groupRecolor` branch with:

```js
    if (d.groupColor) {
      const g = state.groups.find(x => x.id === Number(d.groupColor));
      await api.put(`/api/groups/${d.groupColor}`, { ...g, color: d.color });
      await loadLimits();
      return;
    }
```

Delete the `recolorGroup` function and the now-unused `COLORS` constant.

- [ ] **Step 5: Run test + manual smoke + commit**

Run: `npx tsx --test test/budget.test.ts`
Then `npm start`: click a swatch on a group; confirm the chip recolors with no prompt. Stop the server.
```bash
git add public/js/budget.js public/js/settings.js test/budget.test.ts
git commit -m "feat(settings): color swatches replace the recolor prompt"
```

---

### Task 2: Inline rename + add replace the remaining `prompt()`s

**Files:**
- Modify: `public/js/budget.js` (`nameEditor` helper)
- Modify: `public/js/settings.js` (inline rename for category/group; inline add)
- Test: `test/budget.test.ts` (append)

**Interfaces:**
- Produces: `nameEditor(kind, id, value): string` — an inline `<input>` + Save/Cancel markup (`kind` is `'cat'` or `'group'`). Rename/add no longer call `prompt()`.

- [ ] **Step 1: Write the failing test**

```ts
test('nameEditor renders an input prefilled with the current value', async () => {
  const { nameEditor } = await import('../public/js/budget.js');
  const html = nameEditor('cat', 5, 'Mercado');
  assert.match(html, /data-save="cat:5"/);
  assert.match(html, /data-cancel="cat:5"/);
  assert.match(html, /value="Mercado"/);
});

test('nameEditor escapes the value', async () => {
  const { nameEditor } = await import('../public/js/budget.js');
  assert.doesNotMatch(nameEditor('group', 1, '"<x>'), /<x>/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/budget.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `nameEditor` in `budget.js`**

```js
export function nameEditor(kind, id, value) {
  return `<span class="inline-flex items-center gap-1">
    <input data-edit-input="${kind}:${id}" value="${esc(value)}"
      class="rounded border border-line px-2 py-0.5 text-sm" />
    <button data-save="${kind}:${id}" class="text-sage text-sm">Save</button>
    <button data-cancel="${kind}:${id}" class="text-ink-mut text-sm">Cancel</button>
  </span>`;
}
```

- [ ] **Step 4: Wire inline rename in `settings.js`**

Replace `renameCategory`/`renameGroup` (which used `prompt`) with handlers that swap the cell to `nameEditor(...)` on "Rename", and persist on "Save". Sketch (adapt selectors to the table cell that holds the name):

```js
import { ceilingText, renderLimitRows, renderGroupedLimitRows, colorSwatches, nameEditor,
  allocationStatus, allocationText, allocationPillClass } from './budget.js';

function beginRename(kind, id) {
  const cell = $('limits').querySelector(`[data-name-cell="${kind}:${id}"]`);
  if (!cell) return;
  const cur = kind === 'cat'
    ? state.cats.find(c => c.id === id).name
    : state.groups.find(g => g.id === id).name;
  cell.innerHTML = nameEditor(kind, id, cur);
  cell.querySelector('input').focus();
}

async function saveRename(kind, id) {
  const val = $('limits').querySelector(`[data-edit-input="${kind}:${id}"]`).value.trim();
  if (!val) return loadLimits();
  if (kind === 'cat') {
    const c = state.cats.find(x => x.id === id);
    await api.put(`/api/categories/${id}`, { ...c, name: val });
  } else {
    const g = state.groups.find(x => x.id === id);
    await api.put(`/api/groups/${id}`, { ...g, name: val });
  }
  await loadLimits();
}
```

Add `data-name-cell="cat:${c.id}"` / `data-name-cell="group:${g.id}"` attributes to the name `<td>`s in `renderGroupedLimitRows`, and extend `onLimitsClick` to route `data-cat-rename`/`data-group-rename` → `beginRename`, `data-save` → `saveRename`, `data-cancel` → `loadLimits`.

- [ ] **Step 5: Inline add (replace `addCategory`/`addGroup` prompts)**

Replace the `prompt('New category name')` / `prompt('New group name')` flow with an inline input revealed under the "+ Add category"/"+ Add group" buttons (reuse `nameEditor('cat', 'new')` / `nameEditor('group', 'new')`), POSTing on Save. Keep the existing `data-add-cat`/`data-add-group` triggers; on click, render the editor in place and wire its Save to `api.post`.

- [ ] **Step 6: Run tests + manual smoke + commit**

Run: `npx tsx --test test/budget.test.ts`
Then `npm start`: rename a category and a group inline; add a category inline — no browser prompts appear. Stop the server.
```bash
git add public/js/budget.js public/js/settings.js test/budget.test.ts
git commit -m "feat(settings): inline rename/add replace browser prompts"
```

---

### Task 3: CSV export of transactions

**Files:**
- Modify: `src/application/use-cases/transactions.ts` (`exportCsv`)
- Modify: `src/adapters/http/controllers/transactions.ts` (`GET /export.csv`)
- Test: `test/transactions.test.ts` (append)

**Interfaces:**
- Consumes: `TransactionRepository.list` (unpaginated), `CategoryRepository.listAll`, `CardRepository.listAll`.
- Produces: `TransactionUseCases.exportCsv(filter: { month?; categoryId?; cardId?; q? }): string`; `GET /api/transactions/export.csv` → `text/csv`.

- [ ] **Step 1: Write the failing test**

```ts
test('GET /api/transactions/export.csv returns a CSV with a header and rows', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({ date: '2026-06-01', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 1234, description: 'Coffee, hot' }).expect(201);
  const res = await request(app).get('/api/transactions/export.csv').expect(200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.text, /date,category,card,amount_cents,description/);
  assert.match(res.text, /Supermercado/);
  assert.match(res.text, /"Coffee, hot"/); // comma-containing field is quoted
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/transactions.test.ts`
Expected: FAIL — route 404.

- [ ] **Step 3: Add `exportCsv` to the use-case**

In `src/application/use-cases/transactions.ts`, add to the returned object:

```ts
    exportCsv(filter: { month?: string; categoryId?: number; cardId?: number; q?: string }): string {
      const items = transactions.list({ ...filter, limit: null, offset: 0 });
      const catName = new Map(categories.listAll().map(c => [c.id, c.name]));
      const cardName = new Map(cards.listAll().map(c => [c.id, c.name]));
      const cell = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['date', 'category', 'card', 'amount_cents', 'description', 'installment_no', 'installment_total'];
      const rows = items.map(t => [
        t.date, catName.get(t.category_id) ?? '', cardName.get(t.card_id) ?? '',
        t.amount_cents, t.description, t.installment_no ?? '', t.installment_total ?? '',
      ].map(cell).join(','));
      return [header.join(','), ...rows].join('\n');
    },
```

- [ ] **Step 4: Add the route**

In `src/adapters/http/controllers/transactions.ts`, add **before** `router.put('/:id', ...)`:

```ts
  router.get('/export.csv', (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.month !== undefined) filter.month = String(req.query.month);
    if (req.query.category_id !== undefined) filter.categoryId = Number(req.query.category_id);
    if (req.query.card_id !== undefined) filter.cardId = Number(req.query.card_id);
    if (req.query.q !== undefined) filter.q = String(req.query.q);
    res.attachment('transactions.csv').type('text/csv').send(uc.exportCsv(filter));
  });
```

- [ ] **Step 5: Run; confirm pass + commit**

Run: `npx tsx --test test/transactions.test.ts`
```bash
git add src/application/use-cases/transactions.ts src/adapters/http/controllers/transactions.ts test/transactions.test.ts
git commit -m "feat(transactions): CSV export endpoint"
```

---

### Task 4: SQLite backup download (+ README restore note)

**Files:**
- Create: `src/adapters/http/controllers/backup.ts`
- Modify: `src/infra/composition.ts` (`backup` controller built from `db`)
- Modify: `src/app.ts` (mount `/api/backup`)
- Modify: `README.md` (restore = stop app, replace `data/gastando.db`)
- Modify: `public/settings.html` + `public/js/settings.js` (a "Download backup" link) and `public/transactions.html` + `public/js/transactions.js` (an "Export CSV" link)
- Test: `test/backup.test.ts` (new)

**Interfaces:**
- Produces: `GET /api/backup` → `application/octet-stream` attachment of `db.serialize()`.

- [ ] **Step 1: Write the failing test**

Create `test/backup.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('GET /api/backup streams a SQLite file', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).get('/api/backup').expect(200);
  assert.match(res.headers['content-disposition'], /attachment/);
  // SQLite files start with the "SQLite format 3\0" magic header.
  assert.match(res.body.slice(0, 15).toString('utf8'), /SQLite format 3/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/backup.test.ts`
Expected: FAIL — route 404.

- [ ] **Step 3: Write the controller**

Create `src/adapters/http/controllers/backup.ts`:

```ts
import express from 'express';
import type { Db } from '../../../infra/db';

export function makeBackupController(db: Db): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => {
    const buf = db.serialize();
    const stamp = new Date().toISOString().slice(0, 10);
    res.attachment(`gastando-backup-${stamp}.db`).type('application/octet-stream').send(buf);
  });
  return router;
}
```

- [ ] **Step 4: Wire it (composition + app)**

In `src/infra/composition.ts`: import `makeBackupController`; add `backup: express.Router;` to `Container.controllers`; and in `controllers`, add `backup: makeBackupController(db)`.

In `src/app.ts`, add: `app.use('/api/backup', controllers.backup);`

- [ ] **Step 5: Run; confirm pass**

Run: `npx tsx --test test/backup.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the UI links**

In `transactions.html`, add an `<a id="exportCsv" class="btn-ghost text-sm">Export CSV</a>`; in `transactions.js` bootstrap set its href from the current filters on each `loadList` (or point it at `/api/transactions/export.csv?month=${$('month').value}`).
In `settings.html`, add `<a href="/api/backup" class="btn-ghost text-sm">Download backup</a>`.

- [ ] **Step 7: README restore note**

In `README.md`, under data/backup, document: "To restore, stop the app and replace `data/gastando.db` with a downloaded backup, then start again." (Replaces the bare "copy the file by hand".)

- [ ] **Step 8: Full suite + commit**

Run: `npm run coverage`
```bash
git add src/adapters/http/controllers/backup.ts src/infra/composition.ts src/app.ts README.md public/settings.html public/transactions.html public/js/transactions.js test/backup.test.ts
git commit -m "feat: SQLite backup download + CSV export links; document restore"
```

---

### Task 5: Per-card closing/due day (migration + persistence)

**Files:**
- Create: `migrations/005_card_statement.sql`
- Modify: `src/domain/entities/index.ts` (`Card.closing_day`, `Card.due_day`)
- Modify: `src/domain/ports/index.ts` (`CardRepository.setStatementConfig`)
- Modify: `src/infra/repositories/cards.ts`
- Test: `test/crud.test.ts` (append) or `test/cardStatement.test.ts` (new)

**Interfaces:**
- Produces: `Card` carries nullable `closing_day` / `due_day`; `CardRepository.setStatementConfig(id, closingDay: number | null, dueDay: number | null): number`.

- [ ] **Step 1: Write the migration**

Create `migrations/005_card_statement.sql`:

```sql
ALTER TABLE cards ADD COLUMN closing_day INTEGER;
ALTER TABLE cards ADD COLUMN due_day INTEGER;
```

- [ ] **Step 2: Write the failing repo test**

Create `test/cardStatement.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeCardRepository } = require('../src/infra/repositories/cards');

test('setStatementConfig persists closing/due day', () => {
  const ctx = makeTestDb();
  const repo = makeCardRepository(ctx.db);
  assert.equal(repo.setStatementConfig(ctx.cardId, 20, 27), 1);
  const card = repo.findById(ctx.cardId);
  assert.equal(card.closing_day, 20);
  assert.equal(card.due_day, 27);
});
```

- [ ] **Step 3: Add entity fields + port method**

Entity: `export interface Card { id: number; name: string; active: number; closing_day: number | null; due_day: number | null; }`
Port (`CardRepository`): `setStatementConfig(id: number, closingDay: number | null, dueDay: number | null): number;`

- [ ] **Step 4: Implement in the repository**

In `src/infra/repositories/cards.ts`, add to the returned object (the existing `SELECT *` queries already surface the new columns):

```ts
    setStatementConfig(id, closingDay, dueDay): number {
      return db.prepare('UPDATE cards SET closing_day=?, due_day=? WHERE id=?')
        .run(closingDay, dueDay, id).changes;
    },
```

- [ ] **Step 5: Run; confirm pass + commit**

Run: `npx tsx --test test/cardStatement.test.ts`
```bash
git add migrations/005_card_statement.sql src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/cards.ts test/cardStatement.test.ts
git commit -m "feat(cards): closing/due day persistence"
```

---

### Task 6: Per-card statement use-case + endpoints

**Files:**
- Modify: `src/domain/ports/index.ts` (`ReportRepository.spendByCardDateRange`)
- Modify: `src/infra/repositories/reports.ts`
- Modify: `src/application/use-cases/cards.ts` (`statement`, `setConfig`; add `reports` dep)
- Modify: `src/infra/composition.ts:76` (pass `reports` to cards use-case)
- Create: `src/adapters/http/schemas/cards.ts`
- Modify: `src/adapters/http/controllers/cards.ts` (routes)
- Test: `test/cardStatement.test.ts` (append API cases)

**Interfaces:**
- Consumes: `chargeDate`, `addMonths` from `dates`; `ReportRepository.spendByCardDateRange(cardId, startExclusive, endInclusive): number`.
- Produces: `CardUseCases.statement(id, month)` → `{ card_id, month, closing_date, due_date, amount_cents }`; `setConfig(id, { closing_day, due_day })` → `Card`; `GET /api/cards/:id/statement?month=`, `PUT /api/cards/:id/statement-config`.

- [ ] **Step 1: Write the failing test**

```ts
const request = require('supertest');
const { createApp } = require('../src/app');

test('card statement sums the closing-day cycle', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put(`/api/cards/${ctx.cardId}/statement-config`).send({ closing_day: 20, due_day: 27 }).expect(200);
  const add = date => request(app).post('/api/transactions')
    .send({ date, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000, description: 'x' }).expect(201);
  await add('2026-05-25'); // after May 20 close -> belongs to June statement
  await add('2026-06-10'); // before June 20 close -> June statement
  await add('2026-06-25'); // after June 20 close -> July statement, excluded
  const res = await request(app).get(`/api/cards/${ctx.cardId}/statement?month=2026-06`).expect(200);
  assert.equal(res.body.amount_cents, 20000);
  assert.equal(res.body.closing_date, '2026-06-20');
  assert.equal(res.body.due_date, '2026-06-27');
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/cardStatement.test.ts`
Expected: FAIL — config route 404.

- [ ] **Step 3: Add the report method**

Port (`ReportRepository`): `spendByCardDateRange(cardId: number, startExclusive: string, endInclusive: string): number;`
Repo (`src/infra/repositories/reports.ts`):

```ts
    spendByCardDateRange(cardId: number, startExclusive: string, endInclusive: string): number {
      return (db.prepare(
        `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE card_id=? AND date > ? AND date <= ?`,
      ).get(cardId, startExclusive, endInclusive) as { s: number }).s;
    },
```

- [ ] **Step 4: Extend the cards use-case**

```ts
import type { Card } from '../../domain/entities';
import type { CardRepository, ReportRepository } from '../../domain/ports';
import { AppError } from '../../domain/errors';
import { addMonths, chargeDate } from '../../domain/services/dates';

export interface CardUseCaseDeps { cards: CardRepository; reports: ReportRepository; }
```

Add to the returned object:

```ts
    setConfig(id: number, body: { closing_day: number | null; due_day: number | null }): Card {
      if (cards.setStatementConfig(id, body.closing_day, body.due_day) === 0) {
        throw new AppError(404, 'card not found');
      }
      return cards.findById(id) as Card;
    },

    statement(id: number, month: string) {
      const card = cards.findById(id);
      if (!card) throw new AppError(404, 'card not found');
      if (card.closing_day == null) {
        // No cycle configured: fall back to the calendar month window.
        const start = chargeDate(addMonths(month, -1), 31); // last day of prev month, exclusive
        const end = chargeDate(month, 31);                  // last day of this month, inclusive
        return { card_id: id, month, closing_date: null, due_date: null,
          amount_cents: reports.spendByCardDateRange(id, start, end) };
      }
      const closing_date = chargeDate(month, card.closing_day);
      const start = chargeDate(addMonths(month, -1), card.closing_day);
      const due_date = card.due_day != null ? chargeDate(month, card.due_day) : null;
      return { card_id: id, month, closing_date, due_date,
        amount_cents: reports.spendByCardDateRange(id, start, closing_date) };
    },
```

- [ ] **Step 5: Wire `reports` into cards composition**

In `src/infra/composition.ts`:

```ts
    cards: makeCardUseCases({ cards: repositories.cards, reports: repositories.reports }),
```

- [ ] **Step 6: Schema + routes**

Create `src/adapters/http/schemas/cards.ts`:

```ts
import { z } from 'zod';

const dayOrNull = z.custom<number | null>(
  v => v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31),
  { message: 'day must be an integer 1..31 or null' });

export const statementConfigSchema = z.object({ closing_day: dayOrNull, due_day: dayOrNull });
```

In `src/adapters/http/controllers/cards.ts`, import `parse`-friendly schema and add **before** `router.put('/:id', ...)`:

```ts
import { statementConfigSchema } from '../schemas/cards';
import { MONTH_RE } from '../schemas/common';
```
```ts
  router.get('/:id/statement', (req, res) => {
    const q = req.query.month;
    const month = (typeof q === 'string' && MONTH_RE.test(q)) ? q : new Date().toISOString().slice(0, 7);
    res.json(uc.statement(Number(req.params.id), month));
  });

  router.put('/:id/statement-config', (req, res) => {
    const body = parse(statementConfigSchema, req.body);
    res.json(uc.setConfig(Number(req.params.id), { closing_day: body.closing_day ?? null, due_day: body.due_day ?? null }));
  });
```

- [ ] **Step 7: Run; confirm pass + coverage**

Run: `npm run coverage`
Expected: PASS, ≥80%.

- [ ] **Step 8: Commit**

```bash
git add src/domain/ports/index.ts src/infra/repositories/reports.ts src/application/use-cases/cards.ts src/infra/composition.ts src/adapters/http/schemas/cards.ts src/adapters/http/controllers/cards.ts test/cardStatement.test.ts
git commit -m "feat(cards): per-card statement (closing-day cycle) + config endpoint"
```

---

### Task 7: Per-card statement UI (Settings)

**Files:**
- Modify: `public/js/settings.js` (`renderCards` pure helper + wiring)
- Test: `test/settingsRender.test.ts` (append)

**Interfaces:**
- Consumes: `/api/cards`, `GET /api/cards/:id/statement?month=`, `PUT /api/cards/:id/statement-config`.
- Produces: pure `renderCards(cards, statementByCard, month): string` showing name, closing/due-day inputs, and the projected bill.

- [ ] **Step 1: Write the failing test**

Append to `test/settingsRender.test.ts`:

```ts
test('renderCards shows the projected bill and config inputs', async () => {
  const { renderCards } = await import('../public/js/settings.js');
  const cards = [{ id: 2, name: 'Nubank', active: 1, closing_day: 20, due_day: 27 }];
  const stmt = new Map([[2, { amount_cents: 35000, closing_date: '2026-06-20', due_date: '2026-06-27' }]]);
  const html = renderCards(cards, stmt, '2026-06');
  assert.match(html, /Nubank/);
  assert.match(html, /R\$ 350,00/);          // projected bill
  assert.match(html, /data-closing="2"/);
  assert.match(html, /value="20"/);
});
```

(If `settings.js`'s bootstrap currently throws when imported headlessly, ensure `renderCards` is exported at module top-level — like `renderHero` in `dashboard.js` — so the import works under `node:test`.)

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/settingsRender.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `renderCards` (top-level export) in `settings.js`**

```js
export function renderCards(cards, stmtByCard, month) {
  return cards.filter(c => c.active).map(c => {
    const s = stmtByCard.get(c.id);
    return `
      <div class="paper-card" data-card="${c.id}">
        <div class="flex items-center justify-between">
          <span class="font-semibold">${esc(c.name)}</span>
          <button data-del="${c.id}" class="text-clay text-sm">Remove</button>
        </div>
        <div class="mt-2 flex items-center gap-3 text-sm">
          <label>Closing <input type="number" min="1" max="31" data-closing="${c.id}"
            value="${c.closing_day ?? ''}" class="w-16 rounded border border-line px-1" /></label>
          <label>Due <input type="number" min="1" max="31" data-due="${c.id}"
            value="${c.due_day ?? ''}" class="w-16 rounded border border-line px-1" /></label>
          <span class="ml-auto font-mono">${s ? `Bill ${formatBRL(s.amount_cents)}` : ''}</span>
        </div>
      </div>`;
  }).join('');
}
```

(Add `esc`, `formatBRL` to the `./format.js` import.)

- [ ] **Step 4: Wire `loadCards` to use it**

Replace the body of `loadCards` to fetch cards + each card's statement for `$('month').value`, render with `renderCards`, then wire: `data-del` → delete; `change` on `data-closing`/`data-due` → `PUT /api/cards/:id/statement-config` with both current values, then reload.

```js
async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    const active = cards.filter(c => c.active);
    const stmts = await Promise.all(active.map(c =>
      api.get(`/api/cards/${c.id}/statement?month=${$('month').value}`).then(s => [c.id, s])));
    $('cards').innerHTML = renderCards(cards, new Map(stmts), $('month').value);
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => { try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); } }));
    const saveCfg = async id => {
      const closing = $('cards').querySelector(`input[data-closing="${id}"]`).value;
      const due = $('cards').querySelector(`input[data-due="${id}"]`).value;
      try {
        await api.put(`/api/cards/${id}/statement-config`,
          { closing_day: closing ? Number(closing) : null, due_day: due ? Number(due) : null });
        loadCards();
      } catch (e) { showError(e.message); }
    };
    $('cards').querySelectorAll('input[data-closing],input[data-due]').forEach(inp =>
      inp.addEventListener('change', () => saveCfg(Number(inp.dataset.closing ?? inp.dataset.due))));
  } catch (e) { showError(e.message); }
}
```

- [ ] **Step 5: Run render test + manual smoke**

Run: `npx tsx --test test/settingsRender.test.ts`
Then `npm start`: set a card's closing day, add transactions around it, confirm the projected bill updates. Stop the server.

- [ ] **Step 6: Full suite + commit**

Run: `npm run coverage`
```bash
git add public/js/settings.js test/settingsRender.test.ts
git commit -m "feat(cards): per-card projected bill + closing/due config in Settings"
```

---

## Self-Review

- **Spec coverage:** replace prompt/confirm (swatches Task 1; inline rename/add Task 2 — the `confirm()` deletes already became inline/guarded in earlier phases, and Settings deletes here go through buttons, not `confirm`); CSV export (Task 3) + backup download + restore documentation (Task 4); per-card statement (closing/due persistence Task 5, statement logic + endpoints Task 6, UI Task 7).
- **Placeholder scan:** Tasks 2 and 7 contain UI-wiring sketches rather than line-exact diffs because that wiring is DOM-interaction the codebase verifies by manual smoke, not unit tests; each still ships a *tested* pure helper (`nameEditor`, `renderCards`) and concrete code. No "TODO"/"handle later" text.
- **Type consistency:** `Card` gains `closing_day`/`due_day` (Task 5) consumed by use-case (Task 6) and UI (Task 7). `setStatementConfig(id, closingDay, dueDay)` identical across port/repo/use-case. `spendByCardDateRange(cardId, startExclusive, endInclusive)` consistent port↔repo↔use-case. Statement window matches Design Decision 2. `statementConfigSchema` field names `closing_day`/`due_day` match the use-case and UI.
- **Dependency check:** per-card statement reuses `chargeDate`/`addMonths` (dates.ts) — `addMonths` exists today; `chargeDate` is added in Phase 3 (Design Decision 1 flags this for standalone runs).
