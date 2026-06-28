# Phase 3 — Recurring Transactions & Savings History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (a) Let the user define recurring/subscription templates and one-click materialize each month's charges (flagging amount changes); (b) add a "Savings over time" chart — the missing savings-side of BI.

**Architecture:** Recurring is a new vertical slice: migration `004` (a `recurring_templates` table + a `recurring_template_id` column on `transactions` for idempotent dedup), a `RecurringRepository`, a use-case with a `materialize(month)` operation, a `/api/recurring` controller, and a `public/recurring.html` page. Savings history extends the existing BI use-case/controller and the `bi.html` chart grid, reusing the `lineChart` contract.

**Tech Stack:** TypeScript hexagonal, Express 5, better-sqlite3, zod, `node:test` + supertest, vanilla ESM + Chart.js.

## Global Constraints

(Same as Phases 0–2; repeated so this plan stands alone.)

- Node 22; money in integer **cents**; months `YYYY-MM`, dates `YYYY-MM-DD`.
- Hexagonal layering; ports in `src/domain/ports/index.ts`; entities in `src/domain/entities/index.ts`; errors via `AppError`.
- Migrations live in `migrations/NNN_name.sql`; the runner applies unapplied `.sql` in sorted order and records them in `schema_migrations`. `makeTestDb()` runs **every** migration except `002_seed.sql`, so a new `004` migration is active in tests.
- Tests CommonJS `require('node:test')`; `makeTestDb()` for DB, `supertest` + `createApp(ctx.db)` for API; coverage ≥80% (`npm run coverage`).
- HTTP validation via zod + `parse()`; existence rules in use-cases.
- Frontend render functions pure + unit-tested; charts via `lineChart(canvasId, labels, series, onlyNonZero)` where each `series` item is `{ name, spent_cents: number[] }`.
- Commit after each task.

## Design Decisions (review before executing)

1. **Materialization is manual and idempotent.** The user clicks "Materialize this month"; for each active template the app inserts one transaction for that month **only if** none already exists for that `(template, month)`. Dedup is enforced by the new `transactions.recurring_template_id` column. Re-clicking is safe.
2. **Charge date = the template's `day_of_month`, clamped to the month length** (e.g. day 31 in February → the 28th/29th).
3. **"Amount changed" flag** compares the template's current `amount_cents` to the most recent *prior* month's materialized charge for that template. It is informational only — it does not block or rewrite anything.
4. **Editing a template never touches already-materialized transactions.** Past charges are real, edited like any transaction on the Transactions page. (Mirrors the per-month-limit-history principle.)
5. **Savings history uses the current savings settings across all months.** There is no historical settings table, so income/fixed/goal are today's values applied to every month in the range. Documented in the chart subtitle. Per month: `projected_savings = income − fixed − actual_spend(month)`, plotted against a flat `goal` line.

---

### Task 1: Migration, entity, port, repository

**Files:**
- Create: `migrations/004_recurring.sql`
- Modify: `src/domain/entities/index.ts` (`RecurringTemplate`)
- Modify: `src/domain/ports/index.ts` (`RecurringRepository`)
- Create: `src/infra/repositories/recurring.ts`
- Test: `test/recurring.test.ts` (new)

**Interfaces:**
- Produces: `RecurringTemplate` entity and `RecurringRepository` with `list`, `listActive`, `findById`, `insert`, `update`, `deactivate`, `findChargeForMonth`, `insertCharge`, `lastChargeAmountBefore`.

```ts
// entity
export interface RecurringTemplate {
  id: number; description: string; category_id: number; card_id: number;
  amount_cents: number; day_of_month: number; active: number;
}
```

```ts
// port
export interface RecurringRepository {
  list(): RecurringTemplate[];
  listActive(): RecurringTemplate[];
  findById(id: number): RecurringTemplate | undefined;
  insert(t: { description: string; category_id: number; card_id: number; amount_cents: number; day_of_month: number }): RecurringTemplate;
  update(id: number, t: { description: string; category_id: number; card_id: number; amount_cents: number; day_of_month: number; active: number }): number;
  deactivate(id: number): number;
  findChargeForMonth(templateId: number, month: string): boolean;
  insertCharge(c: { template_id: number; date: string; category_id: number; card_id: number; amount_cents: number; description: string }): number;
  lastChargeAmountBefore(templateId: number, month: string): number | null;
}
```

- [ ] **Step 1: Write the migration**

Create `migrations/004_recurring.sql`:

```sql
CREATE TABLE recurring_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  amount_cents INTEGER NOT NULL,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN recurring_template_id INTEGER REFERENCES recurring_templates(id);
CREATE INDEX idx_tx_recurring ON transactions(recurring_template_id);
```

- [ ] **Step 2: Write the failing repository test**

Create `test/recurring.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeRecurringRepository } = require('../src/infra/repositories/recurring');

test('insert + list round-trips a template', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({ description: 'Claude', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 10000, day_of_month: 5 });
  assert.equal(t.description, 'Claude');
  assert.equal(repo.list().length, 1);
  assert.equal(repo.listActive().length, 1);
});

test('charge dedup + last-amount lookup', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({ description: 'Disney', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 4000, day_of_month: 1 });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), false);
  repo.insertCharge({ template_id: t.id, date: '2026-05-01', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 3500, description: 'Disney' });
  assert.equal(repo.lastChargeAmountBefore(t.id, '2026-06'), 3500);
  repo.insertCharge({ template_id: t.id, date: '2026-06-01', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 4000, description: 'Disney' });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), true);
});
```

- [ ] **Step 3: Run; confirm fail**

Run: `npx tsx --test test/recurring.test.ts`
Expected: FAIL — `makeRecurringRepository` not found.

- [ ] **Step 4: Add the entity + port** (paste the blocks above into the respective files).

- [ ] **Step 5: Implement the repository**

Create `src/infra/repositories/recurring.ts`:

```ts
import type { Db } from '../db';
import type { RecurringTemplate } from '../../domain/entities';
import type { RecurringRepository } from '../../domain/ports';

export function makeRecurringRepository(db: Db): RecurringRepository {
  return {
    list() {
      return db.prepare('SELECT * FROM recurring_templates ORDER BY id').all() as RecurringTemplate[];
    },
    listActive() {
      return db.prepare('SELECT * FROM recurring_templates WHERE active=1 ORDER BY id').all() as RecurringTemplate[];
    },
    findById(id) {
      return db.prepare('SELECT * FROM recurring_templates WHERE id=?').get(id) as RecurringTemplate | undefined;
    },
    insert(t) {
      const r = db.prepare(
        `INSERT INTO recurring_templates (description, category_id, card_id, amount_cents, day_of_month)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(t.description, t.category_id, t.card_id, t.amount_cents, t.day_of_month);
      return db.prepare('SELECT * FROM recurring_templates WHERE id=?').get(r.lastInsertRowid) as RecurringTemplate;
    },
    update(id, t) {
      return db.prepare(
        `UPDATE recurring_templates SET description=?, category_id=?, card_id=?, amount_cents=?, day_of_month=?, active=? WHERE id=?`,
      ).run(t.description, t.category_id, t.card_id, t.amount_cents, t.day_of_month, t.active, id).changes;
    },
    deactivate(id) {
      return db.prepare('UPDATE recurring_templates SET active=0 WHERE id=?').run(id).changes;
    },
    findChargeForMonth(templateId, month) {
      const row = db.prepare(
        `SELECT 1 FROM transactions WHERE recurring_template_id=? AND strftime('%Y-%m', date)=? LIMIT 1`,
      ).get(templateId, month);
      return row !== undefined;
    },
    insertCharge(c) {
      const r = db.prepare(
        `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, recurring_template_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(c.date, c.category_id, c.card_id, c.amount_cents, c.description, c.template_id);
      return r.lastInsertRowid as number;
    },
    lastChargeAmountBefore(templateId, month) {
      const row = db.prepare(
        `SELECT amount_cents FROM transactions
         WHERE recurring_template_id=? AND strftime('%Y-%m', date) < ?
         ORDER BY date DESC LIMIT 1`,
      ).get(templateId, month) as { amount_cents: number } | undefined;
      return row ? row.amount_cents : null;
    },
  };
}
```

- [ ] **Step 6: Run; confirm pass; commit**

Run: `npx tsx --test test/recurring.test.ts`
```bash
git add migrations/004_recurring.sql src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/recurring.ts test/recurring.test.ts
git commit -m "feat(recurring): migration + repository for subscription templates"
```

---

### Task 2: Date helper + use-case (CRUD + materialize) + wiring

**Files:**
- Modify: `src/domain/services/dates.ts` (`daysInMonth`, `chargeDate`)
- Create: `src/application/use-cases/recurring.ts`
- Modify: `src/infra/composition.ts` (repo + use-case)
- Test: `test/dates.test.ts` (append); `test/recurring.test.ts` (append)

**Interfaces:**
- Produces: `daysInMonth(month)`, `chargeDate(month, day)`; `makeRecurringUseCases({ recurring, categories, cards })` returning `list`, `create`, `update`, `remove`, `materialize(month): MaterializeResult`.

```ts
export interface MaterializeResult {
  created: number[];                                            // template ids charged this run
  skipped: number[];                                           // already had a charge this month
  changed: { template_id: number; from_cents: number; to_cents: number }[];
}
```

- [ ] **Step 1: Write the failing date-helper test**

Append to `test/dates.test.ts`:

```ts
const { daysInMonth, chargeDate } = require('../src/domain/services/dates');

test('chargeDate clamps the day to the month length', () => {
  assert.equal(chargeDate('2026-02', 31), '2026-02-28');
  assert.equal(chargeDate('2026-06', 5), '2026-06-05');
  assert.equal(chargeDate('2026-01', 31), '2026-01-31');
  assert.equal(daysInMonth('2024-02'), 29); // leap year
});
```

- [ ] **Step 2: Implement the helpers**

Append to `src/domain/services/dates.ts`:

```ts
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function chargeDate(month: string, day: number): string {
  const d = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}
```

- [ ] **Step 3: Run the date test; confirm pass**

Run: `npx tsx --test test/dates.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing materialize test**

Append to `test/recurring.test.ts`:

```ts
const { makeRecurringUseCases } = require('../src/application/use-cases/recurring');
const { makeCategoryRepository } = require('../src/infra/repositories/categories');
const { makeCardRepository } = require('../src/infra/repositories/cards');

function ucFor(ctx) {
  return makeRecurringUseCases({
    recurring: makeRecurringRepository(ctx.db),
    categories: makeCategoryRepository(ctx.db),
    cards: makeCardRepository(ctx.db),
  });
}

test('materialize creates one charge per active template and is idempotent', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({ description: 'Apple', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 1990, day_of_month: 10 });
  const uc = ucFor(ctx);
  const r1 = uc.materialize('2026-06');
  assert.deepEqual(r1.created, [t.id]);
  const r2 = uc.materialize('2026-06');           // second run: nothing new
  assert.deepEqual(r2.created, []);
  assert.deepEqual(r2.skipped, [t.id]);
  const row = ctx.db.prepare("SELECT date FROM transactions WHERE recurring_template_id=?").get(t.id);
  assert.equal(row.date, '2026-06-10');
});

test('materialize flags an amount change vs the prior month', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({ description: 'Seguro', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 5000, day_of_month: 1 });
  repo.insertCharge({ template_id: t.id, date: '2026-05-01', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 4500, description: 'Seguro' });
  const r = ucFor(ctx).materialize('2026-06');
  assert.deepEqual(r.changed, [{ template_id: t.id, from_cents: 4500, to_cents: 5000 }]);
});
```

- [ ] **Step 5: Implement the use-case**

Create `src/application/use-cases/recurring.ts`:

```ts
import type { RecurringRepository, CategoryRepository, CardRepository } from '../../domain/ports';
import type { RecurringTemplate } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import { chargeDate } from '../../domain/services/dates';

export interface RecurringUseCaseDeps {
  recurring: RecurringRepository; categories: CategoryRepository; cards: CardRepository;
}
export interface RecurringInput {
  description?: string; category_id: number; card_id: number; amount_cents: number; day_of_month: number;
}
export interface MaterializeResult {
  created: number[]; skipped: number[];
  changed: { template_id: number; from_cents: number; to_cents: number }[];
}

export function makeRecurringUseCases(deps: RecurringUseCaseDeps) {
  const { recurring, categories, cards } = deps;
  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  return {
    list(): RecurringTemplate[] { return recurring.list(); },

    create(input: RecurringInput): RecurringTemplate {
      assertRefs(input.category_id, input.card_id);
      return recurring.insert({ description: input.description ?? '', category_id: input.category_id,
        card_id: input.card_id, amount_cents: input.amount_cents, day_of_month: input.day_of_month });
    },

    update(id: number, input: RecurringInput): RecurringTemplate {
      assertRefs(input.category_id, input.card_id);
      const changes = recurring.update(id, { description: input.description ?? '',
        category_id: input.category_id, card_id: input.card_id, amount_cents: input.amount_cents,
        day_of_month: input.day_of_month, active: 1 });
      if (changes === 0) throw new AppError(404, 'recurring template not found');
      return recurring.findById(id) as RecurringTemplate;
    },

    remove(id: number): void {
      if (recurring.deactivate(id) === 0) throw new AppError(404, 'recurring template not found');
    },

    materialize(month: string): MaterializeResult {
      const result: MaterializeResult = { created: [], skipped: [], changed: [] };
      for (const t of recurring.listActive()) {
        if (recurring.findChargeForMonth(t.id, month)) { result.skipped.push(t.id); continue; }
        const last = recurring.lastChargeAmountBefore(t.id, month);
        recurring.insertCharge({ template_id: t.id, date: chargeDate(month, t.day_of_month),
          category_id: t.category_id, card_id: t.card_id, amount_cents: t.amount_cents,
          description: t.description });
        if (last !== null && last !== t.amount_cents) {
          result.changed.push({ template_id: t.id, from_cents: last, to_cents: t.amount_cents });
        }
        result.created.push(t.id);
      }
      return result;
    },
  };
}
```

- [ ] **Step 6: Wire into composition**

In `src/infra/composition.ts`: import `makeRecurringRepository`, `makeRecurringUseCases`, `makeRecurringController` (controller added in Task 3); add `recurring: makeRecurringRepository(db)` to `repositories`, `recurring: makeRecurringUseCases({ recurring: repositories.recurring, categories: repositories.categories, cards: repositories.cards })` to `useCases`, and (after Task 3) `recurring: makeRecurringController(useCases.recurring)` to `controllers`; add `recurring: express.Router;` to the `Container` interface.

- [ ] **Step 7: Run; confirm pass**

Run: `npx tsx --test test/recurring.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/domain/services/dates.ts src/application/use-cases/recurring.ts src/infra/composition.ts test/dates.test.ts test/recurring.test.ts
git commit -m "feat(recurring): use-case with idempotent monthly materialize"
```

---

### Task 3: HTTP controller + schema + route mount

**Files:**
- Create: `src/adapters/http/schemas/recurring.ts`
- Create: `src/adapters/http/controllers/recurring.ts`
- Modify: `src/app.ts:31` (mount `/api/recurring`)
- Test: `test/recurring.test.ts` (append API cases)

**Interfaces:**
- Produces: `GET/POST /api/recurring`, `PUT/DELETE /api/recurring/:id`, `POST /api/recurring/materialize` (`{ month }` → `MaterializeResult`).

- [ ] **Step 1: Write the failing API test**

```ts
const request = require('supertest');
const { createApp } = require('../src/app');

test('recurring CRUD + materialize over HTTP', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app).post('/api/recurring').send({ description: 'Netflix',
    category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 4590, day_of_month: 15 }).expect(201);
  assert.equal((await request(app).get('/api/recurring').expect(200)).body.length, 1);
  const res = await request(app).post('/api/recurring/materialize').send({ month: '2026-06' }).expect(200);
  assert.deepEqual(res.body.created, [made.body.id]);
  await request(app).delete(`/api/recurring/${made.body.id}`).expect(204);
  assert.equal((await request(app).get('/api/recurring').expect(200)).body.filter(t => t.active).length, 0);
});

test('POST /api/recurring with unknown card -> 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/recurring').send({ description: 'X', category_id: ctx.categoryId,
    card_id: 99999, amount_cents: 100, day_of_month: 1 }).expect(400);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/recurring.test.ts`
Expected: FAIL — `/api/recurring` 404.

- [ ] **Step 3: Write the schema**

Create `src/adapters/http/schemas/recurring.ts`:

```ts
import { z } from 'zod';
import { zPositiveInt } from './common';

const dayOfMonth = z.custom<number>(
  v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31,
  { message: 'day_of_month must be an integer 1..31' });

export const recurringBodySchema = z.object({
  category_id: zPositiveInt('category_id must be a positive integer'),
  card_id: zPositiveInt('card_id must be a positive integer'),
  amount_cents: zPositiveInt('amount_cents must be a positive integer'),
  day_of_month: dayOfMonth,
});

export const materializeSchema = z.object({
  month: z.custom<string>(v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v),
    { message: 'month must be YYYY-MM' }),
});
```

- [ ] **Step 4: Write the controller**

Create `src/adapters/http/controllers/recurring.ts`:

```ts
import express from 'express';
import { parse } from '../validate';
import { recurringBodySchema, materializeSchema } from '../schemas/recurring';
import type { makeRecurringUseCases } from '../../../application/use-cases/recurring';

type RecurringUseCases = ReturnType<typeof makeRecurringUseCases>;

export function makeRecurringController(uc: RecurringUseCases): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(uc.list()));

  router.post('/materialize', (req, res) => {
    const { month } = parse(materializeSchema, req.body);
    res.json(uc.materialize(month));
  });

  router.post('/', (req, res) => {
    parse(recurringBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    parse(recurringBodySchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 5: Mount it**

In `src/app.ts`, add after the simulate mount:

```ts
  app.use('/api/recurring', controllers.recurring);
```

(Plus the composition `controllers.recurring` + `Container` entry from Task 2.6.)

- [ ] **Step 6: Run; confirm pass + coverage**

Run: `npm run coverage`
Expected: PASS, ≥80%.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/http/schemas/recurring.ts src/adapters/http/controllers/recurring.ts src/app.ts src/infra/composition.ts test/recurring.test.ts
git commit -m "feat(recurring): REST endpoints + materialize"
```

---

### Task 4: Recurring frontend page

**Files:**
- Create: `public/recurring.html`
- Create: `public/js/recurring.js`
- Modify: `public/js/chrome.js` (nav item)
- Test: `test/recurringRender.test.ts` (new)

**Interfaces:**
- Produces: pure `renderList(rows, catName, cardName)` — but to avoid lookups, the page fetches categories/cards and passes name maps; the tested unit is `renderList(rows, names)` where `names = { cats: Map, cards: Map }`.

- [ ] **Step 1: Write the failing render test**

Create `test/recurringRender.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

test('renderList shows description, amount, day and actions', async () => {
  const { renderList } = await import('../public/js/recurring.js');
  const names = { cats: new Map([[1, 'Assinaturas']]), cards: new Map([[2, 'Nubank']]) };
  const html = renderList([{ id: 7, description: 'Claude', category_id: 1, card_id: 2,
    amount_cents: 10000, day_of_month: 5, active: 1 }], names);
  assert.match(html, /Claude/);
  assert.match(html, /Assinaturas/);
  assert.match(html, /R\$ 100,00/);
  assert.match(html, /day 5/);
  assert.match(html, /data-del="7"/);
});

test('renderList escapes the description', async () => {
  const { renderList } = await import('../public/js/recurring.js');
  const html = renderList([{ id: 1, description: '<x>', category_id: 1, card_id: 2,
    amount_cents: 100, day_of_month: 1, active: 1 }], { cats: new Map(), cards: new Map() });
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /&lt;x&gt;/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/recurringRender.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `public/js/recurring.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, esc, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

const $ = id => document.getElementById(id);
let names = { cats: new Map(), cards: new Map() };

export function renderList(rows, n) {
  if (!rows.length) return `<p class="paper-card text-ink-mut">No recurring templates yet.</p>`;
  return rows.filter(r => r.active).map(r => `
    <div class="paper-card flex items-center justify-between">
      <div>
        <div class="font-semibold">${esc(r.description) || 'Recurring'}</div>
        <div class="text-xs text-ink-mut">${esc(n.cats.get(r.category_id) || '')} · ${esc(n.cards.get(r.card_id) || '')} · day ${r.day_of_month}</div>
      </div>
      <div class="text-right">
        <div class="font-mono">${formatBRL(r.amount_cents)}</div>
        <button data-del="${r.id}" class="text-clay text-sm">Remove</button>
      </div>
    </div>`).join('');
}

async function load() {
  try {
    const [rows, cats, cards] = await Promise.all([
      api.get('/api/recurring'), api.get('/api/categories'), api.get('/api/cards')]);
    names = { cats: new Map(cats.map(c => [c.id, c.name])), cards: new Map(cards.map(c => [c.id, c.name])) };
    $('list').innerHTML = renderList(rows, names);
    $('list').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/recurring/${b.dataset.del}`); load(); } catch (e) { showError(e.message); }
      }));
    $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/recurring.html');
  $('month').value = currentMonth();
  $('addForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.post('/api/recurring', {
        description: $('description').value, category_id: Number($('category').value),
        card_id: Number($('card').value), amount_cents: Math.round(Number($('amount').value) * 100),
        day_of_month: Number($('day').value),
      });
      $('addForm').reset(); load();
    } catch (err) { showError(err.message); }
  });
  $('materialize').addEventListener('click', async () => {
    try {
      const r = await api.post('/api/recurring/materialize', { month: $('month').value });
      const changed = r.changed.map(c => `${formatBRL(c.from_cents)}→${formatBRL(c.to_cents)}`).join(', ');
      showError(`Created ${r.created.length}, skipped ${r.skipped.length}${changed ? ` · changed: ${changed}` : ''}`);
    } catch (e) { showError(e.message); }
  });
  load();
}
```

- [ ] **Step 4: Create `public/recurring.html`**

Reuse the `transactions.html` shell. Body: a month input + "Materialize this month" button (`id="materialize"`), a `#list` container, and an add form (`id="addForm"`) with `description`, `category` (select), `card` (select), `amount` (number), `day` (number 1–31). Script: `<script type="module" src="/js/recurring.js"></script>`.

- [ ] **Step 5: Add nav item**

In `public/js/chrome.js` `NAV_ITEMS`, add `{ href: '/recurring.html', label: 'Recurring', route: '/recurring.html' }`. Update `test/chrome.test.ts` if it asserts the nav set; re-run it.

- [ ] **Step 6: Run render test + manual smoke**

Run: `npx tsx --test test/recurringRender.test.ts`
Then `npm start`: add a template, click Materialize, confirm a transaction appears on the Transactions page for the month; click again → "Created 0, skipped 1". Stop the server.

- [ ] **Step 7: Commit**

```bash
git add public/recurring.html public/js/recurring.js public/js/chrome.js test/recurringRender.test.ts test/chrome.test.ts
git commit -m "feat(recurring): templates page with one-click materialize"
```

---

### Task 5: Savings-over-time BI series (API)

**Files:**
- Modify: `src/application/use-cases/bi.ts` (`savingsTrend`)
- Modify: `src/infra/composition.ts:83` (add `settings` dep to bi)
- Modify: `src/adapters/http/controllers/bi.ts` (route)
- Test: `test/bi.test.ts` (append)

**Interfaces:**
- Consumes: `ReportRepository.spendAllMonth`, `SettingsRepository.get`, `monthRange`.
- Produces: `BiUseCases.savingsTrend(from, to)` → `{ months, series: [{ name: 'Projected savings', spent_cents }, { name: 'Goal', spent_cents }] }`; `GET /api/bi/savings-trend?from=&to=`.

- [ ] **Step 1: Write the failing test**

Append to `test/bi.test.ts`:

```ts
test('savingsTrend = income - fixed - spend, vs goal', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/settings').send({ monthly_income: 1000000, fixed_costs: 300000, savings_goal: 200000 }).expect(200);
  await request(app).post('/api/transactions').send({ date: '2026-06-10', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 100000, description: 'x' }).expect(201);
  const res = await request(app).get('/api/bi/savings-trend?from=2026-06&to=2026-06').expect(200);
  const projected = res.body.series.find(s => s.name === 'Projected savings');
  const goal = res.body.series.find(s => s.name === 'Goal');
  assert.equal(projected.spent_cents[0], 600000); // 1,000,000 - 300,000 - 100,000
  assert.equal(goal.spent_cents[0], 200000);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/bi.test.ts`
Expected: FAIL — route 404.

- [ ] **Step 3: Extend the BI use-case**

In `src/application/use-cases/bi.ts`, add `SettingsRepository` to deps:

```ts
import type {
  ReportRepository, LimitRepository, CategoryRepository, CardRepository, GroupRepository, SettingsRepository,
} from '../../domain/ports';
```
```ts
export interface BiUseCaseDeps {
  reports: ReportRepository; limits: LimitRepository; categories: CategoryRepository;
  cards: CardRepository; groups: GroupRepository; settings: SettingsRepository;
}
```

Destructure `settings` and add the method:

```ts
    savingsTrend(from: string, to: string) {
      const months = monthRange(from, to);
      const num = (k: string) => { const v = settings.get(k); return v !== undefined ? Number(v) : 0; };
      const income = num('monthly_income');
      const fixed = num('fixed_costs');
      const goal = num('savings_goal');
      const projected = months.map(m => income - fixed - reports.spendAllMonth(m));
      return {
        months,
        series: [
          { name: 'Projected savings', spent_cents: projected },
          { name: 'Goal', spent_cents: months.map(() => goal) },
        ],
      };
    },
```

- [ ] **Step 4: Wire settings into bi composition**

In `src/infra/composition.ts`:

```ts
    bi: makeBiUseCases({
      reports: repositories.reports, limits: repositories.limits,
      categories: repositories.categories, cards: repositories.cards,
      groups: repositories.groups, settings: repositories.settings,
    }),
```

- [ ] **Step 5: Add the route**

In `src/adapters/http/controllers/bi.ts`, add with the other range routes:

```ts
  router.get('/savings-trend', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.savingsTrend(from, to));
  });
```

- [ ] **Step 6: Run; confirm pass + coverage**

Run: `npm run coverage`
Expected: PASS, ≥80%.

- [ ] **Step 7: Commit**

```bash
git add src/application/use-cases/bi.ts src/infra/composition.ts src/adapters/http/controllers/bi.ts test/bi.test.ts
git commit -m "feat(bi): savings-over-time series (projected vs goal)"
```

---

### Task 6: Savings-history chart (frontend)

**Files:**
- Modify: `public/bi.html` (canvas + heading)
- Modify: `public/js/bi.js`

**Interfaces:**
- Consumes: `GET /api/bi/savings-trend?from=&to=`, `lineChart`.

- [ ] **Step 1: Add a canvas to `bi.html`**

Add a chart card mirroring the existing ones:

```html
<section class="paper-card mt-6">
  <h2 class="font-display text-xl mb-1">Savings over time</h2>
  <p class="text-xs text-ink-mut mb-3">Projected savings (income − fixed − spend) vs goal, using current settings.</p>
  <canvas id="savingsTrend"></canvas>
</section>
```

- [ ] **Step 2: Fetch + render in `bi.js`**

Add `savings-trend` to the `Promise.all` and draw it:

```js
    const [trends, byCard, byGroup, bva, forecast, savings] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`), api.get(`/api/bi/by-card?${qs}`), api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`), api.get(`/api/bi/installment-forecast?${qs}`),
      api.get(`/api/bi/savings-trend?${qs}`),
    ]);
    ...
    lineChart('savingsTrend', savings.months, savings.series, false);
```

- [ ] **Step 3: Manual smoke**

Run: `npm start` → BI page shows the new chart with a projected line vs a flat goal line. Stop the server.

- [ ] **Step 4: Full suite + commit**

Run: `npm run coverage`
```bash
git add public/bi.html public/js/bi.js
git commit -m "feat(bi): savings-over-time chart on the BI page"
```

---

## Self-Review

- **Spec coverage:** recurring templates (migration/repo Task 1, use-case+materialize Task 2, API Task 3, UI Task 4) — covers "one-click materialize each month's charges, flagging when an amount changed"; savings history (API Task 5, chart Task 6) — "income − fixed − actual spend per month, vs goal".
- **Placeholder scan:** the two HTML shells (4.4, 6.1) reference `transactions.html`/existing chart cards for boilerplate, which exist; no TODOs.
- **Type consistency:** `RecurringTemplate` defined once (Task 1) and used by repo/use-case/render. `RecurringInput` shape `{ description?, category_id, card_id, amount_cents, day_of_month }` matches schema (Task 3) and use-case (Task 2). `MaterializeResult` identical in use-case and tests. `chargeDate(month, day)` consistent. BI series use the `{ name, spent_cents }` shape that `datasetsFor`/`lineChart` require, so the savings chart reuses the existing renderer unchanged.
- **Migration safety:** `004_recurring.sql` runs in tests (helper skips only `002_seed.sql`); `ALTER TABLE ADD COLUMN` is additive and compatible with existing rows.
