# Detalhamento de Renda e Custos Fixos (`model_items`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `income_cents`/`fixed_costs_cents` numbers typed by hand in step 3 of the monthly review (`decidir.js`) with two editable lists — `model_items` rows of `kind` `'income'` or `'fixed_cost'` — whose sums the server freezes into `monthly_model` exactly as today.

**Architecture:** One new table (`model_items`), one new repository/use-case/HTTP-router triple following the existing `categories`/`recurring` pattern, and a small rewire of the existing `model` use case so `set()` computes `income_cents`/`fixed_costs_cents` from `modelItems.sumByKind(...)` instead of trusting the client. The frontend step 3 becomes two small editable lists (add/edit/remove, saved immediately, no modal) instead of two text fields.

**Tech Stack:** TypeScript, Express, better-sqlite3, Zod, vanilla JS/DOM on the frontend, `node:test` + `supertest`.

**Spec:** `docs/superpowers/specs/2026-08-14-model-items-design.md`

## Global Constraints

- `model_items` has no `active` column (remove = `DELETE`), no `category_id`, no link to `transactions`/`recurring_templates`. It holds current state only — no history of its own.
- `kind` is immutable after creation (`'income' | 'fixed_cost'`, `CHECK` constraint in SQL). Changing kind = delete + recreate.
- `amount_cents` uses `zNonNegInt` like every other monetary field in this app (`src/adapters/http/schemas/common.ts`).
- The migration file is `migrations/009_model_items.sql` — no data migration from `settings`/`monthly_model`; existing users start with two empty lists.
- `PUT /api/monthly-model` no longer accepts `income_cents`/`fixed_costs_cents` from the client — only `month` and `savings_goal_cents`. Extra fields are silently stripped by Zod's default `strip` behavior (no `.strict()` needed).
- Items are never turned into transactions — no code path in this plan writes to `transactions` from `model_items`.

---

## Task 1: Migration `009_model_items.sql`

**Files:**
- Create: `migrations/009_model_items.sql`
- Test: `test/migrations.test.ts` (append after line 164)

**Interfaces:**
- Produces: table `model_items(id, kind, name, amount_cents, sort_order)` + index `idx_model_items_kind(kind, sort_order)`, consumed by Task 2's repository.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/009_model_items.sql
CREATE TABLE model_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'fixed_cost')),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_model_items_kind ON model_items(kind, sort_order);
```

- [ ] **Step 2: Write the failing migration tests**

Append to `test/migrations.test.ts` (after the last `008` test, line 164):

```ts
test('009 creates model_items with a kind check constraint', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(model_items)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['id', 'kind', 'name', 'amount_cents', 'sort_order'],
  );
  assert.throws(() => {
    db.prepare("INSERT INTO model_items (kind, name, amount_cents) VALUES ('bogus', 'x', 0)").run();
  }, /CHECK constraint failed/);
});

test('009 accepts income and fixed_cost rows', () => {
  const db = migrate();
  db.prepare(
    "INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES ('income', 'Salário', 500000, 0)",
  ).run();
  db.prepare(
    "INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES ('fixed_cost', 'Aluguel', 200000, 0)",
  ).run();
  const rows = db.prepare('SELECT kind, name FROM model_items ORDER BY kind').all();
  assert.deepEqual(rows, [
    { kind: 'fixed_cost', name: 'Aluguel' },
    { kind: 'income', name: 'Salário' },
  ]);
});

test('009 starts empty, even for a database that already had a configured model', () => {
  const db = migrate(CONFIGURED, '008_monthly_model.sql');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM model_items').get().n, 0);
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="009"`
Expected: 3 passing tests (the migration file already exists from Step 1, so these should pass immediately — if `009 creates...` fails with "no such table", re-check the filename matches `009_model_items.sql` exactly, since the runner globs `migrations/*.sql` sorted by filename).

- [ ] **Step 4: Commit**

```bash
git add migrations/009_model_items.sql test/migrations.test.ts
git commit -m "feat: add model_items table (income/fixed_cost line items)"
```

---

## Task 2: Domain layer + repository

**Files:**
- Modify: `src/domain/entities/index.ts` (append after `ResolvedModel`, end of file)
- Modify: `src/domain/ports/index.ts` (add `ModelItem` to the import list at line 1-9, append `ModelItemRepository` after `MonthlyModelRepository`, end of file)
- Create: `src/infra/repositories/modelItems.ts`
- Create: `test/modelItems.test.ts`

**Interfaces:**
- Consumes: `Db` from `src/infra/db` (same type every other repository in `src/infra/repositories/*.ts` takes), `makeTestDb()` from `test/helpers.ts`.
- Produces: `ModelItem` entity, `ModelItemRepository` port, and `makeModelItemRepository(db: Db): ModelItemRepository` — consumed by Task 3 (use case) and Task 4 (composition root).

- [ ] **Step 1: Add the `ModelItem` entity**

Append to `src/domain/entities/index.ts`:

```ts
// Duas listas paralelas, desconectadas de `recurring_templates`/`transactions`
// (design 2026-08-14 "Summary"): o total gravado em `monthly_model` na
// revisão mensal passa a ser a soma dos itens de cada `kind`, não mais um
// número solto digitado à mão.
export interface ModelItem {
  id: number;
  kind: 'income' | 'fixed_cost';
  name: string;
  amount_cents: number;
  sort_order: number;
}
```

- [ ] **Step 2: Add the `ModelItemRepository` port**

In `src/domain/ports/index.ts`, change the import at the top to include `ModelItem`:

```ts
import type {
  Card,
  Category,
  Group,
  InstallmentProgress,
  ModelItem,
  MonthlyModel,
  RecurringTemplate,
  Transaction,
} from '../entities';
```

Append at the end of the file:

```ts
export interface ModelItemRepository {
  listByKind(kind: ModelItem['kind']): ModelItem[];
  create(item: Omit<ModelItem, 'id'>): ModelItem;
  // `sort_order` sai do payload de edição: o design (§API) só expõe
  // `{name, amount_cents}` no PUT — reordenar não é um caso de uso desta
  // fatia, e deixar o campo aqui só convidaria a escrever nele por engano.
  update(id: number, item: Omit<ModelItem, 'id' | 'kind' | 'sort_order'>): void;
  delete(id: number): void;
  sumByKind(kind: ModelItem['kind']): number; // amount_cents, 0 se vazio
}
```

- [ ] **Step 3: Write the failing repository tests**

Create `test/modelItems.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeModelItemRepository } = require('../src/infra/repositories/modelItems');

test('create + listByKind round-trips items, ordered by sort_order', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  const rows = repo.listByKind('income');
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Salário', 'Freelas'],
  );
});

test('listByKind never mixes income and fixed_cost', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000, sort_order: 0 });
  assert.equal(repo.listByKind('income').length, 1);
  assert.equal(repo.listByKind('fixed_cost').length, 1);
});

test('update changes name and amount but not kind', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const item = repo.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000, sort_order: 0 });
  repo.update(item.id, { name: 'Aluguel + condomínio', amount_cents: 250000 });
  const [row] = repo.listByKind('fixed_cost');
  assert.equal(row.name, 'Aluguel + condomínio');
  assert.equal(row.amount_cents, 250000);
  assert.equal(row.kind, 'fixed_cost');
});

test('delete removes the row', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const item = repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.delete(item.id);
  assert.equal(repo.listByKind('income').length, 0);
});

test('sumByKind sums only the requested kind, and is 0 when empty', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  assert.equal(repo.sumByKind('income'), 0);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  repo.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000, sort_order: 0 });
  assert.equal(repo.sumByKind('income'), 650000);
  assert.equal(repo.sumByKind('fixed_cost'), 200000);
});

test('sumByKind reflects a delete on the next call', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const a = repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  assert.equal(repo.sumByKind('income'), 650000);
  repo.delete(a.id);
  assert.equal(repo.sumByKind('income'), 150000);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- test/modelItems.test.ts`
Expected: FAIL — `Cannot find module '../src/infra/repositories/modelItems'`

- [ ] **Step 5: Implement the repository**

Create `src/infra/repositories/modelItems.ts`:

```ts
import type { ModelItem } from '../../domain/entities';
import type { ModelItemRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeModelItemRepository(db: Db): ModelItemRepository {
  return {
    listByKind(kind): ModelItem[] {
      return db
        .prepare('SELECT * FROM model_items WHERE kind=? ORDER BY sort_order, id')
        .all(kind) as ModelItem[];
    },
    create(item) {
      const r = db
        .prepare(
          'INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES (?, ?, ?, ?)',
        )
        .run(item.kind, item.name, item.amount_cents, item.sort_order);
      return db.prepare('SELECT * FROM model_items WHERE id=?').get(r.lastInsertRowid) as ModelItem;
    },
    update(id, item) {
      db.prepare('UPDATE model_items SET name=?, amount_cents=? WHERE id=?').run(
        item.name,
        item.amount_cents,
        id,
      );
    },
    delete(id) {
      db.prepare('DELETE FROM model_items WHERE id=?').run(id);
    },
    sumByKind(kind) {
      const row = db
        .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM model_items WHERE kind=?')
        .get(kind) as { total: number };
      return row.total;
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- test/modelItems.test.ts`
Expected: 6 passing tests.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/modelItems.ts test/modelItems.test.ts
git commit -m "feat: add ModelItem entity, port, and sqlite repository"
```

---

## Task 3: Application use case

**Files:**
- Create: `src/application/use-cases/modelItems.ts`
- Test: `test/modelItems.test.ts` (append)

**Interfaces:**
- Consumes: `ModelItemRepository` (Task 2) — `listByKind`, `create`, `update`, `delete`, `sumByKind`.
- Produces: `makeModelItemUseCases(deps: { modelItems: ModelItemRepository })` returning `{ list(kind), create(input), update(id, input), remove(id) }` — consumed by Task 4 (HTTP controller) and Task 6 (composition root).

- [ ] **Step 1: Write the failing use-case tests**

Append to `test/modelItems.test.ts`:

```ts
const { makeModelItemUseCases } = require('../src/application/use-cases/modelItems');

function ucFor(ctx) {
  return makeModelItemUseCases({ modelItems: makeModelItemRepository(ctx.db) });
}

test('use case create appends to the end of the sort order, per kind', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const a = uc.create({ kind: 'income', name: 'Salário', amount_cents: 500000 });
  const b = uc.create({ kind: 'income', name: 'Freelas', amount_cents: 150000 });
  assert.equal(a.sort_order, 0);
  assert.equal(b.sort_order, 1);
  assert.deepEqual(
    uc.list('income').map((i) => i.name),
    ['Salário', 'Freelas'],
  );
});

test('use case update edits the item in place', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const item = uc.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000 });
  uc.update(item.id, { name: 'Aluguel', amount_cents: 210000 });
  assert.equal(uc.list('fixed_cost')[0].amount_cents, 210000);
});

test('use case remove deletes the item', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const item = uc.create({ kind: 'income', name: 'Salário', amount_cents: 500000 });
  uc.remove(item.id);
  assert.equal(uc.list('income').length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/modelItems.test.ts`
Expected: FAIL — `Cannot find module '../src/application/use-cases/modelItems'`

- [ ] **Step 3: Implement the use case**

Create `src/application/use-cases/modelItems.ts`:

```ts
import type { ModelItem } from '../../domain/entities';
import type { ModelItemRepository } from '../../domain/ports';

export interface ModelItemUseCaseDeps {
  modelItems: ModelItemRepository;
}

export interface CreateModelItemInput {
  kind: ModelItem['kind'];
  name: string;
  amount_cents: number;
}

export interface UpdateModelItemInput {
  name: string;
  amount_cents: number;
}

export function makeModelItemUseCases(deps: ModelItemUseCaseDeps) {
  const { modelItems } = deps;

  return {
    list(kind: ModelItem['kind']): ModelItem[] {
      return modelItems.listByKind(kind);
    },
    // Sempre acrescenta ao fim da lista do `kind` — a mesma ideia de
    // `categories.nextSortOrder`, sem precisar de um método próprio no port
    // porque `listByKind` já dá tudo que é preciso para calcular o próximo.
    create(input: CreateModelItemInput): ModelItem {
      const existing = modelItems.listByKind(input.kind);
      const sort_order = existing.length
        ? Math.max(...existing.map((i) => i.sort_order)) + 1
        : 0;
      return modelItems.create({ ...input, sort_order });
    },
    update(id: number, input: UpdateModelItemInput): void {
      modelItems.update(id, input);
    },
    remove(id: number): void {
      modelItems.delete(id);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/modelItems.test.ts`
Expected: 9 passing tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/application/use-cases/modelItems.ts test/modelItems.test.ts
git commit -m "feat: add model-items use case"
```

---

## Task 4: HTTP schema + controller + wiring

**Files:**
- Create: `src/adapters/http/schemas/modelItems.ts`
- Create: `src/adapters/http/controllers/modelItems.ts`
- Modify: `src/infra/composition.ts`
- Modify: `src/app.ts` (add mount line after line 24, before `/api/transactions`)
- Test: `test/modelItems.test.ts` (append)

**Interfaces:**
- Consumes: `makeModelItemUseCases` (Task 3), `makeModelItemRepository` (Task 2), `zNonNegInt` from `src/adapters/http/schemas/common.ts`, `parse` from `src/adapters/http/validate.ts`.
- Produces: `GET/POST /api/model-items`, `PUT/DELETE /api/model-items/:id`, and `controllers.modelItems: express.Router` on the `Container` — consumed by nothing further in this plan (Task 5 only needs `repositories.modelItems`, already produced by Task 2/3's composition wiring done here).

- [ ] **Step 1: Write the schema**

Create `src/adapters/http/schemas/modelItems.ts`:

```ts
import { z } from 'zod';
import { zNonNegInt } from './common';

const modelItemKind = z.custom<'income' | 'fixed_cost'>(
  (v) => v === 'income' || v === 'fixed_cost',
  { message: "kind must be 'income' or 'fixed_cost'" },
);

export const listModelItemsQuerySchema = z.object({
  kind: modelItemKind,
});

export const createModelItemSchema = z.object({
  kind: modelItemKind,
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  amount_cents: zNonNegInt('amount_cents must be a non-negative integer'),
});

export const updateModelItemSchema = z.object({
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  amount_cents: zNonNegInt('amount_cents must be a non-negative integer'),
});
```

- [ ] **Step 2: Write the controller**

Create `src/adapters/http/controllers/modelItems.ts`:

```ts
import express from 'express';
import type { makeModelItemUseCases } from '../../../application/use-cases/modelItems';
import {
  createModelItemSchema,
  listModelItemsQuerySchema,
  updateModelItemSchema,
} from '../schemas/modelItems';
import { parse } from '../validate';

type ModelItemUseCases = ReturnType<typeof makeModelItemUseCases>;

export function makeModelItemsController(uc: ModelItemUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { kind } = parse(listModelItemsQuerySchema, req.query);
    res.json(uc.list(kind));
  });

  router.post('/', (req, res) => {
    const input = parse(createModelItemSchema, req.body);
    res.status(201).json(uc.create(input));
  });

  // Sem corpo de resposta: o port não expõe um `findById` (design é
  // deliberadamente minimalista aqui), então o controller não tem como devolver
  // o registro atualizado sem uma segunda consulta que o design não pede. O
  // frontend nunca lê o corpo do PUT — ele já tem o que mandou.
  router.put('/:id', (req, res) => {
    const input = parse(updateModelItemSchema, req.body);
    uc.update(Number(req.params.id), input);
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 3: Wire into the composition root**

In `src/infra/composition.ts`:

Add to the imports (alphabetical, alongside the other controller imports):
```ts
import { makeModelItemsController } from '../adapters/http/controllers/modelItems';
```
and alongside the other use-case imports:
```ts
import { makeModelItemUseCases } from '../application/use-cases/modelItems';
```
and alongside the other repository imports:
```ts
import { makeModelItemRepository } from './repositories/modelItems';
```

Add `modelItems: express.Router;` to the `Container['controllers']` interface (next to `monthlyModel: express.Router;`).

In `repositories`, add:
```ts
modelItems: makeModelItemRepository(db),
```
(next to `monthlyModel: makeMonthlyModelRepository(db),`).

In `useCases`, add:
```ts
modelItems: makeModelItemUseCases({ modelItems: repositories.modelItems }),
```
(next to `model,`).

In `controllers`, add:
```ts
modelItems: makeModelItemsController(useCases.modelItems),
```
(next to `monthlyModel: makeMonthlyModelController(useCases.model),`).

- [ ] **Step 4: Mount the router**

In `src/app.ts`, add after line 24 (`app.use('/api/monthly-model', controllers.monthlyModel);`):

```ts
  app.use('/api/model-items', controllers.modelItems);
```

- [ ] **Step 5: Write the failing HTTP tests**

Append to `test/modelItems.test.ts`:

```ts
const request = require('supertest');
const { createApp } = require('../src/app');

test('POST /api/model-items creates and GET lists by kind', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: 'Salário', amount_cents: 500000 })
    .expect(201);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000 })
    .expect(201);
  const income = await request(app).get('/api/model-items?kind=income').expect(200);
  assert.equal(income.body.length, 1);
  assert.equal(income.body[0].name, 'Salário');
  const fixed = await request(app).get('/api/model-items?kind=fixed_cost').expect(200);
  assert.equal(fixed.body.length, 1);
});

test('GET /api/model-items requires a valid kind', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/model-items').expect(400);
  await request(app).get('/api/model-items?kind=bogus').expect(400);
});

test('POST /api/model-items validates name, amount_cents, and kind', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: '', amount_cents: 100 })
    .expect(400);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: 'Salário', amount_cents: -1 })
    .expect(400);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'bogus', name: 'x', amount_cents: 100 })
    .expect(400);
});

test('PUT /api/model-items/:id edits name and amount', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000 })
    .expect(201);
  await request(app)
    .put(`/api/model-items/${created.body.id}`)
    .send({ name: 'Aluguel + condomínio', amount_cents: 250000 })
    .expect(204);
  const fixed = await request(app).get('/api/model-items?kind=fixed_cost').expect(200);
  assert.equal(fixed.body[0].name, 'Aluguel + condomínio');
  assert.equal(fixed.body[0].amount_cents, 250000);
});

test('DELETE /api/model-items/:id removes it', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: 'Salário', amount_cents: 500000 })
    .expect(201);
  await request(app).delete(`/api/model-items/${created.body.id}`).expect(204);
  const income = await request(app).get('/api/model-items?kind=income').expect(200);
  assert.equal(income.body.length, 0);
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- test/modelItems.test.ts`
Expected: 14 passing tests (6 repo + 3 use case + 5 HTTP).

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/adapters/http/schemas/modelItems.ts src/adapters/http/controllers/modelItems.ts src/infra/composition.ts src/app.ts test/modelItems.test.ts
git commit -m "feat: expose /api/model-items CRUD"
```

---

## Task 5: `model.ts` use case computes totals from `model_items`

**Files:**
- Modify: `src/application/use-cases/model.ts` (whole file)
- Modify: `src/adapters/http/schemas/monthlyModel.ts` (whole file)
- Modify: `src/infra/composition.ts` (the `model` construction, around line 69-72)
- Modify: `test/model.test.ts` (whole file — rewritten)

**Interfaces:**
- Consumes: `ModelItemRepository.sumByKind` (Task 2).
- Produces: `ModelUseCaseDeps` now requires `modelItems: ModelItemRepository`; `ModelInput` shrinks to `{ savings_goal_cents: number }`. No other task depends on this file's internals — `bi.ts`'s use case only calls `model.resolve(month)`, whose signature/behavior is unchanged.

- [ ] **Step 1: Update the schema**

Replace the contents of `src/adapters/http/schemas/monthlyModel.ts`:

```ts
import { z } from 'zod';
import { zMonth, zNonNegInt } from './common';

// `income_cents`/`fixed_costs_cents` não entram mais aqui: o servidor os
// calcula a partir de `model_items` (design 2026-08-14, "Cálculo do total no
// servidor"). Campos extras no corpo (ex.: um cliente antigo ainda mandando
// os dois números) são descartados pelo `strip` padrão do Zod — não quebram,
// só não têm efeito.
export const putMonthlyModelSchema = z.object({
  month: zMonth('month must be YYYY-MM'),
  savings_goal_cents: zNonNegInt('savings_goal_cents must be a non-negative integer'),
});
```

- [ ] **Step 2: Update the use case**

Replace the contents of `src/application/use-cases/model.ts`:

```ts
import type { ResolvedModel } from '../../domain/entities';
import type { ModelItemRepository, MonthlyModelRepository, SettingsRepository } from '../../domain/ports';

export interface ModelUseCaseDeps {
  monthlyModel: MonthlyModelRepository;
  settings: SettingsRepository;
  modelItems: ModelItemRepository;
}

export interface ModelInput {
  savings_goal_cents: number;
}

// Contrato estreito consumido por `use-cases/bi.ts`: a poupança realizada precisa
// resolver o modelo de cada mês, e não deve reimplementar a cadeia de fallback.
export interface ModelResolver {
  resolve(month: string): ResolvedModel;
}

// As três chaves globais de `settings` continuam sendo o modelo CORRENTE. A
// tabela é o histórico. O passo 3 da revisão grava nos dois (§B.1 do design).
const KEYS = {
  income_cents: 'monthly_income',
  fixed_costs_cents: 'fixed_costs',
  savings_goal_cents: 'savings_goal',
} as const;

export function makeModelUseCases(deps: ModelUseCaseDeps) {
  const { monthlyModel, settings, modelItems } = deps;

  function num(key: string): number {
    const v = settings.get(key);
    return v !== undefined ? Number(v) : 0;
  }

  return {
    // Cadeia de resolução, do mais específico ao mais genérico:
    //   1. a linha exata do mês
    //   2. a linha mais recente anterior a ele
    //   3. os valores atuais de `settings`
    //   4. zeros
    resolve(month: string): ResolvedModel {
      const row = monthlyModel.findAtOrBefore(month);
      if (row) {
        return { ...row, month, source: row.month === month ? 'month' : 'carry' };
      }
      if (settings.get(KEYS.income_cents) !== undefined) {
        return {
          month,
          income_cents: num(KEYS.income_cents),
          fixed_costs_cents: num(KEYS.fixed_costs_cents),
          savings_goal_cents: num(KEYS.savings_goal_cents),
          source: 'settings',
        };
      }
      return {
        month,
        income_cents: 0,
        fixed_costs_cents: 0,
        savings_goal_cents: 0,
        source: 'none',
      };
    },

    // `income_cents`/`fixed_costs_cents` nunca vêm do cliente: são sempre a
    // soma de `model_items` no instante da gravação. Isso garante que o total
    // congelado no histórico nunca diverge da lista de itens que o gerou —
    // não existe um segundo caminho pelo qual esses dois campos possam ser
    // gravados com um valor que a lista de itens não sustenta.
    set(month: string, input: ModelInput): ResolvedModel {
      const income_cents = modelItems.sumByKind('income');
      const fixed_costs_cents = modelItems.sumByKind('fixed_cost');
      const full = { income_cents, fixed_costs_cents, savings_goal_cents: input.savings_goal_cents };
      monthlyModel.upsert({ month, ...full });
      settings.setMany([
        [KEYS.income_cents, String(income_cents)],
        [KEYS.fixed_costs_cents, String(fixed_costs_cents)],
        [KEYS.savings_goal_cents, String(input.savings_goal_cents)],
      ]);
      return { month, ...full, source: 'month' };
    },
  };
}
```

- [ ] **Step 3: Wire `modelItems` into the composition root**

In `src/infra/composition.ts`, change the `model` construction (currently around line 69-72):

```ts
  const model = makeModelUseCases({
    monthlyModel: repositories.monthlyModel,
    settings: repositories.settings,
    modelItems: repositories.modelItems,
  });
```

(`repositories.modelItems` already exists from Task 4, Step 3.)

- [ ] **Step 4: Rewrite `test/model.test.ts`**

Replace the contents of `test/model.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function addItem(app, kind, name, amount_cents) {
  return request(app).post('/api/model-items').send({ kind, name, amount_cents }).expect(201);
}

test('an unconfigured database resolves to zeros', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.deepEqual(r.body, {
    month: '2026-08',
    income_cents: 0,
    fixed_costs_cents: 0,
    savings_goal_cents: 0,
    source: 'none',
  });
});

test('settings answer for months with no row of their own', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1200000, fixed_costs: 386000, savings_goal: 250000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1200000);
  assert.equal(r.body.source, 'settings');
});

test('PUT sums model_items instead of taking income/fixed from the body', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1000000);
  await addItem(app, 'income', 'Freelas', 200000);
  await addItem(app, 'fixed_cost', 'Aluguel', 300000);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);
  assert.equal(r.body.income_cents, 1200000);
  assert.equal(r.body.fixed_costs_cents, 300000);
  assert.equal(r.body.savings_goal_cents, 250000);
});

test('an empty item list sums to 0, same as never having configured anything', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);
  assert.equal(r.body.income_cents, 0);
  assert.equal(r.body.fixed_costs_cents, 0);
});

test('income_cents/fixed_costs_cents in the body are ignored, not rejected', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1000000);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      savings_goal_cents: 250000,
      income_cents: 99999999,
      fixed_costs_cents: 99999999,
    })
    .expect(200);
  assert.equal(r.body.income_cents, 1000000); // veio da soma, não do body
  assert.equal(r.body.fixed_costs_cents, 0);
});

test('the month row wins, and the nearest earlier row carries forward', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const income = (await addItem(app, 'income', 'Salário', 1000000)).body;
  await addItem(app, 'fixed_cost', 'Aluguel', 300000);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  // A próxima revisão mensal reedita os itens antes de congelar julho —
  // exatamente o fluxo real do passo 3.
  await request(app)
    .put(`/api/model-items/${income.id}`)
    .send({ name: 'Salário', amount_cents: 1200000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);

  const june = await request(app).get('/api/monthly-model?month=2026-06').expect(200);
  assert.equal(june.body.income_cents, 1000000);
  assert.equal(june.body.source, 'month');

  const july = await request(app).get('/api/monthly-model?month=2026-07').expect(200);
  assert.equal(july.body.income_cents, 1000000); // carries June forward
  assert.equal(july.body.month, '2026-07');
  assert.equal(july.body.source, 'carry');

  // Maio é anterior a qualquer linha gravada, então não há degrau `carry` — mas
  // também não é `none`: os dois PUTs acima gravaram `settings` junto (é o que o
  // teste seguinte prova), e `settings` é o terceiro degrau da cadeia.
  const may = await request(app).get('/api/monthly-model?month=2026-05').expect(200);
  assert.equal(may.body.income_cents, 1200000);
  assert.equal(may.body.source, 'settings');
});

test('writing a month also updates the current model in settings', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1200000);
  await addItem(app, 'fixed_cost', 'Aluguel', 386000);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);
  const s = await request(app).get('/api/settings').expect(200);
  assert.deepEqual(s.body, {
    monthly_income: 1200000,
    fixed_costs: 386000,
    savings_goal: 250000,
  });
});

test('writing the same month twice overwrites instead of duplicating', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const item = (await addItem(app, 'income', 'Salário', 1000000)).body;
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 200000 })
    .expect(200);
  await request(app)
    .put(`/api/model-items/${item.id}`)
    .send({ name: 'Salário', amount_cents: 1500000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 200000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1500000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_model').get().n, 1);
});

test('monthly-model validates its inputs', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/monthly-model').expect(400); // no month
  await request(app).get('/api/monthly-model?month=2026').expect(400); // malformed
  await request(app).put('/api/monthly-model').send({ month: '2026-08' }).expect(400); // no savings_goal_cents
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: -1 })
    .expect(400); // negative
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 1.5 })
    .expect(400); // not an integer
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- test/model.test.ts`
Expected: 9 passing tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this step will surface any other callers of `ModelInput`/`makeModelUseCases` that still assume the old 3-field shape — there should be none besides `composition.ts`, already fixed in Step 3).

- [ ] **Step 7: Commit**

```bash
git add src/application/use-cases/model.ts src/adapters/http/schemas/monthlyModel.ts src/infra/composition.ts test/model.test.ts
git commit -m "feat: monthly-model totals come from model_items, not the request body"
```

---

## Task 6: Fix `bi.test.ts` fixtures that PUT income/fixed directly

**Files:**
- Modify: `test/bi.test.ts:263-301` (`savings-realized uses the model that was in force each month`)
- Modify: `test/bi.test.ts:304-334` (`changing income today does not rewrite a month that already has a model`)

**Interfaces:**
- Consumes: `POST /api/model-items`, `PUT /api/model-items/:id` (Task 4).

These two tests currently `PUT /api/monthly-model` with `income_cents`/`fixed_costs_cents` in the body. After Task 5, those fields are silently ignored, so the tests would start asserting against zeros. Reproduce the same frozen values through `model_items` instead — no change to `bi.ts` itself, only to how these two fixtures set up their model.

- [ ] **Step 1: Update `savings-realized uses the model that was in force each month`**

Replace lines 263-301 in `test/bi.test.ts`:

```ts
test('savings-realized uses the model that was in force each month', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const income = (
    await request(app)
      .post('/api/model-items')
      .send({ kind: 'income', name: 'Salário', amount_cents: 1000000 })
      .expect(201)
  ).body;
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 300000 })
    .expect(201);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  // Renda sobe para julho — o custo fixo fica como está, como na revisão real.
  await request(app)
    .put(`/api/model-items/${income.id}`)
    .send({ name: 'Salário', amount_cents: 1400000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-07', savings_goal_cents: 250000 })
    .expect(200);

  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 100000,
    })
    .expect(201);

  const r = await request(app).get('/api/bi/savings-realized?from=2026-06&to=2026-07').expect(200);
  const realized = r.body.series[0];
  const goal = r.body.series[1];
  assert.equal(realized.name, 'Poupança realizada');
  assert.equal(goal.name, 'Meta');
  assert.deepEqual(realized.spent_cents, [600000, 1100000]); // 1.000−300−100 · 1.400−300−0
  assert.deepEqual(goal.spent_cents, [200000, 250000]);
});
```

- [ ] **Step 2: Update `changing income today does not rewrite a month that already has a model`**

Replace lines 304-334 in `test/bi.test.ts`:

```ts
// A razão de ser da fatia inteira do lado dos dados (§A.2 do design).
test('changing income today does not rewrite a month that already has a model', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: 'Salário', amount_cents: 1000000 })
    .expect(201);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 300000 })
    .expect(201);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  const before = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);

  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 9900000, fixed_costs: 100, savings_goal: 100 })
    .expect(200);

  const after = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);
  assert.deepEqual(after.body.series[0].spent_cents, before.body.series[0].spent_cents);

  // O contraste: `savings-trend` continua sendo projeção com os números de hoje.
  const trend = await request(app).get('/api/bi/savings-trend?from=2026-06&to=2026-06').expect(200);
  assert.equal(trend.body.series[0].spent_cents[0], 9900000 - 100);
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="savings-realized|does not rewrite a month"`
Expected: all passing (this pattern matches the two tests touched here, plus the unrelated `savings-realized falls back to settings for months with no model row` test right after them — it should already pass unmodified).

- [ ] **Step 4: Run the full bi + model + modelItems suites**

Run: `npm test -- test/bi.test.ts test/model.test.ts test/modelItems.test.ts`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add test/bi.test.ts
git commit -m "test: seed bi.test.ts fixtures through model_items, not monthly-model body fields"
```

---

## Task 7: Frontend pure helpers (`review.js`)

**Files:**
- Modify: `public/js/review.js` (append at end of file)
- Test: `test/review.test.ts` (append)

**Interfaces:**
- Consumes: `esc`, `formatBRL` from `public/js/format.js` (already imported at the top of `review.js`).
- Produces: `sumItemsCents(items)`, `renderItemRow(kind, item)`, `renderItemList(kind, items)` — consumed by Task 8 (`decidir.js`).

- [ ] **Step 1: Write the failing tests**

Append to `test/review.test.ts`:

```ts
test('sumItemsCents adds up amount_cents, 0 for an empty list', async () => {
  const { sumItemsCents } = await import('../public/js/review.js');
  assert.equal(sumItemsCents([]), 0);
  assert.equal(sumItemsCents([{ amount_cents: 500000 }, { amount_cents: 150000 }]), 650000);
});

test('renderItemRow escapes the item name and shows the formatted amount', async () => {
  const { renderItemRow } = await import('../public/js/review.js');
  const html = renderItemRow('income', { id: 7, name: '<b>Salário</b>', amount_cents: 500000 });
  assert.match(html, /&lt;b&gt;Salário&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Salário/);
  assert.match(html, /R\$ 5\.000,00/);
  assert.match(html, /data-item-name="7"/);
  assert.match(html, /data-item-amount="7"/);
  assert.match(html, /data-item-del="7"/);
});

test('renderItemList renders one row per item plus an add button and the subtotal', async () => {
  const { renderItemList } = await import('../public/js/review.js');
  const html = renderItemList('fixed_cost', [
    { id: 1, name: 'Aluguel', amount_cents: 200000 },
    { id: 2, name: 'Condomínio', amount_cents: 50000 },
  ]);
  assert.match(html, /data-list="fixed_cost"/);
  assert.match(html, /data-row="1"/);
  assert.match(html, /data-row="2"/);
  assert.match(html, /data-item-add="fixed_cost"/);
  assert.match(html, /R\$ 2\.500,00/); // subtotal
});

test('renderItemList handles an empty list — just the add button and a zero subtotal', async () => {
  const { renderItemList } = await import('../public/js/review.js');
  const html = renderItemList('income', []);
  assert.doesNotMatch(html, /data-row=/);
  assert.match(html, /R\$ 0,00/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/review.test.ts`
Expected: FAIL — `sumItemsCents is not a function` (etc.)

- [ ] **Step 3: Implement the helpers**

Append to `public/js/review.js`:

```js
export function sumItemsCents(items) {
  return items.reduce((sum, i) => sum + i.amount_cents, 0);
}

// Uma linha por item: nome editável, valor editável, remover. `data-item-*`
// carrega o id em cada controle para que o wiring em `decidir.js` saiba qual
// item mexer sem precisar caminhar o DOM a partir de um `data-row` pai.
export function renderItemRow(kind, item) {
  return `
    <div class="flex items-center gap-2 py-1" data-row="${item.id}">
      <input type="text" class="flex-1 rounded border border-line bg-card px-2 py-1 text-sm"
             data-item-name="${item.id}" value="${esc(item.name)}" />
      <input type="text" class="w-28 rounded border border-line bg-card px-2 py-1 text-right font-mono text-sm"
             data-item-amount="${item.id}" value="${formatBRL(item.amount_cents)}" />
      <button type="button" data-item-del="${item.id}" class="text-clay text-sm" aria-label="Remover">×</button>
    </div>`;
}

// Uma lista inteira — linhas + "+ adicionar" + subtotal. O subtotal aqui é o
// valor GRAVADO (`item.amount_cents`, na carga inicial); o feedback ao
// digitar é responsabilidade de quem chama (`paintCanSpend` em decidir.js
// recalcula ao vivo a partir dos inputs, não deste HTML estático).
export function renderItemList(kind, items) {
  const rows = items.map((i) => renderItemRow(kind, i)).join('');
  return `
    <div data-list="${kind}">
      ${rows}
      <button type="button" data-item-add="${kind}" class="text-sage text-sm mt-1">+ adicionar</button>
      <div class="text-sm text-ink-mut mt-2">Subtotal <span class="font-mono" data-subtotal="${kind}">${formatBRL(sumItemsCents(items))}</span></div>
    </div>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/review.test.ts`
Expected: all passing (original review tests + 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add public/js/review.js test/review.test.ts
git commit -m "feat: add pure render helpers for model-item lists"
```

---

## Task 8: Frontend wiring (`decidir.js` step 3)

**Files:**
- Modify: `public/js/decidir.js` (imports at line 6-13; `renderStep3` at lines 94-117; `readModelFields`/`paintCanSpend`/`saveModel`/`wireStep3` at lines 119-161; the `go()` guard at line 363)

**Interfaces:**
- Consumes: `renderItemList` from `public/js/review.js` (Task 7); `GET/POST/PUT/DELETE /api/model-items` and `PUT /api/monthly-model` (Tasks 4-5); `api`, `showError` from `public/js/api.js`; `parseReais`, `formatBRL` from `public/js/format.js`.
- Produces: nothing consumed elsewhere — this is the leaf of the plan.

- [ ] **Step 1: Update the import line**

In `public/js/decidir.js`, change line 6-13 from:

```js
import {
  modelSummary,
  overspentFirst,
  reviewMonths,
  stepSubtitle,
  stepTrail,
  summaryLines,
} from './review.js';
```

to:

```js
import {
  modelSummary,
  overspentFirst,
  renderItemList,
  reviewMonths,
  stepSubtitle,
  stepTrail,
  summaryLines,
} from './review.js';
```

- [ ] **Step 2: Replace `renderStep3` (lines 94-117)**

```js
// Passo 3 — o único momento em que o app pergunta números sobre a pessoa.
// Renda e custos fixos viram duas listas de `model_items` (design
// 2026-08-14): cada linha soma para o total que o servidor congela em
// `monthly_model[opening]` ao sair do passo (§B.1). Adicionar/editar/remover
// uma linha grava na hora — sem esperar o "Continuar", mesma filosofia de
// "sem modal, some direto" do resto do app.
async function renderStep3() {
  const [income, fixed, m] = await Promise.all([
    api.get('/api/model-items?kind=income'),
    api.get('/api/model-items?kind=fixed_cost'),
    api.get(`/api/monthly-model?month=${state.months.opening}`),
  ]);
  state.items = { income, fixed_cost: fixed };
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Seu modelo</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">Renda, custos fixos e quanto você quer guardar. É daqui que sai o "posso gastar".</p>
      <div class="grid sm:grid-cols-2 gap-6">
        <div>
          <h3 class="label-caps text-ink-mut mb-2">Renda</h3>
          ${renderItemList('income', income)}
        </div>
        <div>
          <h3 class="label-caps text-ink-mut mb-2">Custos fixos</h3>
          ${renderItemList('fixed_cost', fixed)}
        </div>
      </div>
      <label class="field mt-4 max-w-xs">
        <span>Meta de poupança</span>
        <input type="text" id="goal" value="${formatBRL(m.savings_goal_cents)}" class="font-mono" />
      </label>
      <div id="canSpend" class="mt-4 rounded border border-sage/40 bg-sage-soft/10 p-4 flex flex-col md:flex-row md:items-center gap-2"></div>
      <p class="text-sm text-ink-mut mt-4">Antes deste passo o app funciona normalmente — só sem projeção de poupança. Nada aqui é obrigatório.</p>
      <p class="text-sm text-ink-mut mt-2">Custos fixos são o que sai todo mês sem passar pelo seu julgamento: aluguel, condomínio, mensalidades. <b>Não lance esses valores também como transação</b> — se lançar, eles seriam descontados duas vezes da sua poupança.</p>
    </section>`;
}
```

- [ ] **Step 3: Replace `readModelFields`/`paintCanSpend`/`saveModel`/`wireStep3` (lines 119-161)**

```js
function readGoalCents() {
  const v = parseReais($('goal').value);
  return Number.isNaN(v) || v < 0 ? 0 : v;
}

// Soma AO VIVO os valores que estão na tela agora — inclusive os que ainda
// não foram salvos (cada campo grava no `blur`, não no `input`). É o que dá
// o feedback imediato que o design pede: o "posso gastar" e os dois
// subtotais reagem a cada tecla, sem esperar a viagem de rede.
function liveItemCents(kind) {
  return [...document.querySelectorAll(`[data-list="${kind}"] input[data-item-amount]`)]
    .map((inp) => {
      const v = parseReais(inp.value);
      return Number.isNaN(v) || v < 0 ? 0 : v;
    })
    .reduce((sum, v) => sum + v, 0);
}

function paintCanSpend() {
  const income = liveItemCents('income');
  const fixed = liveItemCents('fixed_cost');
  const goal = readGoalCents();
  const incomeSubtotal = $('step').querySelector('[data-subtotal="income"]');
  if (incomeSubtotal) incomeSubtotal.textContent = formatBRL(income);
  const fixedSubtotal = $('step').querySelector('[data-subtotal="fixed_cost"]');
  if (fixedSubtotal) fixedSubtotal.textContent = formatBRL(fixed);
  const s = modelSummary(income, fixed, goal);
  $('canSpend').innerHTML = `
    <div>
      <div class="label-caps text-ink-mut">POSSO GASTAR ESTE MÊS</div>
      <div class="text-sm text-ink-mut font-mono mt-0.5">${s.formula}</div>
    </div>
    <div class="md:ml-auto font-mono text-3xl ${s.can_spend_cents >= 0 ? 'text-sage' : 'text-clay'}">${formatBRL(s.can_spend_cents)}</div>`;
}

async function saveItem(id) {
  const name = $('step').querySelector(`input[data-item-name="${id}"]`);
  const amount = $('step').querySelector(`input[data-item-amount="${id}"]`);
  const parsed = parseReais(amount.value);
  const amount_cents = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  amount.value = formatBRL(amount_cents);
  await api.put(`/api/model-items/${id}`, { name: name.value, amount_cents });
}

// Refaz só a lista que mudou (não o passo inteiro): busca de novo do
// servidor, redesenha o container e prende os listeners de novo — o mesmo
// padrão que `recurring.js` usa depois de um POST/DELETE.
async function refreshList(kind) {
  const items = await api.get(`/api/model-items?kind=${kind}`);
  state.items[kind] = items;
  const container = $('step').querySelector(`[data-list="${kind}"]`);
  container.outerHTML = renderItemList(kind, items);
  wireList(kind);
  paintCanSpend();
}

function wireList(kind) {
  const container = $('step').querySelector(`[data-list="${kind}"]`);
  container.querySelectorAll('input[data-item-amount], input[data-item-name]').forEach((inp) => {
    inp.addEventListener('input', paintCanSpend);
  });
  container.querySelectorAll('input[data-item-amount]').forEach((inp) => {
    inp.addEventListener('blur', () => {
      saveItem(Number(inp.dataset.itemAmount))
        .then(paintCanSpend)
        .catch((e) => showError(e.message));
    });
  });
  container.querySelectorAll('input[data-item-name]').forEach((inp) => {
    inp.addEventListener('blur', () => {
      saveItem(Number(inp.dataset.itemName)).catch((e) => showError(e.message));
    });
  });
  container.querySelectorAll('button[data-item-del]').forEach((b) => {
    b.addEventListener('click', () => {
      api
        .del(`/api/model-items/${b.dataset.itemDel}`)
        .then(() => refreshList(kind))
        .catch((e) => showError(e.message));
    });
  });
  container.querySelector('button[data-item-add]').addEventListener('click', () => {
    api
      .post('/api/model-items', { kind, name: 'Novo item', amount_cents: 0 })
      .then(() => refreshList(kind))
      .catch((e) => showError(e.message));
  });
}

// Grava só a meta: renda e custos fixos já vivem em `model_items` e o
// servidor recalcula a soma ao gravar `monthly_model[opening]` (design
// "Cálculo do total no servidor").
async function saveModel() {
  const savings_goal_cents = readGoalCents();
  const resolved = await api.put('/api/monthly-model', {
    month: state.months.opening,
    savings_goal_cents,
  });
  state.decisions.model = resolved;
}

function wireStep3() {
  wireList('income');
  wireList('fixed_cost');
  paintCanSpend();
  $('goal').addEventListener('input', paintCanSpend);
  $('goal').addEventListener('blur', () => {
    const v = parseReais($('goal').value);
    $('goal').value = formatBRL(Number.isNaN(v) || v < 0 ? 0 : v);
    paintCanSpend();
  });
}
```

- [ ] **Step 4: Update the `go()` guard (line 363)**

Change:

```js
  if (leaving === 3 && next !== 3 && $('income')) {
```

to:

```js
  if (leaving === 3 && next !== 3 && $('goal')) {
```

(`#income` no longer exists — `#goal` is step 3's marker element now, the only field that still lives directly on the step.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests passing, including `test/decidirRender.test.ts` (unaffected — it only tests the still-untouched `tile` export).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual smoke check in the browser**

Run: `npm start`, then open `/decidir.html`, click through to step 3 ("Seu modelo"), and verify:
- Both lists load (empty on a fresh database).
- "+ adicionar" appends a row named "Novo item" immediately (check `GET /api/model-items?kind=income` reflects it without reloading the page).
- Editing a name or amount and clicking away (blur) persists it — reload the page and confirm the row survived.
- Typing in an amount field updates the subtotal and "posso gastar" live, before you click away.
- Removing a row updates the subtotal and disappears immediately.
- Leaving step 3 (Continuar/Voltar/clicking the trail) does not throw, and the final summary (step 6) shows the correct income/fixed/goal figures.

- [ ] **Step 8: Commit**

```bash
git add public/js/decidir.js
git commit -m "feat: step 3 of the monthly review edits income/fixed-cost as item lists"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), domain layer (Task 2), API (Task 4), server-side total calculation (Task 5), UI (Tasks 7-8), migration (Task 1), testing (Tasks 1-8 each carry their own tests; the spec's `decidirRender.test.ts` line item is satisfied by `test/review.test.ts` instead, since the new markup is pure-function-testable there and `decidirRender.test.ts` has no jsdom to test wired behavior — matching how the existing `wireStep4`/`saveLimit` wiring is likewise untested at that layer). Regression: `dashboard.test.ts` needs no change (verified — it never touches `income_cents`/`fixed_costs_cents`); `bi.test.ts` needed two fixture updates (Task 6) despite the spec's claim that it "continues passing unaltered" — the spec meant the *contract* of `resolve()`/the projection formula doesn't change (true, and unaffected by Task 6), not that the byte contents of the test file are untouched. This discrepancy is called out explicitly in Task 6 so it isn't mistaken for scope creep.
- **Deliberate deviations from the spec's literal TypeScript snippets, both justified above at point of use:**
  1. `ModelItemRepository.update`'s second parameter is `Omit<ModelItem, 'id' | 'kind' | 'sort_order'>` (Task 2) instead of the spec's `Omit<ModelItem, 'id' | 'kind'>` — the HTTP contract (§API) only ever sends `{name, amount_cents}`, and the repository has no `findById` to recover a current `sort_order` to round-trip; keeping `sort_order` out of the type avoids a dummy/unused field on every caller.
  2. `PUT /api/model-items/:id` returns `204 No Content` instead of echoing the updated record — the port's `update` returns `void` and there is no `findById` to look the row back up after writing it, so there is nothing honest to put in a response body. The frontend (Task 8) never reads this response.
- **Placeholder scan:** none found — every step has literal code, no "TBD"/"similar to Task N".
- **Type consistency:** `ModelItem`, `ModelItemRepository`, `CreateModelItemInput`, `UpdateModelItemInput`, `ModelUseCaseDeps.modelItems`, and `data-item-name`/`data-item-amount`/`data-item-del`/`data-item-add`/`data-list`/`data-subtotal` DOM hooks are named identically everywhere they're used across Tasks 2-8.
