# Phase 1 — Installments Command-Center ("Parcelas") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give installment groups a first-class overview page (remaining balance, parcelas paid/left, monthly amount, next charge), plus atomic **edit** (re-expand) and **pay-off early** — closing the spec gap where only create/delete exist.

**Architecture:** Extend the existing `InstallmentRepository` port and its better-sqlite3 implementation with read (`listWithProgress`) and write (`update`, `payOffEarly`) operations; surface them through the installments use-case, the existing `/api/installment-groups` controller, and a new `public/parcelas.html` page. All multi-row writes stay inside a single SQLite transaction, mirroring `createPurchase`.

**Tech Stack:** TypeScript hexagonal (domain/application/adapters/infra), Express 5, better-sqlite3, zod, `node:test` + supertest, vanilla ESM frontend.

## Global Constraints

(Identical to Phase 0 — repeated so this plan stands alone.)

- Node 22; money in integer **cents**; months `YYYY-MM`, dates `YYYY-MM-DD`.
- Hexagonal layering, deps inward. Ports in `src/domain/ports/index.ts`, entities in `src/domain/entities/index.ts`, errors via `AppError(status, message)`.
- Tests are CommonJS `require('node:test')` in `test/*.test.ts`; DB tests use `makeTestDb()` (in-memory, all migrations except `002_seed.sql`); API tests use `supertest` + `createApp(ctx.db)`.
- Coverage ≥80% over `src/**/*.ts` (`npm run coverage`).
- HTTP validation via zod schemas + `parse()`; existence rules in use-cases.
- Frontend render functions are pure and unit-tested by importing the module and asserting on the HTML string; DOM bootstrap (the `if (typeof document !== 'undefined')` block) follows existing pages and is not unit-tested.
- Commit after each task.

## Design Decisions (review before executing)

1. **"Paid" vs "remaining" is split by an `asOf` month.** A parcela whose month ≤ `asOf` counts as landed/paid; month > `asOf` is remaining. `asOf` defaults to the server's current month, overridable via `?month=YYYY-MM`. There is no separate "paid" flag — parcelas are just dated transactions, so this is the natural definition.
2. **`monthly_cents` = the largest child amount.** `splitCents` puts the remainder cent on the first parcelas, so the max child is the representative headline figure.
3. **Pay-off early collapses the remaining schedule into the current month** — it re-dates every not-yet-landed parcela (month > `asOf`) to `${asOf}-01`, so the whole remaining balance hits this month's spend (exactly what paying a card off early does to the statement). `total_cents`/`total_count` are unchanged, preserving the invariant that children sum to `total_cents`. This keeps history intact and is fully reversible by editing.

---

### Task 1: Repository read — `listWithProgress`

**Files:**
- Modify: `src/domain/entities/index.ts` (add `InstallmentProgress`)
- Modify: `src/domain/ports/index.ts:54-61` (extend `InstallmentRepository`)
- Modify: `src/infra/repositories/installments.ts`
- Test: `test/installments.test.ts` (append)

**Interfaces:**
- Produces: `InstallmentProgress` entity and `InstallmentRepository.listWithProgress(asOfMonth: string): InstallmentProgress[]`.

```ts
// src/domain/entities/index.ts
export interface InstallmentProgress {
  id: number; description: string; category_id: number; card_id: number;
  category_name: string; card_name: string;
  total_cents: number; total_count: number; first_month: string;
  paid_count: number; remaining_count: number;
  paid_cents: number; remaining_cents: number;
  monthly_cents: number; next_month: string | null;
}
```

- [ ] **Step 1: Write the failing test**

Append to `test/installments.test.ts`:

```ts
const { makeInstallmentRepository } = require('../src/infra/repositories/installments');

test('listWithProgress splits paid/remaining by asOf month', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({ category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', total_cents: 60000, count: 6, first_month: '2026-06' });
  // June, July, Aug landed (<= 2026-08); Sep, Oct, Nov remaining.
  const rows = repo.listWithProgress('2026-08');
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.id, id);
  assert.equal(r.category_name, 'Supermercado');
  assert.equal(r.card_name, 'Nubank');
  assert.equal(r.total_count, 6);
  assert.equal(r.paid_count, 3);
  assert.equal(r.remaining_count, 3);
  assert.equal(r.paid_cents, 30000);
  assert.equal(r.remaining_cents, 30000);
  assert.equal(r.monthly_cents, 10000);
  assert.equal(r.next_month, '2026-09');
});
```

- [ ] **Step 2: Run it; confirm it fails**

Run: `npx tsx --test test/installments.test.ts`
Expected: FAIL — `repo.listWithProgress is not a function`.

- [ ] **Step 3: Add the port method**

In `src/domain/ports/index.ts`, add to `InstallmentRepository` (and import `InstallmentProgress`):

```ts
import type { Group, Category, Card, Transaction, InstallmentProgress } from '../entities';
```
```ts
  listWithProgress(asOfMonth: string): InstallmentProgress[];
```

- [ ] **Step 4: Implement it**

In `src/infra/repositories/installments.ts`, add to the returned object:

```ts
    listWithProgress(asOfMonth: string) {
      return db.prepare(
        `SELECT g.id, g.description, g.category_id, g.card_id,
                cat.name AS category_name, crd.name AS card_name,
                g.total_cents, g.total_count, g.first_month,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN 1 ELSE 0 END), 0) AS paid_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN 1 ELSE 0 END), 0) AS remaining_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN t.amount_cents ELSE 0 END), 0) AS paid_cents,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN t.amount_cents ELSE 0 END), 0) AS remaining_cents,
                COALESCE(MAX(t.amount_cents), 0) AS monthly_cents,
                MIN(CASE WHEN strftime('%Y-%m', t.date) > @asOf THEN strftime('%Y-%m', t.date) END) AS next_month
         FROM installment_groups g
         JOIN categories cat ON cat.id = g.category_id
         JOIN cards crd ON crd.id = g.card_id
         LEFT JOIN transactions t ON t.installment_group_id = g.id
         GROUP BY g.id
         ORDER BY g.first_month, g.id`,
      ).all({ asOf: asOfMonth }) as import('../../domain/entities').InstallmentProgress[];
    },
```

- [ ] **Step 5: Run the test; confirm pass**

Run: `npx tsx --test test/installments.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/installments.ts test/installments.test.ts
git commit -m "feat(installments): repository listWithProgress for the overview"
```

---

### Task 2: Repository write — `update` (atomic re-expand)

**Files:**
- Modify: `src/domain/ports/index.ts` (`InstallmentRepository.update`)
- Modify: `src/infra/repositories/installments.ts`
- Test: `test/installments.test.ts` (append)

**Interfaces:**
- Produces: `InstallmentRepository.update(id: number, p: { category_id: number; card_id: number; description?: string; total_cents: number; count: number; first_month: string }): void` — throws `AppError(404)` if the group is absent.

- [ ] **Step 1: Write the failing tests**

```ts
const { AppError } = require('../src/domain/errors');

test('update re-expands children to the new count/total atomically', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({ category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'TV', total_cents: 60000, count: 6, first_month: '2026-06' });
  repo.update(id, { category_id: ctx.categoryId, card_id: ctx.cardId, description: 'TV',
    total_cents: 30000, count: 3, first_month: '2026-07' });
  const all = ctx.db.prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date').all(id);
  assert.equal(all.length, 3);
  assert.deepEqual(all.map(t => t.date.slice(0, 7)), ['2026-07', '2026-08', '2026-09']);
  assert.equal(all.reduce((s, t) => s + t.amount_cents, 0), 30000);
  assert.equal(all[0].installment_total, 3);
  const g = ctx.db.prepare('SELECT * FROM installment_groups WHERE id=?').get(id);
  assert.equal(g.total_count, 3);
  assert.equal(g.first_month, '2026-07');
});

test('update on a missing group throws 404', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  assert.throws(
    () => repo.update(9999, { category_id: ctx.categoryId, card_id: ctx.cardId,
      description: '', total_cents: 1000, count: 2, first_month: '2026-06' }),
    (e) => e instanceof AppError && e.status === 404);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/installments.test.ts`
Expected: FAIL — `repo.update is not a function`.

- [ ] **Step 3: Add the port method**

In `src/domain/ports/index.ts` `InstallmentRepository`:

```ts
  update(id: number, p: {
    category_id: number; card_id: number; description?: string;
    total_cents: number; count: number; first_month: string;
  }): void;                              // atomic re-expand; throws AppError(404) if absent
```

- [ ] **Step 4: Implement it**

In `src/infra/repositories/installments.ts` (reuses `splitCents`, `addMonths`, `AppError` already imported):

```ts
    update(id, p): void {
      const { category_id, card_id, description = '', total_cents, count, first_month } = p;
      const tx = db.transaction(() => {
        const exists = db.prepare('SELECT id FROM installment_groups WHERE id=?').get(id);
        if (!exists) throw new AppError(404, 'installment group not found');
        db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
        db.prepare(
          `UPDATE installment_groups
           SET description=?, total_cents=?, total_count=?, first_month=?, category_id=?, card_id=?
           WHERE id=?`,
        ).run(description, total_cents, count, first_month, category_id, card_id, id);
        const amounts = splitCents(total_cents, count);
        const insert = db.prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
            installment_group_id, installment_no, installment_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        amounts.forEach((amt, i) => {
          const month = addMonths(first_month, i);
          insert.run(`${month}-01`, category_id, card_id, amt, description, id, i + 1, count);
        });
      });
      tx();
    },
```

- [ ] **Step 5: Run; confirm pass**

Run: `npx tsx --test test/installments.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/ports/index.ts src/infra/repositories/installments.ts test/installments.test.ts
git commit -m "feat(installments): atomic update (re-expand) in the repository"
```

---

### Task 3: Use-case `list` + `update` (with reference checks) and DI wiring

**Files:**
- Modify: `src/application/use-cases/installments.ts`
- Modify: `src/infra/composition.ts:73` (pass categories + cards)
- Test: `test/installments.test.ts` (append)

**Interfaces:**
- Consumes: `InstallmentRepository.listWithProgress`, `.update`; `CategoryRepository.findById`, `CardRepository.findById`.
- Produces: `makeInstallmentUseCases({ installments, categories, cards })` now also returns `list(asOfMonth: string): InstallmentProgress[]` and `update(id: number, input: UpdateInstallmentInput): void` (throws `AppError(400)` for unknown category/card).

```ts
export interface UpdateInstallmentInput {
  category_id: number; card_id: number; description?: string;
  total_cents: number; count: number; first_month: string;
}
```

- [ ] **Step 1: Write the failing test (use-case wiring)**

```ts
const { createApp } = require('../src/app'); // already imported at top of file

test('use-case update rejects an unknown category with 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).post('/api/transactions').send({ category_id: ctx.categoryId,
    card_id: ctx.cardId, description: 'X', installment_total_cents: 1200, installment_count: 2,
    first_month: '2026-06' }).expect(201);
  await request(app).put(`/api/installment-groups/${res.body.installment_group_id}`).send({
    category_id: 999999, card_id: ctx.cardId, total_cents: 1200, count: 2, first_month: '2026-06',
  }).expect(400);
});
```

(This drives Tasks 3+4 together; it stays red until the controller exists in Task 4. Run it after Task 4. For Task 3, prove the use-case in isolation with the assertion below.)

```ts
const { makeInstallmentUseCases } = require('../src/application/use-cases/installments');
const { makeCategoryRepository } = require('../src/infra/repositories/categories');
const { makeCardRepository } = require('../src/infra/repositories/cards');

test('use-case list returns progress rows', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  repo.createPurchase({ category_id: ctx.categoryId, card_id: ctx.cardId, description: 'A',
    total_cents: 1200, count: 2, first_month: '2026-06' });
  const uc = makeInstallmentUseCases({ installments: repo,
    categories: makeCategoryRepository(ctx.db), cards: makeCardRepository(ctx.db) });
  assert.equal(uc.list('2026-06').length, 1);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/installments.test.ts`
Expected: FAIL — `makeInstallmentUseCases` does not accept categories/cards / `uc.list` undefined.

- [ ] **Step 3: Rewrite the use-case**

Replace `src/application/use-cases/installments.ts` with:

```ts
import type {
  InstallmentRepository, CategoryRepository, CardRepository,
} from '../../domain/ports';
import type { InstallmentProgress } from '../../domain/entities';
import { AppError } from '../../domain/errors';

export interface InstallmentUseCaseDeps {
  installments: InstallmentRepository;
  categories: CategoryRepository;
  cards: CardRepository;
}

export interface UpdateInstallmentInput {
  category_id: number; card_id: number; description?: string;
  total_cents: number; count: number; first_month: string;
}

export function makeInstallmentUseCases(deps: InstallmentUseCaseDeps) {
  const { installments, categories, cards } = deps;

  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  return {
    list(asOfMonth: string): InstallmentProgress[] {
      return installments.listWithProgress(asOfMonth);
    },
    update(id: number, input: UpdateInstallmentInput): void {
      assertRefs(input.category_id, input.card_id);
      installments.update(id, input);
    },
    // Throws AppError(404) from the repository if the group does not exist.
    remove(id: number): void {
      installments.remove(id);
    },
  };
}
```

- [ ] **Step 4: Wire categories + cards in composition**

In `src/infra/composition.ts`, change the installments use-case construction:

```ts
    installments: makeInstallmentUseCases({
      installments: repositories.installments,
      categories: repositories.categories,
      cards: repositories.cards,
    }),
```

- [ ] **Step 5: Run; confirm the `list` test passes**

Run: `npx tsx --test test/installments.test.ts`
Expected: the `use-case list` test passes; the `update rejects unknown category` test still fails (needs the controller — Task 4).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/application/use-cases/installments.ts src/infra/composition.ts test/installments.test.ts
git commit -m "feat(installments): list + update use-cases with reference checks"
```

---

### Task 4: HTTP — `GET /` overview and `PUT /:id` edit

**Files:**
- Create: `src/adapters/http/schemas/installments.ts`
- Modify: `src/adapters/http/controllers/installmentGroups.ts`
- Test: `test/installments.test.ts` (append)

**Interfaces:**
- Consumes: `InstallmentUseCases.list`, `.update`; `parse()`; `zPositiveInt`, `zMonth` from `schemas/common`.
- Produces: `GET /api/installment-groups?month=YYYY-MM` → `InstallmentProgress[]`; `PUT /api/installment-groups/:id` → `204`.

- [ ] **Step 1: Write the failing API tests**

```ts
test('GET /api/installment-groups returns progress rows', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({ category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', installment_total_cents: 60000, installment_count: 6, first_month: '2026-06' }).expect(201);
  const res = await request(app).get('/api/installment-groups?month=2026-08').expect(200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].remaining_count, 3);
  assert.equal(res.body[0].monthly_cents, 10000);
});

test('PUT /api/installment-groups/:id re-expands the schedule', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app).post('/api/transactions').send({ category_id: ctx.categoryId,
    card_id: ctx.cardId, description: 'TV', installment_total_cents: 60000, installment_count: 6,
    first_month: '2026-06' }).expect(201);
  await request(app).put(`/api/installment-groups/${made.body.installment_group_id}`).send({
    category_id: ctx.categoryId, card_id: ctx.cardId, description: 'TV',
    total_cents: 30000, count: 3, first_month: '2026-07',
  }).expect(204);
  const n = ctx.db.prepare('SELECT COUNT(*) n FROM transactions WHERE installment_group_id=?')
    .get(made.body.installment_group_id).n;
  assert.equal(n, 3);
});

test('PUT with a bad month returns 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app).post('/api/transactions').send({ category_id: ctx.categoryId,
    card_id: ctx.cardId, description: 'TV', installment_total_cents: 1200, installment_count: 2,
    first_month: '2026-06' }).expect(201);
  await request(app).put(`/api/installment-groups/${made.body.installment_group_id}`).send({
    category_id: ctx.categoryId, card_id: ctx.cardId, total_cents: 1200, count: 2, first_month: 'June',
  }).expect(400);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/installments.test.ts`
Expected: FAIL — `GET /api/installment-groups` 404s (no route) and PUT 404s.

- [ ] **Step 3: Write the schema**

Create `src/adapters/http/schemas/installments.ts`:

```ts
import { z } from 'zod';
import { zMonth, zPositiveInt } from './common';

export const updateInstallmentSchema = z.object({
  category_id: zPositiveInt('category_id must be a positive integer'),
  card_id: zPositiveInt('card_id must be a positive integer'),
  total_cents: zPositiveInt('total_cents must be a positive integer'),
  count: zPositiveInt('count must be a positive integer'),
  first_month: zMonth('first_month must be YYYY-MM'),
});
```

- [ ] **Step 4: Extend the controller**

Replace `src/adapters/http/controllers/installmentGroups.ts` with:

```ts
import express from 'express';
import { parse } from '../validate';
import { updateInstallmentSchema } from '../schemas/installments';
import type { makeInstallmentUseCases } from '../../../application/use-cases/installments';

type InstallmentUseCases = ReturnType<typeof makeInstallmentUseCases>;

export function makeInstallmentGroupsController(uc: InstallmentUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { MONTH_RE } = require('../schemas/common');
    const q = req.query.month;
    const month = (typeof q === 'string' && MONTH_RE.test(q))
      ? q : new Date().toISOString().slice(0, 7);
    res.json(uc.list(month));
  });

  router.put('/:id', (req, res) => {
    const body = parse(updateInstallmentSchema, req.body);
    uc.update(Number(req.params.id), { ...body, description: req.body.description ?? '' });
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
```

(Replace the inline `require` with a top `import { MONTH_RE } from '../schemas/common';` if you prefer — keep consistent with the file's import style.)

- [ ] **Step 5: Run installments + app tests; confirm pass**

Run: `npx tsx --test test/installments.test.ts test/app.test.ts`
Expected: PASS, including the Task 3 "update rejects unknown category 400" test.

- [ ] **Step 6: Full suite + coverage + commit**

Run: `npm run coverage`
Expected: pass, ≥80%.
```bash
git add src/adapters/http/schemas/installments.ts src/adapters/http/controllers/installmentGroups.ts test/installments.test.ts
git commit -m "feat(installments): GET overview + PUT edit endpoints"
```

---

### Task 5: Frontend — the Parcelas page

**Files:**
- Create: `public/parcelas.html`
- Create: `public/js/parcelas.js`
- Modify: `public/js/chrome.js:1-7` (add nav item)
- Test: `test/parcelasRender.test.ts` (new)

**Interfaces:**
- Consumes: `api` (`api.js`), `formatBRL`/`esc` (`format.js`), `mountChrome` (`chrome.js`).
- Produces: pure `renderGroups(rows: InstallmentProgress[]): string`.

- [ ] **Step 1: Write the failing render test**

Create `test/parcelasRender.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

const row = {
  id: 1, description: 'Avianca', category_name: 'Viagens', card_name: 'Nubank',
  total_cents: 60000, total_count: 6, paid_count: 3, remaining_count: 3,
  paid_cents: 30000, remaining_cents: 30000, monthly_cents: 10000, next_month: '2026-09',
};

test('renderGroups shows progress, monthly and remaining', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  const html = renderGroups([row]);
  assert.match(html, /Avianca/);
  assert.match(html, /Viagens/);
  assert.match(html, /3\/6/);             // parcelas paid/total
  assert.match(html, /R\$ 100,00/);       // monthly
  assert.match(html, /R\$ 300,00/);       // remaining balance
  assert.match(html, /2026-09/);          // next charge
  assert.match(html, /data-edit="1"/);
  assert.match(html, /data-del="1"/);
});

test('renderGroups escapes the description', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  const html = renderGroups([{ ...row, description: '<x>' }]);
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /&lt;x&gt;/);
});

test('renderGroups shows an empty state', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  assert.match(renderGroups([]), /No installment/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/parcelasRender.test.ts`
Expected: FAIL — cannot resolve `../public/js/parcelas.js`.

- [ ] **Step 3: Write `public/js/parcelas.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, esc, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

const $ = id => document.getElementById(id);

export function renderGroups(rows) {
  if (!rows.length) {
    return `<p class="paper-card text-ink-mut">No installment purchases yet.</p>`;
  }
  return rows.map(r => `
    <div class="paper-card" data-row="${r.id}">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold">${esc(r.description) || 'Installment'}</div>
          <div class="text-xs text-ink-mut mt-0.5">${esc(r.category_name)} · ${esc(r.card_name)}</div>
        </div>
        <span class="tag tag-gold">${r.paid_count}/${r.total_count}</span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><div class="text-ink-mut text-xs">Monthly</div><div class="font-mono">${formatBRL(r.monthly_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Remaining</div><div class="font-mono">${formatBRL(r.remaining_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Next</div><div class="font-mono">${r.next_month || '—'}</div></div>
      </div>
      <div class="mt-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Edit</button>
        ${r.remaining_count > 0 ? `<button data-payoff="${r.id}" class="text-sage text-sm mr-2">Pay off early</button>` : ''}
        <button data-del="${r.id}" class="text-clay text-sm">Delete</button>
      </div>
    </div>`).join('');
}

async function load() {
  try {
    const rows = await api.get(`/api/installment-groups?month=${$('month').value}`);
    $('list').innerHTML = renderGroups(rows);
    wire(rows);
  } catch (e) { showError(e.message); }
}

function wire(rows) {
  $('list').querySelectorAll('button[data-del]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this installment group (all parcelas)?')) return;
      try { await api.del(`/api/installment-groups/${b.dataset.del}`); load(); }
      catch (e) { showError(e.message); }
    }));
  $('list').querySelectorAll('button[data-payoff]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Pay off early? Remaining parcelas move into this month.')) return;
      try { await api.post(`/api/installment-groups/${b.dataset.payoff}/payoff`,
        { month: $('month').value }); load(); }
      catch (e) { showError(e.message); }
    }));
  $('list').querySelectorAll('button[data-edit]').forEach(b =>
    b.addEventListener('click', () => startEdit(rows.find(r => r.id === Number(b.dataset.edit)))));
}

function startEdit(r) {
  if (!r) return;
  $('editId').value = r.id;
  $('e_description').value = r.description;
  $('e_total').value = (r.total_cents / 100).toFixed(2);
  $('e_count').value = r.total_count;
  $('e_firstMonth').value = r.first_month;
  $('editCard').style.display = 'block';
  $('editCard').scrollIntoView({ block: 'center' });
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/parcelas.html');
  $('month').value = currentMonth();
  $('month').addEventListener('change', load);
  $('editForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.put(`/api/installment-groups/${$('editId').value}`, {
        category_id: Number($('e_category').value),
        card_id: Number($('e_card').value),
        description: $('e_description').value,
        total_cents: Math.round(Number($('e_total').value) * 100),
        count: Number($('e_count').value),
        first_month: $('e_firstMonth').value,
      });
      $('editCard').style.display = 'none';
      load();
    } catch (err) { showError(err.message); }
  });
  // populate category/card selects in the edit form
  Promise.all([api.get('/api/categories'), api.get('/api/cards')]).then(([cats, cards]) => {
    $('e_category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('e_card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }).catch(e => showError(e.message));
  load();
}
```

- [ ] **Step 4: Run the render test; confirm pass**

Run: `npx tsx --test test/parcelasRender.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `public/parcelas.html`**

Copy the shell of `public/transactions.html` (same `<head>`, fonts, `app.css`, `<div id="nav">`, Chart.js not needed). Body skeleton:

```html
<main class="max-w-5xl mx-auto px-6 py-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="font-display text-3xl">Parcelas</h1>
    <input type="month" id="month" class="rounded border border-line bg-card px-3 py-2" />
  </div>
  <div id="list" class="space-y-4"></div>

  <div id="editCard" class="paper-card mt-8" style="display:none">
    <h2 class="font-display text-xl mb-4">Edit installment</h2>
    <form id="editForm" class="grid gap-3 md:grid-cols-2">
      <input type="hidden" id="editId" />
      <label class="block">Description <input id="e_description" class="w-full rounded border border-line px-2 py-1" /></label>
      <label class="block">Category <select id="e_category" class="w-full rounded border border-line px-2 py-1"></select></label>
      <label class="block">Card <select id="e_card" class="w-full rounded border border-line px-2 py-1"></select></label>
      <label class="block">Total (R$) <input id="e_total" type="number" step="0.01" class="w-full rounded border border-line px-2 py-1" /></label>
      <label class="block">Parcelas <input id="e_count" type="number" min="1" class="w-full rounded border border-line px-2 py-1" /></label>
      <label class="block">First month <input id="e_firstMonth" type="month" class="w-full rounded border border-line px-2 py-1" /></label>
      <div class="md:col-span-2 text-right"><button class="btn-primary">Save</button></div>
    </form>
  </div>
</main>
<script type="module" src="/js/parcelas.js"></script>
```

- [ ] **Step 6: Add the nav item**

In `public/js/chrome.js`, add to `NAV_ITEMS` after Transactions:

```js
  { href: '/parcelas.html', label: 'Parcelas', route: '/parcelas.html' },
```

- [ ] **Step 7: Update the nav test if present**

Run: `grep -rn "NAV_ITEMS\|renderNav" test/`
If `test/chrome.test.ts` asserts the item count or list, update it to include `Parcelas`. Run: `npx tsx --test test/chrome.test.ts` → PASS.

- [ ] **Step 8: Manual smoke**

Run: `npm start` → open `http://localhost:3000/parcelas.html`, create an installment on Transactions, confirm it appears with the right paid/left and that Edit re-expands. (Then stop the server.)

- [ ] **Step 9: Full suite + commit**

Run: `npm run coverage`
```bash
git add public/parcelas.html public/js/parcelas.js public/js/chrome.js test/parcelasRender.test.ts test/chrome.test.ts
git commit -m "feat(installments): Parcelas overview page with inline edit"
```

---

### Task 6: Pay off early

**Files:**
- Modify: `src/domain/ports/index.ts` (`InstallmentRepository.payOffEarly`)
- Modify: `src/infra/repositories/installments.ts`
- Modify: `src/application/use-cases/installments.ts` (`payOff`)
- Modify: `src/adapters/http/controllers/installmentGroups.ts` (`POST /:id/payoff`)
- Test: `test/installments.test.ts` (append)

**Interfaces:**
- Produces: `InstallmentRepository.payOffEarly(id: number, asOfMonth: string): void` (throws `AppError(404)` if absent, `AppError(400)` if nothing to pay off); use-case `payOff(id, asOfMonth)`; `POST /api/installment-groups/:id/payoff` body `{ month }` → `204`.

- [ ] **Step 1: Write the failing tests**

```ts
test('payOffEarly collapses future parcelas into asOf month', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({ category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'TV', total_cents: 60000, count: 6, first_month: '2026-06' });
  repo.payOffEarly(id, '2026-08');
  const rows = repo.listWithProgress('2026-08');
  assert.equal(rows[0].remaining_count, 0);
  assert.equal(rows[0].paid_cents, 60000);
  // August now carries June..Aug parcelas plus the 3 collapsed ones.
  const aug = ctx.db.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) s FROM transactions WHERE installment_group_id=? AND strftime('%Y-%m',date)='2026-08'").get(id).s;
  assert.equal(aug, 40000); // Aug parcela 10000 + Sep/Oct/Nov 30000 moved in
});

test('payOffEarly with nothing left throws 400', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({ category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'TV', total_cents: 1200, count: 2, first_month: '2026-06' });
  assert.throws(() => repo.payOffEarly(id, '2027-01'), (e) => e.status === 400);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/installments.test.ts`
Expected: FAIL — `repo.payOffEarly is not a function`.

- [ ] **Step 3: Add the port method + implementation**

Port (`InstallmentRepository`):

```ts
  payOffEarly(id: number, asOfMonth: string): void; // re-date remaining parcelas to asOf; 404/400
```

Repository:

```ts
    payOffEarly(id, asOfMonth): void {
      const tx = db.transaction(() => {
        const exists = db.prepare('SELECT id FROM installment_groups WHERE id=?').get(id);
        if (!exists) throw new AppError(404, 'installment group not found');
        const r = db.prepare(
          `UPDATE transactions SET date=@date
           WHERE installment_group_id=@id AND strftime('%Y-%m', date) > @asOf`,
        ).run({ date: `${asOfMonth}-01`, id, asOf: asOfMonth });
        if (r.changes === 0) throw new AppError(400, 'no future parcelas to pay off');
      });
      tx();
    },
```

- [ ] **Step 4: Use-case + controller**

Use-case `makeInstallmentUseCases` return object — add:

```ts
    payOff(id: number, asOfMonth: string): void {
      installments.payOffEarly(id, asOfMonth);
    },
```

Controller — add before the `delete`:

```ts
  router.post('/:id/payoff', (req, res) => {
    const { MONTH_RE } = require('../schemas/common');
    const m = req.body.month;
    const month = (typeof m === 'string' && MONTH_RE.test(m)) ? m : new Date().toISOString().slice(0, 7);
    uc.payOff(Number(req.params.id), month);
    res.status(204).end();
  });
```

- [ ] **Step 5: Add an API test, run, confirm pass**

```ts
test('POST /api/installment-groups/:id/payoff returns 204', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app).post('/api/transactions').send({ category_id: ctx.categoryId,
    card_id: ctx.cardId, description: 'TV', installment_total_cents: 60000, installment_count: 6,
    first_month: '2026-06' }).expect(201);
  await request(app).post(`/api/installment-groups/${made.body.installment_group_id}/payoff`)
    .send({ month: '2026-08' }).expect(204);
});
```

Run: `npm run coverage`
Expected: PASS, ≥80%.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(installments): pay off early (collapse remaining parcelas)"
```

---

## Self-Review

- **Spec coverage:** list/overview (Tasks 1,4,5), atomic edit/re-expand (Tasks 2,3,4 — the standalone Tier 2 gap), pay-off early (Task 6), BI `installment-forecast` already surfaces the monthly commitment (unchanged). The "edit a single parcela silently desyncs" risk is addressed because edit re-expands the whole group.
- **Placeholder scan:** none — every code step has full code; HTML shell (5.5) references `transactions.html` for the boilerplate `<head>`, which exists.
- **Type consistency:** `InstallmentProgress` defined once (Task 1) and consumed by repo (1), use-case (3), controller (4), render test (5). `update`'s param shape matches between port (Task 2), repo (Task 2), use-case `UpdateInstallmentInput` (Task 3), and schema (Task 4): `{ category_id, card_id, description?, total_cents, count, first_month }`. `payOffEarly(id, asOfMonth)` consistent across port/repo/use-case/controller.
- **Note for executor:** the inline `require('../schemas/common')` in the controller can be hoisted to a top-level `import { MONTH_RE }`; pick whichever matches the file after Biome runs (Phase 0).
