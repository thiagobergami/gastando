# Split de Transação com Terceiros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a transaction optionally record that part of it is owed back by someone else — one person, one percentage, no fixed R$ value — without touching `spent_cents`/budget/savings projection anywhere, and surface what's still owed as a small "a receber" panel on the dashboard.

**Architecture:** A new `people` table (soft-delete via `active`, same shape as `cards`) plus three new columns directly on `transactions` (`split_person_id`, `split_percent`, `split_received`) — same pattern `installment_group_id`/`recurring_template_id` already use for an optional 1:0..1 link. A new `people` CRUD router mirrors `cards`. The existing `transactions` create/update use case gains split fields and a person-existence check; two new endpoints toggle `split_received`; a third lists everything still owed, computed at read time (`amount_cents * split_percent / 100`), never stored. The frontend gets a third mutually-exclusive toggle in `registrar.js` (next to "+ dividir em N vezes" / "+ repete todo mês") and a new read-only panel on `index.html`, loaded independently like the existing commitments panel.

**Tech Stack:** TypeScript, Express, better-sqlite3, Zod, vanilla JS/DOM on the frontend, `node:test` + `supertest`.

**Spec:** `docs/superpowers/specs/2026-08-14-transaction-split-design.md`

## Global Constraints

- `people` has no history of its own — soft-delete via `active` only, exactly like `cards`/`categories`. No `DELETE /api/people` — deactivation happens through `PUT /api/people/:id` with `active: 0` (the spec's own API list never mentions a people DELETE route).
- `transactions.split_person_id` / `split_percent` are `NULL` together or set together — never one without the other. `split_received` defaults to `0`.
- `split_percent` is a validated integer `1..99` — never `0` (that means "no split") and never `100` (whoever pays always keeps a share, per the spec).
- The amount owed is **never stored** — always `amount_cents * split_percent / 100`, computed at read time in SQL, rounded to the nearest cent.
- Split is **not combined** with installment purchases or recurring templates in this slice: `installments.createPurchase()` and `POST /api/recurring` have no split columns to write to, and the frontend's existing "advanced mode" toggle (today: installment XOR recurring) gets a third mutually-exclusive option, split, rather than a fourth independent one — see Task 8's note for the reasoning.
- No splitting between more than one person, no fixed-R$ split value, no history of "who received what when" beyond the single `split_received` boolean-as-integer.
- Migration file: `migrations/010_transaction_split.sql`.

## Deviations from the spec's literal snippets (each justified again at point of use)

1. **`Person.active` and `Transaction.split_received` are typed `number` (`0 | 1`), not `boolean`.** Every other row-flag field already in this codebase — `Category.active`, `Card.active`, `Group.active`, `Category.essential` — is `number`, because better-sqlite3 returns SQLite integers as JS numbers, not booleans. Introducing one boolean-typed DB-backed field would be the only one of its kind and would need its own (de)serialization, for no benefit.
2. **`Transaction.split_person_id` / `split_percent` are typed `number | null` (not `?: number`).** This matches the existing `installment_group_id: number | null` / `installment_no: number | null` / `installment_total: number | null` trio exactly — better-sqlite3 returns `null` for NULL columns, never `undefined`, and `test/transactions.test.ts` already asserts `t.body.installment_group_id === null` on a plain create.
3. **`PersonRepository` mirrors `CardRepository` exactly** (`listAll(): Person[]`, `update(id, {name, active}): number` returning changes for 404 detection) instead of the spec's `list(includeInactive?): Person[]` / partial-patch / `void`-returning snippet. `Person` is structurally identical to `Card` (`id`, `name`, `active`) — reusing that exact shape keeps the 404 pattern consistent with every other simple-entity repository in this codebase, and drops an `includeInactive` parameter the spec's own API section never actually calls for.
4. **`GET /api/people` returns everyone, active and inactive** — not "só active por padrão" as the spec's API section literally says. Verified against actual behavior: `GET /api/categories` and `GET /api/cards` both call `listAll()` today, unfiltered — the *client* filters for dropdowns (`registrar.js`'s `active(list)` helper). The spec's own soft-delete rationale ("não quebrar transações passadas") only requires `findById` to keep resolving an inactive person; it never requires the list endpoint to filter. Matching the real precedent avoids inventing behavior no other list endpoint in this app has.
5. **`TransactionRepository.listReceivables()`'s `received` field is `number` (`0 | 1`), not `boolean`** — same reasoning as #1.
6. **Regression claim verified, not just repeated:** the spec's Testing section says `dashboard.test.ts` / `bi.test.ts` "continuam passando sem alteração." Unlike the sibling `model_items` plan (where the equivalent claim was false), this one checks out: `grep` over `src/infra/repositories/reports.ts`, `src/application/use-cases/dashboard.ts`, and `src/application/use-cases/bi.ts` confirms every aggregate against `transactions` uses explicit `SUM(amount_cents)` / `COUNT(*)`, never `SELECT *` — the three new columns can't leak into any total. No fix task needed for those two files.

---

## Task 1: Migration `010_transaction_split.sql`

**Files:**
- Create: `migrations/010_transaction_split.sql`
- Test: `test/migrations.test.ts` (append after line 196)

**Interfaces:**
- Produces: table `people(id, name, active)`, and `transactions.split_person_id` / `split_percent` / `split_received` columns + index `idx_tx_split_person`, consumed by Task 2's `people` repository and Task 5's `transactions` repository.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/010_transaction_split.sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN split_person_id INTEGER REFERENCES people(id);
ALTER TABLE transactions ADD COLUMN split_percent INTEGER;      -- 1–99, inteiro
ALTER TABLE transactions ADD COLUMN split_received INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_tx_split_person ON transactions(split_person_id);
```

- [ ] **Step 2: Write the failing migration tests**

Append to `test/migrations.test.ts` (after the last `009` test, line 196):

```ts
test('010 creates people with active defaulting to 1', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(people)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['id', 'name', 'active'],
  );
  const active = cols.find((c: { name: string }) => c.name === 'active');
  assert.equal(active.notnull, 1);
  assert.equal(active.dflt_value, '1');
});

test('010 adds split columns to transactions, split_received defaulting to 0', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(transactions)').all();
  const names = cols.map((c: { name: string }) => c.name);
  assert.ok(names.includes('split_person_id'));
  assert.ok(names.includes('split_percent'));
  assert.ok(names.includes('split_received'));
  const received = cols.find((c: { name: string }) => c.name === 'split_received');
  assert.equal(received.notnull, 1);
  assert.equal(received.dflt_value, '0');
});

test('010 a transaction can reference a person as its split', () => {
  const db = migrate();
  db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  db.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (1, 'Mercado', 0)").run();
  db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  const p = db.prepare("INSERT INTO people (name) VALUES ('Fulano')").run();
  db.prepare(
    `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, split_person_id, split_percent)
     VALUES ('2026-06-10', 1, 1, 10000, 'Jantar', ?, 50)`,
  ).run(p.lastInsertRowid);
  const row = db
    .prepare('SELECT split_person_id, split_percent, split_received FROM transactions WHERE id=1')
    .get();
  assert.deepEqual(row, {
    split_person_id: Number(p.lastInsertRowid),
    split_percent: 50,
    split_received: 0,
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --import tsx --test test/migrations.test.ts` (note: `npm test -- <file>`/`--test-name-pattern` does not actually filter in this repo — a known pre-existing quirk; use the direct `node --import tsx --test` invocation for a focused run).
Expected: 3 new passing tests (the migration file already exists from Step 1) — if the first test fails with "no such table", re-check the filename matches `010_transaction_split.sql` exactly, since the runner globs `migrations/*.sql` sorted by filename.

- [ ] **Step 4: Commit**

```bash
git add migrations/010_transaction_split.sql test/migrations.test.ts
git commit -m "feat: add people table and transaction split columns"
```

---

## Task 2: Person domain layer + repository

**Files:**
- Modify: `src/domain/entities/index.ts` (append after `ResolvedModel`, end of file)
- Modify: `src/domain/ports/index.ts` (add `Person` to the import list, append `PersonRepository` after `MonthlyModelRepository`, end of file)
- Create: `src/infra/repositories/people.ts`
- Modify: `test/helpers.ts` (add `personId` fixture)
- Create: `test/people.test.ts`

**Interfaces:**
- Consumes: `Db` from `src/infra/db`.
- Produces: `Person` entity, `PersonRepository` port, `makeTestDb()` now also returns `personId: number`, and `makePersonRepository(db: Db): PersonRepository` — consumed by Task 3 (use case) and Task 4 (composition root), and by Task 5's/Task 6's transaction-split tests.

- [ ] **Step 1: Add the `Person` entity**

Append to `src/domain/entities/index.ts`:

```ts
// Quem participa de um split de transação (design 2026-08-14 "Data model").
// Soft-delete via `active`, como `categories`/`cards`: uma transação antiga
// continua resolvendo o nome mesmo depois que a pessoa é removida.
export interface Person {
  id: number;
  name: string;
  active: number; // 0 | 1
}
```

- [ ] **Step 2: Add the `PersonRepository` port**

In `src/domain/ports/index.ts`, change the import at the top to include `Person`:

```ts
import type {
  Card,
  Category,
  Group,
  InstallmentProgress,
  MonthlyModel,
  Person,
  RecurringTemplate,
  Transaction,
} from '../entities';
```

Append at the end of the file:

```ts
export interface PersonRepository {
  // Mesma forma de `CardRepository.listAll()` — todas as pessoas, ativas e
  // inativas: o cliente já filtra por `active` para os seletores (o mesmo
  // padrão de `GET /api/categories`/`GET /api/cards` hoje), e transações
  // antigas precisam resolver o nome de uma pessoa mesmo depois de removida.
  listAll(): Person[];
  findById(id: number): Person | undefined;
  insert(p: { name: string }): Person;
  update(id: number, p: { name: string; active: number }): number; // changes
}
```

- [ ] **Step 3: Add a `personId` fixture to the shared test helper**

Replace the contents of `test/helpers.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from '../src/infra/db';

export interface TestContext {
  db: Db;
  groupId: number;
  categoryId: number;
  cardId: number;
  personId: number;
}

export function makeTestDb(): TestContext {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && f !== '002_seed.sql' && f !== '007_seed_defaults.sql')
    .sort();
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db
    .prepare(
      "INSERT INTO categories (group_id, name, sort_order, essential) VALUES (?, 'Supermercado', 0, 1)",
    )
    .run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  const person = db.prepare("INSERT INTO people (name) VALUES ('Fulano')").run();
  return {
    db,
    groupId: Number(g.lastInsertRowid),
    categoryId: Number(c.lastInsertRowid),
    cardId: Number(card.lastInsertRowid),
    personId: Number(person.lastInsertRowid),
  };
}
```

- [ ] **Step 4: Write the failing repository tests**

Create `test/people.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makePersonRepository } = require('../src/infra/repositories/people');

test('insert + listAll round-trips a person, active by default', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  assert.equal(p.name, 'Ciclano');
  assert.equal(p.active, 1);
  const all = repo.listAll();
  // ctx já criou 'Fulano' no fixture — 'Ciclano' se soma a ele.
  assert.deepEqual(
    all.map((x) => x.name).sort(),
    ['Ciclano', 'Fulano'],
  );
});

test('listAll includes inactive people — the client filters, same as categories/cards', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  repo.update(p.id, { name: 'Ciclano', active: 0 });
  const all = repo.listAll();
  assert.equal(all.length, 2); // Fulano (fixture) + Ciclano, mesmo inativo
});

test('update changes name and active, and reports 0 changes for an unknown id', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  const changes = repo.update(p.id, { name: 'Beltrano', active: 0 });
  assert.equal(changes, 1);
  const found = repo.findById(p.id);
  assert.equal(found.name, 'Beltrano');
  assert.equal(found.active, 0);
  assert.equal(repo.update(99999, { name: 'x', active: 1 }), 0);
});

test('findById resolves an inactive person — an old transaction still shows the name', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  repo.update(p.id, { name: 'Ciclano', active: 0 });
  const found = repo.findById(p.id);
  assert.equal(found.name, 'Ciclano');
  assert.equal(found.active, 0);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `node --import tsx --test test/people.test.ts`
Expected: FAIL — `Cannot find module '../src/infra/repositories/people'`

- [ ] **Step 6: Implement the repository**

Create `src/infra/repositories/people.ts`:

```ts
import type { Person } from '../../domain/entities';
import type { PersonRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makePersonRepository(db: Db): PersonRepository {
  return {
    listAll(): Person[] {
      return db.prepare('SELECT * FROM people ORDER BY id').all() as Person[];
    },
    findById(id: number): Person | undefined {
      return db.prepare('SELECT * FROM people WHERE id=?').get(id) as Person | undefined;
    },
    insert(p) {
      const r = db.prepare('INSERT INTO people (name) VALUES (?)').run(p.name);
      return db.prepare('SELECT * FROM people WHERE id=?').get(r.lastInsertRowid) as Person;
    },
    update(id, p) {
      return db.prepare('UPDATE people SET name=?, active=? WHERE id=?').run(p.name, p.active, id)
        .changes;
    },
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --import tsx --test test/people.test.ts`
Expected: 4 passing tests.

- [ ] **Step 8: Run the full suite (helpers.ts touches every test file)**

Run: `npm test`
Expected: all passing — `test/helpers.ts`'s new `personId` field is purely additive, so no existing test should break.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/people.ts test/helpers.ts test/people.test.ts
git commit -m "feat: add Person entity, port, and sqlite repository"
```

---

## Task 3: Person application use case

**Files:**
- Create: `src/application/use-cases/people.ts`
- Test: `test/people.test.ts` (append)

**Interfaces:**
- Consumes: `PersonRepository` (Task 2) — `listAll`, `findById`, `insert`, `update`.
- Produces: `makePersonUseCases(deps: { people: PersonRepository })` returning `{ list(), create(input), update(id, input) }` — consumed by Task 4 (HTTP controller).

- [ ] **Step 1: Write the failing use-case tests**

Append to `test/people.test.ts`:

```ts
const { makePersonUseCases } = require('../src/application/use-cases/people');

function ucFor(ctx) {
  return makePersonUseCases({ people: makePersonRepository(ctx.db) });
}

test('use case create makes a new active person', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  assert.equal(p.name, 'Ciclano');
  assert.equal(p.active, 1);
});

test('use case update edits the person and 404s on an unknown id', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  const updated = uc.update(p.id, { name: 'Beltrano', active: 0 });
  assert.equal(updated.name, 'Beltrano');
  assert.equal(updated.active, 0);
  assert.throws(() => uc.update(99999, { name: 'x' }), /person not found/);
});

test('use case update defaults active to 1 when omitted', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  const updated = uc.update(p.id, { name: 'Ciclano' });
  assert.equal(updated.active, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test test/people.test.ts`
Expected: FAIL — `Cannot find module '../src/application/use-cases/people'`

- [ ] **Step 3: Implement the use case**

Create `src/application/use-cases/people.ts`:

```ts
import type { Person } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { PersonRepository } from '../../domain/ports';

export interface PersonUseCaseDeps {
  people: PersonRepository;
}

export interface CreatePersonInput {
  name: string;
}

export interface UpdatePersonInput {
  name: string;
  active?: number;
}

export function makePersonUseCases(deps: PersonUseCaseDeps) {
  const { people } = deps;

  return {
    list(): Person[] {
      return people.listAll();
    },
    create(input: CreatePersonInput): Person {
      return people.insert({ name: input.name });
    },
    update(id: number, input: UpdatePersonInput): Person {
      const active = (input.active ?? 1) ? 1 : 0;
      if (people.update(id, { name: input.name, active }) === 0) {
        throw new AppError(404, 'person not found');
      }
      return people.findById(id) as Person;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test test/people.test.ts`
Expected: 7 passing tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/application/use-cases/people.ts test/people.test.ts
git commit -m "feat: add people use case"
```

---

## Task 4: Person HTTP layer + wiring

**Files:**
- Create: `src/adapters/http/controllers/people.ts`
- Modify: `src/infra/composition.ts`
- Modify: `src/app.ts` (add mount line after line 22, `/api/cards`)
- Test: `test/people.test.ts` (append)

**Interfaces:**
- Consumes: `makePersonUseCases` (Task 3), `makePersonRepository` (Task 2), `nameBodySchema` from `src/adapters/http/schemas/common.ts` (already exists — reused as-is, no new schema file needed: `GET /api/people` / `POST /api/people` / `PUT /api/people/:id` validate exactly like `cards`' controller does today).
- Produces: `GET/POST /api/people`, `PUT /api/people/:id`, and `controllers.people: express.Router` on the `Container` — consumed by Task 8 (frontend).

- [ ] **Step 1: Write the controller**

Create `src/adapters/http/controllers/people.ts`:

```ts
import express from 'express';
import type { makePersonUseCases } from '../../../application/use-cases/people';
import { nameBodySchema } from '../schemas/common';
import { parse } from '../validate';

type PersonUseCases = ReturnType<typeof makePersonUseCases>;

export function makePeopleController(uc: PersonUseCases): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(uc.list()));

  router.post('/', (req, res) => {
    parse(nameBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    parse(nameBodySchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });

  return router;
}
```

- [ ] **Step 2: Wire into the composition root**

In `src/infra/composition.ts`:

Add to the controller imports (alphabetical — between `monthlyModel` and `recurring`):
```ts
import { makePeopleController } from '../adapters/http/controllers/people';
```

Add to the use-case imports (alphabetical — between `model` and `recurring`):
```ts
import { makePersonUseCases } from '../application/use-cases/people';
```

Add to the repository imports (alphabetical — between `monthlyModel` and `recurring`):
```ts
import { makePersonRepository } from './repositories/people';
```

Add `people: express.Router;` to the `Container['controllers']` interface (next to `monthlyModel: express.Router;`).

In `repositories`, add:
```ts
people: makePersonRepository(db),
```
(next to `monthlyModel: makeMonthlyModelRepository(db),`).

In `useCases`, add:
```ts
people: makePersonUseCases({ people: repositories.people }),
```
right after the `model,` entry at the top of the object (the `useCases` object here isn't in strict alphabetical order — `model` comes first because of an initialization-order comment above it; `people` is a simple reference-data use case like `model`, so it belongs in that same early group, immediately after it).

In `controllers`, add:
```ts
people: makePeopleController(useCases.people),
```
(next to `monthlyModel: makeMonthlyModelController(useCases.model),`).

- [ ] **Step 3: Mount the router**

In `src/app.ts`, add after line 22 (`app.use('/api/cards', controllers.cards);`):

```ts
  app.use('/api/people', controllers.people);
```

- [ ] **Step 4: Write the failing HTTP tests**

Append to `test/people.test.ts`:

```ts
const request = require('supertest');
const { createApp } = require('../src/app');

test('GET /api/people lists everyone, active and inactive', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app).post('/api/people').send({ name: 'Ciclano' }).expect(201);
  await request(app)
    .put(`/api/people/${created.body.id}`)
    .send({ name: 'Ciclano', active: 0 })
    .expect(200);
  const list = await request(app).get('/api/people').expect(200);
  // Fulano (fixture) + Ciclano, mesmo inativo — GET não filtra, como
  // /api/categories e /api/cards hoje.
  assert.equal(list.body.length, 2);
});

test('POST /api/people requires a name', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/people').send({}).expect(400);
  await request(app).post('/api/people').send({ name: '' }).expect(400);
});

test('PUT /api/people/:id updates name and active, 404 on unknown id', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app).post('/api/people').send({ name: 'Ciclano' }).expect(201);
  const updated = await request(app)
    .put(`/api/people/${created.body.id}`)
    .send({ name: 'Beltrano', active: 0 })
    .expect(200);
  assert.equal(updated.body.name, 'Beltrano');
  assert.equal(updated.body.active, 0);
  await request(app).put('/api/people/99999').send({ name: 'x' }).expect(404);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test test/people.test.ts`
Expected: 10 passing tests (4 repo + 3 use case + 3 HTTP).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/http/controllers/people.ts src/infra/composition.ts src/app.ts test/people.test.ts
git commit -m "feat: expose /api/people CRUD"
```

---

## Task 5: Transaction entity/port/repository gain split columns

**Files:**
- Modify: `src/domain/entities/index.ts` (the `Transaction` interface)
- Modify: `src/domain/ports/index.ts` (the `TransactionRepository` interface — `insert`/`update` signatures)
- Modify: `src/infra/repositories/transactions.ts` (whole file)
- Test: `test/transactions.test.ts` (append repository-level tests)

**Interfaces:**
- Produces: `Transaction.split_person_id: number | null`, `split_percent: number | null`, `split_received: number`; `TransactionRepository.insert`/`update` accept optional `split_person_id?: number | null` / `split_percent?: number | null` (optional so this task alone stays green — the still-unmodified use case in Task 6 doesn't pass them yet, and the repository defaults to `null`). Consumed by Task 6 (use case) and Task 7 (`setSplitReceived`/`listReceivables`, added directly to this same port/repository in that task).

- [ ] **Step 1: Update the `Transaction` entity**

In `src/domain/entities/index.ts`, replace the `Transaction` interface:

```ts
export interface Transaction {
  id: number;
  date: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  description: string;
  installment_group_id: number | null;
  installment_no: number | null;
  installment_total: number | null;
  split_person_id: number | null;
  split_percent: number | null;
  split_received: number; // 0 | 1
}
```

- [ ] **Step 2: Update the `TransactionRepository` port**

In `src/domain/ports/index.ts`, replace the `TransactionRepository` interface:

```ts
export interface TransactionRepository {
  list(p: TransactionPage): Transaction[];
  count(f: TransactionFilter): number;
  findById(id: number): Transaction | undefined;
  insert(t: {
    date: string;
    category_id: number;
    card_id: number;
    amount_cents: number;
    description: string;
    split_person_id?: number | null;
    split_percent?: number | null;
  }): Transaction;
  update(
    id: number,
    t: {
      date: string;
      category_id: number;
      card_id: number;
      amount_cents: number;
      description: string;
      split_person_id?: number | null;
      split_percent?: number | null;
    },
  ): number;
  remove(id: number): number;
  firstByGroup(groupId: number): Transaction | undefined;
}
```

- [ ] **Step 3: Write the failing repository tests**

Append to `test/transactions.test.ts`:

```ts
const { makeTransactionRepository } = require('../src/infra/repositories/transactions');

test('transaction repository stores and reads split fields', () => {
  const ctx = makeTestDb();
  const repo = makeTransactionRepository(ctx.db);
  const t = repo.insert({
    date: '2026-06-10',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Jantar',
    split_person_id: ctx.personId,
    split_percent: 50,
  });
  assert.equal(t.split_person_id, ctx.personId);
  assert.equal(t.split_percent, 50);
  assert.equal(t.split_received, 0);
});

test('transaction repository defaults split fields to null when omitted', () => {
  const ctx = makeTestDb();
  const repo = makeTransactionRepository(ctx.db);
  const t = repo.insert({
    date: '2026-06-10',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Jantar',
  });
  assert.equal(t.split_person_id, null);
  assert.equal(t.split_percent, null);
});

test('transaction repository update overwrites split fields, including clearing them', () => {
  const ctx = makeTestDb();
  const repo = makeTransactionRepository(ctx.db);
  const t = repo.insert({
    date: '2026-06-10',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Jantar',
    split_person_id: ctx.personId,
    split_percent: 50,
  });
  repo.update(t.id, {
    date: t.date,
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Jantar',
    split_person_id: null,
    split_percent: null,
  });
  const updated = repo.findById(t.id);
  assert.equal(updated.split_person_id, null);
  assert.equal(updated.split_percent, null);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: FAIL — the existing `insert`/`update` SQL doesn't touch the split columns yet, so `t.split_person_id`/`t.split_percent` come back `undefined` from the entity typing mismatch, or the test throws — either way, red.

- [ ] **Step 5: Implement the repository**

Replace the contents of `src/infra/repositories/transactions.ts`:

```ts
import type { Transaction } from '../../domain/entities';
import type { TransactionFilter, TransactionPage, TransactionRepository } from '../../domain/ports';
import type { Db } from '../db';

function buildWhere(f: TransactionFilter): { clause: string; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.month !== undefined) {
    where.push("strftime('%Y-%m', date) = ?");
    args.push(f.month);
  }
  if (f.categoryId !== undefined) {
    where.push('category_id = ?');
    args.push(f.categoryId);
  }
  if (f.cardId !== undefined) {
    where.push('card_id = ?');
    args.push(f.cardId);
  }
  if (f.q !== undefined && f.q !== '') {
    where.push('description LIKE ?');
    args.push(`%${f.q}%`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

export function makeTransactionRepository(db: Db): TransactionRepository {
  return {
    list(p: TransactionPage): Transaction[] {
      const { clause, args } = buildWhere(p);
      let sql = `SELECT * FROM transactions ${clause} ORDER BY date DESC, id DESC`;
      const a = [...args];
      if (p.limit !== null && p.limit !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        a.push(p.limit, p.offset ?? 0);
      }
      return db.prepare(sql).all(...a) as Transaction[];
    },
    count(f: TransactionFilter): number {
      const { clause, args } = buildWhere(f);
      return (
        db.prepare(`SELECT COUNT(*) AS n FROM transactions ${clause}`).get(...args) as { n: number }
      ).n;
    },
    findById(id: number): Transaction | undefined {
      return db.prepare('SELECT * FROM transactions WHERE id=?').get(id) as Transaction | undefined;
    },
    insert(t) {
      const r = db
        .prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, split_person_id, split_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          t.date,
          t.category_id,
          t.card_id,
          t.amount_cents,
          t.description,
          t.split_person_id ?? null,
          t.split_percent ?? null,
        );
      return db
        .prepare('SELECT * FROM transactions WHERE id=?')
        .get(r.lastInsertRowid) as Transaction;
    },
    update(id, t) {
      return db
        .prepare(
          `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=?, split_person_id=?, split_percent=? WHERE id=?`,
        )
        .run(
          t.date,
          t.category_id,
          t.card_id,
          t.amount_cents,
          t.description,
          t.split_person_id ?? null,
          t.split_percent ?? null,
          id,
        ).changes;
    },
    remove(id: number): number {
      return db.prepare('DELETE FROM transactions WHERE id=?').run(id).changes;
    },
    firstByGroup(groupId: number): Transaction | undefined {
      return db
        .prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1')
        .get(groupId) as Transaction | undefined;
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: all passing, including the 3 new tests.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all green. The still-unmodified `src/application/use-cases/transactions.ts` calls `transactions.insert({...})`/`transactions.update(id, {...})` without the (now-optional) split fields — that's fine, the repository defaults them to `null`, and every existing transaction test keeps passing unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/domain/entities/index.ts src/domain/ports/index.ts src/infra/repositories/transactions.ts test/transactions.test.ts
git commit -m "feat: transactions repository stores split_person_id/split_percent"
```

---

## Task 6: Transaction use case + HTTP schema accept split fields

**Files:**
- Modify: `src/adapters/http/schemas/transactions.ts` (whole file)
- Modify: `src/application/use-cases/transactions.ts` (whole file)
- Modify: `src/infra/composition.ts` (the `transactions` use-case construction)
- Test: `test/transactions.test.ts` (append)

**Interfaces:**
- Consumes: `PersonRepository.findById` (Task 2), `repositories.people` (already wired in Task 4).
- Produces: `POST /api/transactions` and `PUT /api/transactions/:id` accept `split_person_id?`/`split_percent?` in the body (both together or neither, `split_percent` an integer `1..99`); `TransactionUseCaseDeps` gains `people: PersonRepository`. No controller change needed — `controllers/transactions.ts` already forwards `req.body` straight to `uc.create`/`uc.update` after validating shape (confirmed by reading the file: `parse(schema, req.body)` is called for its throw-on-failure side effect only, and the *raw* `req.body` — not the parsed/stripped result — is what reaches the use case, exactly like `category_id`/`card_id` do today).

- [ ] **Step 1: Update the schema**

Replace the contents of `src/adapters/http/schemas/transactions.ts`:

```ts
import { z } from 'zod';
import { zDate, zMonth, zPositiveInt } from './common';

const zSplitPersonId = z
  .union([zPositiveInt('split_person_id must be a positive integer'), z.null()])
  .optional();

const zSplitPercent = z
  .union([
    z.custom<number>((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99, {
      message: 'split_percent must be an integer 1..99',
    }),
    z.null(),
  ])
  .optional();

// split_person_id e split_percent chegam juntos ou nenhum dos dois — enviar só
// um dos dois deixaria a transação com metade de um split, que não é um
// estado válido (design 2026-08-14, "Data model").
function bothSplitFieldsOrNeither(v: { split_person_id?: number | null; split_percent?: number | null }) {
  const hasPerson = v.split_person_id !== undefined && v.split_person_id !== null;
  const hasPercent = v.split_percent !== undefined && v.split_percent !== null;
  return hasPerson === hasPercent;
}

const SPLIT_TOGETHER_MESSAGE = 'split_person_id and split_percent must be provided together';

// Single-shot transaction body: validates the same fields, in the same order,
// as the legacy route. category_id/card_id existence is enforced by the
// use-case (so a missing/unknown id yields "category_id does not exist").
export const singleTransactionSchema = z
  .object({
    date: zDate('date must be YYYY-MM-DD'),
    amount_cents: zPositiveInt('amount_cents must be a positive integer'),
    split_person_id: zSplitPersonId,
    split_percent: zSplitPercent,
  })
  .refine(bothSplitFieldsOrNeither, { message: SPLIT_TOGETHER_MESSAGE });

// Sem campos de split: parcelamento passa por `installments.createPurchase()`,
// que não tem colunas de split para gravar (§Global Constraints deste plano).
export const installmentTransactionSchema = z.object({
  installment_total_cents: zPositiveInt('installment_total_cents must be a positive integer'),
  installment_count: zPositiveInt('installment_count must be a positive integer'),
  first_month: zMonth('first_month must be YYYY-MM'),
});

export const updateTransactionSchema = z
  .object({
    date: zDate('date must be YYYY-MM-DD'),
    amount_cents: zPositiveInt('amount_cents must be a positive integer'),
    split_person_id: zSplitPersonId,
    split_percent: zSplitPercent,
  })
  .refine(bothSplitFieldsOrNeither, { message: SPLIT_TOGETHER_MESSAGE });
```

- [ ] **Step 2: Update the use case**

Replace the contents of `src/application/use-cases/transactions.ts`:

```ts
import type { Transaction } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type {
  CardRepository,
  CategoryRepository,
  InstallmentRepository,
  PersonRepository,
  TransactionPage,
  TransactionRepository,
} from '../../domain/ports';

export interface TransactionUseCaseDeps {
  transactions: TransactionRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  installments: InstallmentRepository;
  people: PersonRepository;
}

// Input has already passed HTTP-edge format validation; the use-case enforces
// existence rules and orchestrates persistence.
export interface CreateTransactionInput {
  date?: string;
  category_id: number;
  card_id: number;
  amount_cents?: number;
  description?: string;
  installment_total_cents?: number;
  installment_count?: number;
  first_month?: string;
  split_person_id?: number | null;
  split_percent?: number | null;
}

export interface UpdateTransactionInput {
  date: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  description?: string;
  split_person_id?: number | null;
  split_percent?: number | null;
}

export function makeTransactionUseCases(deps: TransactionUseCaseDeps) {
  const { transactions, categories, cards, installments, people } = deps;

  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  // O schema HTTP já garante que os dois campos chegam juntos ou nenhum dos
  // dois — aqui só falta confirmar que a pessoa referenciada existe (design
  // 2026-08-14, "Data model").
  function assertSplitPerson(personId: number | null | undefined): void {
    if (personId !== undefined && personId !== null && !people.findById(personId)) {
      throw new AppError(400, 'split_person_id does not exist');
    }
  }

  return {
    list(page: TransactionPage): { total: number; items: Transaction[] } {
      const filter = {
        month: page.month,
        categoryId: page.categoryId,
        cardId: page.cardId,
        q: page.q,
      };
      return { total: transactions.count(filter), items: transactions.list(page) };
    },

    create(input: CreateTransactionInput): Transaction {
      const description = input.description ?? '';
      const isInstallment =
        input.installment_count !== undefined || input.installment_total_cents !== undefined;
      assertRefs(input.category_id, input.card_id);

      if (isInstallment) {
        const groupId = installments.createPurchase({
          category_id: input.category_id,
          card_id: input.card_id,
          description,
          total_cents: input.installment_total_cents as number,
          count: input.installment_count as number,
          first_month: input.first_month as string,
        });
        const first = transactions.firstByGroup(groupId) as Transaction;
        return { ...first, installment_group_id: groupId };
      }

      assertSplitPerson(input.split_person_id);
      return transactions.insert({
        date: input.date as string,
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents as number,
        description,
        split_person_id: input.split_person_id ?? null,
        split_percent: input.split_percent ?? null,
      });
    },

    update(id: number, input: UpdateTransactionInput): Transaction {
      assertRefs(input.category_id, input.card_id);
      assertSplitPerson(input.split_person_id);
      const changes = transactions.update(id, {
        date: input.date,
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents,
        description: input.description ?? '',
        split_person_id: input.split_person_id ?? null,
        split_percent: input.split_percent ?? null,
      });
      if (changes === 0) throw new AppError(404, 'transaction not found');
      return transactions.findById(id) as Transaction;
    },

    remove(id: number): void {
      if (transactions.remove(id) === 0) throw new AppError(404, 'transaction not found');
    },

    exportCsv(filter: {
      month?: string;
      categoryId?: number;
      cardId?: number;
      q?: string;
    }): string {
      const items = transactions.list({ ...filter, limit: null, offset: 0 });
      const catName = new Map(categories.listAll().map((c) => [c.id, c.name]));
      const cardName = new Map(cards.listAll().map((c) => [c.id, c.name]));
      const cell = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        'date',
        'category',
        'card',
        'amount_cents',
        'description',
        'installment_no',
        'installment_total',
      ];
      const rows = items.map((t) =>
        [
          t.date,
          catName.get(t.category_id) ?? '',
          cardName.get(t.card_id) ?? '',
          t.amount_cents,
          t.description,
          t.installment_no ?? '',
          t.installment_total ?? '',
        ]
          .map(cell)
          .join(','),
      );
      return [header.join(','), ...rows].join('\n');
    },
  };
}
```

- [ ] **Step 3: Wire `people` into the composition root**

In `src/infra/composition.ts`, change the `transactions` use-case construction:

```ts
    transactions: makeTransactionUseCases({
      transactions: repositories.transactions,
      categories: repositories.categories,
      cards: repositories.cards,
      installments: repositories.installments,
      people: repositories.people,
    }),
```

(`repositories.people` already exists from Task 4, Step 2.)

- [ ] **Step 4: Write the failing tests**

Append to `test/transactions.test.ts`:

```ts
test('create with split_person_id + split_percent stores all three split fields', async () => {
  const { app, ctx } = appWith();
  const t = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      description: 'Jantar',
      split_person_id: ctx.personId,
      split_percent: 50,
    })
    .expect(201);
  assert.equal(t.body.split_person_id, ctx.personId);
  assert.equal(t.body.split_percent, 50);
  assert.equal(t.body.split_received, 0);
});

test('split_person_id and split_percent must be sent together', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
    })
    .expect(400);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_percent: 50,
    })
    .expect(400);
});

test('split_percent must be an integer 1..99', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
      split_percent: 0,
    })
    .expect(400);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
      split_percent: 100,
    })
    .expect(400);
});

test('split_person_id must reference an existing person', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: 99999,
      split_percent: 50,
    })
    .expect(400);
});

test('editing a transaction to remove the split sends both fields as null', async () => {
  const { app, ctx } = appWith();
  const created = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
      split_percent: 50,
    })
    .expect(201);
  const updated = await request(app)
    .put(`/api/transactions/${created.body.id}`)
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: null,
      split_percent: null,
    })
    .expect(200);
  assert.equal(updated.body.split_person_id, null);
  assert.equal(updated.body.split_percent, null);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: all passing, including the 5 new tests.

- [ ] **Step 6: Run the full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/http/schemas/transactions.ts src/application/use-cases/transactions.ts src/infra/composition.ts test/transactions.test.ts
git commit -m "feat: transactions accept an optional split on create/edit"
```

---

## Task 7: split-received toggle + receivables listing

**Files:**
- Modify: `src/domain/ports/index.ts` (append to `TransactionRepository`)
- Modify: `src/infra/repositories/transactions.ts` (append two methods)
- Modify: `src/application/use-cases/transactions.ts` (append two methods)
- Modify: `src/adapters/http/controllers/transactions.ts` (append three routes)
- Test: `test/transactions.test.ts` (append)

**Interfaces:**
- Produces: `POST /api/transactions/:id/split-received`, `DELETE /api/transactions/:id/split-received`, `GET /api/transactions/receivables` — consumed by Task 9 (dashboard frontend).

- [ ] **Step 1: Extend the `TransactionRepository` port**

In `src/domain/ports/index.ts`, append to the `TransactionRepository` interface, right after `firstByGroup(groupId: number): Transaction | undefined;` (still inside the interface body, before its closing `}`):

```ts
  setSplitReceived(id: number, received: boolean): void;
  listReceivables(): Array<{
    transaction_id: number;
    person_id: number;
    person_name: string;
    description: string;
    month: string;
    amount_cents: number; // amount_cents * split_percent / 100, calculado na leitura
    received: number; // 0 | 1
  }>;
```

- [ ] **Step 2: Write the failing repository tests**

Append to `test/transactions.test.ts`:

```ts
test('setSplitReceived flips split_received and back', () => {
  const ctx = makeTestDb();
  const repo = makeTransactionRepository(ctx.db);
  const t = repo.insert({
    date: '2026-06-10',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Jantar',
    split_person_id: ctx.personId,
    split_percent: 50,
  });
  repo.setSplitReceived(t.id, true);
  assert.equal(repo.findById(t.id).split_received, 1);
  repo.setSplitReceived(t.id, false);
  assert.equal(repo.findById(t.id).split_received, 0);
});

test('listReceivables computes the owed amount and excludes transactions without a split', () => {
  const ctx = makeTestDb();
  const repo = makeTransactionRepository(ctx.db);
  repo.insert({
    date: '2026-02-05',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 20000,
    description: 'Presente',
    split_person_id: ctx.personId,
    split_percent: 25,
  });
  repo.insert({
    date: '2026-03-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    description: 'Sem split',
  });
  const rows = repo.listReceivables();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_cents, 5000); // 20000 * 25 / 100
  assert.equal(rows[0].month, '2026-02');
  assert.equal(rows[0].person_name, 'Fulano');
  assert.equal(rows[0].received, 0);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: FAIL — `repo.setSplitReceived is not a function` / `repo.listReceivables is not a function`.

- [ ] **Step 4: Implement the repository methods**

In `src/infra/repositories/transactions.ts`, append to the returned object, right after `firstByGroup(groupId: number): Transaction | undefined { ... },` (before the closing `};`):

```ts
    setSplitReceived(id, received) {
      db.prepare('UPDATE transactions SET split_received=? WHERE id=?').run(received ? 1 : 0, id);
    },
    listReceivables() {
      return db
        .prepare(
          `SELECT
             t.id AS transaction_id,
             t.split_person_id AS person_id,
             p.name AS person_name,
             t.description,
             strftime('%Y-%m', t.date) AS month,
             CAST(ROUND(t.amount_cents * t.split_percent / 100.0) AS INTEGER) AS amount_cents,
             t.split_received AS received
           FROM transactions t
           JOIN people p ON p.id = t.split_person_id
           ORDER BY t.date DESC, t.id DESC`,
        )
        .all() as Array<{
        transaction_id: number;
        person_id: number;
        person_name: string;
        description: string;
        month: string;
        amount_cents: number;
        received: number;
      }>;
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: all passing, including the 2 new repository tests.

- [ ] **Step 6: Extend the use case**

In `src/application/use-cases/transactions.ts`, append two methods to the returned object, right after `remove(id: number): void { ... },` and before `exportCsv(...)`:

```ts
    // Erro 400 sem split: não faz sentido "marcar recebido" numa transação que
    // nunca teve dívida nenhuma (design "API").
    setSplitReceived(id: number, received: boolean): void {
      const tx = transactions.findById(id);
      if (!tx) throw new AppError(404, 'transaction not found');
      if (tx.split_person_id === null) throw new AppError(400, 'transaction has no split');
      transactions.setSplitReceived(id, received);
    },

    // Sem filtro de mês: uma dívida de fevereiro continua valendo em abril
    // (design "API").
    listReceivables() {
      return transactions.listReceivables();
    },
```

- [ ] **Step 7: Add the routes**

In `src/adapters/http/controllers/transactions.ts`, append three routes right before `return router;`:

```ts
  router.post('/:id/split-received', (req, res) => {
    uc.setSplitReceived(Number(req.params.id), true);
    res.status(204).end();
  });

  router.delete('/:id/split-received', (req, res) => {
    uc.setSplitReceived(Number(req.params.id), false);
    res.status(204).end();
  });

  router.get('/receivables', (_req, res) => {
    res.json(uc.listReceivables());
  });
```

- [ ] **Step 8: Write the failing HTTP tests**

Append to `test/transactions.test.ts`:

```ts
test('POST /:id/split-received marks a split transaction as received', async () => {
  const { app, ctx } = appWith();
  const t = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
      split_percent: 50,
    })
    .expect(201);
  await request(app).post(`/api/transactions/${t.body.id}/split-received`).expect(204);
  const receivables = await request(app).get('/api/transactions/receivables').expect(200);
  assert.equal(receivables.body.length, 1);
  assert.equal(receivables.body[0].received, 1);
});

test('DELETE /:id/split-received unmarks it back to pending', async () => {
  const { app, ctx } = appWith();
  const t = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
      split_person_id: ctx.personId,
      split_percent: 50,
    })
    .expect(201);
  await request(app).post(`/api/transactions/${t.body.id}/split-received`).expect(204);
  await request(app).delete(`/api/transactions/${t.body.id}/split-received`).expect(204);
  const receivables = await request(app).get('/api/transactions/receivables').expect(200);
  assert.equal(receivables.body[0].received, 0);
});

test('split-received on a transaction with no split -> 400', async () => {
  const { app, ctx } = appWith();
  const t = await request(app)
    .post('/api/transactions')
    .send({ date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000 })
    .expect(201);
  await request(app).post(`/api/transactions/${t.body.id}/split-received`).expect(400);
});

test('split-received on a nonexistent transaction -> 404', async () => {
  const { app } = appWith();
  await request(app).post('/api/transactions/99999/split-received').expect(404);
});

test('GET /api/transactions/receivables spans months and needs no month filter', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-02-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 20000,
      split_person_id: ctx.personId,
      split_percent: 25,
    })
    .expect(201);
  const r = await request(app).get('/api/transactions/receivables').expect(200);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].amount_cents, 5000); // 20000 * 25 / 100
  assert.equal(r.body[0].month, '2026-02');
  assert.equal(r.body[0].person_name, 'Fulano');
});

test('GET /api/transactions/receivables excludes transactions without a split', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({ date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000 })
    .expect(201);
  const r = await request(app).get('/api/transactions/receivables').expect(200);
  assert.equal(r.body.length, 0);
});
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `node --import tsx --test test/transactions.test.ts`
Expected: all passing, including the 5 new HTTP tests.

- [ ] **Step 10: Run the full suite, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green. In particular confirm `test/dashboard.test.ts` and `test/bi.test.ts` need zero changes (see this plan's Global Constraints / Deviation 6) — no aggregate query touches the new columns.

- [ ] **Step 11: Commit**

```bash
git add src/domain/ports/index.ts src/infra/repositories/transactions.ts src/application/use-cases/transactions.ts src/adapters/http/controllers/transactions.ts test/transactions.test.ts
git commit -m "feat: mark splits as received and list what is still owed"
```

---

## Task 8: Frontend — Registrar (split toggle, person field, list tag)

**Files:**
- Modify: `public/js/quickentry.js` (the `NOUN` map)
- Modify: `public/js/registrar.js` (whole file — see per-section replacements below)
- Modify: `public/registrar.html` (new toggle button, new `splitFields` block, new `person-list` datalist)
- Test: `test/quickentry.test.ts` (append)
- Test: `test/registrarRender.test.ts` (append)

**Interfaces:**
- Consumes: `GET/POST /api/people` (Task 4), `POST/PUT /api/transactions` with split fields (Task 6), `resolveRef`/`entryHint` from `public/js/quickentry.js` (already imported, now also usable for `kind: 'person'`).
- Produces: nothing consumed elsewhere in this plan — Task 9 is a separate page.

**Design note on why split is a third *mutually exclusive* toggle, not a fourth independent one:** the spec places "+ dividir com alguém" "ao lado de" the installment/recurring toggles without saying whether it composes with them. It can't, mechanically: an installment purchase is expanded into N rows by `installments.createPurchase()` (no split columns to write to), and "+ repete todo mês" posts to `/api/recurring`, a completely different endpoint with no split fields at all. The existing `advancedMode()` in `registrar.js` already treats installment and recurring as mutually exclusive (`setAdvanced(which)` shows exactly one block); this task extends that same switch to a third value, `'split'`, rather than inventing independent-toggle semantics the backend can't support yet.

- [ ] **Step 1: Add `person` to quickentry's noun map**

In `public/js/quickentry.js`, change:

```js
const NOUN = {
  category: { article: 'a', word: 'categoria' },
  card: { article: 'o', word: 'cartão' },
};
```

to:

```js
const NOUN = {
  category: { article: 'a', word: 'categoria' },
  card: { article: 'o', word: 'cartão' },
  person: { article: 'a', word: 'pessoa' },
};
```

- [ ] **Step 2: Write the failing quickentry test**

Append to `test/quickentry.test.ts`:

```ts
test('entryHint knows the noun for a person', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  const people = [{ id: 1, name: 'Fulano', active: 1 }];
  assert.equal(entryHint('Ciclano', people, 'person'), '↵ cria a pessoa Ciclano');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --import tsx --test test/quickentry.test.ts`
Expected: FAIL — `entryHint('Ciclano', people, 'person')` returns `undefined`/throws (`NOUN.person` is undefined), not `'↵ cria a pessoa Ciclano'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/quickentry.test.ts`
Expected: pass (Step 1's edit already fixes it — this step just confirms).

- [ ] **Step 5: Add the toggle button and split fields to `registrar.html`**

In `public/registrar.html`, change:

```html
      <div class="border-t border-line mt-4 pt-3 flex flex-wrap gap-6 text-sm">
        <button type="button" id="toggleInstallment" class="text-ink-mut hover:text-sage">+ dividir em N vezes</button>
        <button type="button" id="toggleRecurring" class="text-ink-mut hover:text-sage">+ repete todo mês</button>
        <button type="button" id="cancelEdit" class="text-clay ml-auto" style="display:none">Cancelar edição</button>
      </div>
      <div id="installmentFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span># parcelas</span><input type="number" id="count" min="2" /></label>
        <label class="field w-40"><span>Primeiro mês</span><input type="month" id="firstMonth" /></label>
      </div>
      <div id="recurringFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span>Dia do mês</span><input type="number" id="dayOfMonth" min="1" max="31" /></label>
      </div>
```

to:

```html
      <div class="border-t border-line mt-4 pt-3 flex flex-wrap gap-6 text-sm">
        <button type="button" id="toggleInstallment" class="text-ink-mut hover:text-sage">+ dividir em N vezes</button>
        <button type="button" id="toggleRecurring" class="text-ink-mut hover:text-sage">+ repete todo mês</button>
        <button type="button" id="toggleSplit" class="text-ink-mut hover:text-sage">+ dividir com alguém</button>
        <button type="button" id="cancelEdit" class="text-clay ml-auto" style="display:none">Cancelar edição</button>
      </div>
      <div id="installmentFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span># parcelas</span><input type="number" id="count" min="2" /></label>
        <label class="field w-40"><span>Primeiro mês</span><input type="month" id="firstMonth" /></label>
      </div>
      <div id="recurringFields" class="flex flex-wrap gap-3 mt-3" style="display:none">
        <label class="field w-32"><span>Dia do mês</span><input type="number" id="dayOfMonth" min="1" max="31" /></label>
      </div>
      <div id="splitFields" class="flex flex-wrap items-end gap-3 mt-3" style="display:none">
        <label class="field w-44"><span>Pessoa</span><input type="text" id="q-person" list="person-list" autocomplete="off" /></label>
        <label class="field w-28"><span>% dela/dele</span><input type="number" id="splitPercent" min="1" max="99" /></label>
        <span id="q-person-hint" class="text-xs text-clay mb-2"></span>
      </div>
      <datalist id="person-list"></datalist>
```

- [ ] **Step 6: Update `lookups`/`state` and `renderRows`**

In `public/js/registrar.js`, change:

```js
const lookups = { cats: new Map(), cards: new Map() };
// Data e cartão persistem entre lançamentos: o caso comum é lançar vários gastos
// do mesmo cartão, no mesmo dia (spec §7).
const sticky = { date: new Date().toISOString().slice(0, 10), card: '' };
const state = { cats: [], cards: [] };

export function renderRows(rows, refs = { cats: new Map(), cards: new Map() }) {
  return rows
    .map((r) => {
      const cardName = refs.cards.get(r.card_id) ?? '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${shortDate(r.date)}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-sm">${esc(refs.cats.get(r.category_id)?.name ?? '')}</td>
      <td class="py-3 text-sm text-ink-mut">${esc(cardName)}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Editar</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Excluir</button>
      </td>
    </tr>`;
    })
    .join('');
}
```

to:

```js
const lookups = { cats: new Map(), cards: new Map(), people: new Map() };
// Data e cartão persistem entre lançamentos: o caso comum é lançar vários gastos
// do mesmo cartão, no mesmo dia (spec §7).
const sticky = { date: new Date().toISOString().slice(0, 10), card: '' };
const state = { cats: [], cards: [], people: [] };

export function renderRows(rows, refs = { cats: new Map(), cards: new Map(), people: new Map() }) {
  return rows
    .map((r) => {
      const cardName = refs.cards.get(r.card_id) ?? '';
      const splitTag = r.split_person_id
        ? `<span class="tag tag-sage ml-2">${r.split_percent}% ${esc(refs.people?.get(r.split_person_id) ?? '')}</span>`
        : '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${shortDate(r.date)}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}${splitTag}</td>
      <td class="py-3 text-sm">${esc(refs.cats.get(r.category_id)?.name ?? '')}</td>
      <td class="py-3 text-sm text-ink-mut">${esc(cardName)}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Editar</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Excluir</button>
      </td>
    </tr>`;
    })
    .join('');
}
```

- [ ] **Step 7: Write the failing render tests**

Append to `test/registrarRender.test.ts`:

```ts
test('renderRows shows a split tag with percent and person name', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 20,
        date: '2026-06-15',
        description: 'Jantar',
        category_id: 1,
        card_id: 1,
        amount_cents: 10000,
        split_person_id: 3,
        split_percent: 50,
      },
    ],
    {
      cats: new Map([[1, { name: 'Restaurantes' }]]),
      cards: new Map([[1, 'Nubank']]),
      people: new Map([[3, 'Fulano']]),
    },
  );
  assert.match(html, /50% Fulano/);
  assert.match(html, /tag-sage/);
});

test('renderRows escapes the split person name', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 21,
        date: '2026-06-15',
        description: 'Jantar',
        category_id: 1,
        card_id: 1,
        amount_cents: 10000,
        split_person_id: 3,
        split_percent: 50,
      },
    ],
    {
      cats: new Map([[1, { name: 'Restaurantes' }]]),
      cards: new Map([[1, 'Nubank']]),
      people: new Map([[3, '<b>Fulano</b>']]),
    },
  );
  assert.match(html, /&lt;b&gt;Fulano&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Fulano/);
});
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `node --import tsx --test test/registrarRender.test.ts`
Expected: FAIL — `renderRows` doesn't render a split tag yet (Step 6 not applied).

- [ ] **Step 9: Run tests to verify they pass**

Run: `node --import tsx --test test/registrarRender.test.ts`
Expected: all passing, including the existing `renderRows shows the category name without any group chip` test (`assert.doesNotMatch(html, /tag-sage|.../)`), which stays green because its row has no `split_person_id`.

- [ ] **Step 10: Update `loadSelectors`**

In `public/js/registrar.js`, change:

```js
async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  state.cats = cats;
  state.cards = cards;
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
  mountEntryRow();
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  const active = (list) =>
    list
      .filter((c) => c.active)
      .map(opt)
      .join('');
  $('filterCategory').innerHTML = `<option value="">Todas as categorias</option>${active(cats)}`;
  $('filterCard').innerHTML = `<option value="">Todos os cartões</option>${active(cards)}`;
}
```

to:

```js
async function loadSelectors() {
  const [cats, cards, people] = await Promise.all([
    api.get('/api/categories'),
    api.get('/api/cards'),
    api.get('/api/people'),
  ]);
  state.cats = cats;
  state.cards = cards;
  state.people = people;
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
  lookups.people = new Map(people.map((p) => [p.id, p.name]));
  mountEntryRow();
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  const active = (list) =>
    list
      .filter((c) => c.active)
      .map(opt)
      .join('');
  $('filterCategory').innerHTML = `<option value="">Todas as categorias</option>${active(cats)}`;
  $('filterCard').innerHTML = `<option value="">Todos os cartões</option>${active(cards)}`;
  $('person-list').innerHTML = people
    .filter((p) => p.active)
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join('');
}
```

- [ ] **Step 11: Update `setAdvanced`/`advancedMode`**

In `public/js/registrar.js`, change:

```js
function setAdvanced(which) {
  $('installmentFields').style.display = which === 'installment' ? 'flex' : 'none';
  $('recurringFields').style.display = which === 'recurring' ? 'flex' : 'none';
}

function advancedMode() {
  if ($('installmentFields').style.display === 'flex') return 'installment';
  if ($('recurringFields').style.display === 'flex') return 'recurring';
  return null;
}
```

to:

```js
function setAdvanced(which) {
  $('installmentFields').style.display = which === 'installment' ? 'flex' : 'none';
  $('recurringFields').style.display = which === 'recurring' ? 'flex' : 'none';
  $('splitFields').style.display = which === 'split' ? 'flex' : 'none';
}

function advancedMode() {
  if ($('installmentFields').style.display === 'flex') return 'installment';
  if ($('recurringFields').style.display === 'flex') return 'recurring';
  if ($('splitFields').style.display === 'flex') return 'split';
  return null;
}
```

- [ ] **Step 12: Update `startEdit` and `resetForm`**

In `public/js/registrar.js`, change:

```js
function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  setAdvanced(null);
  $('q-date').value = r.date;
  $('q-desc').value = r.description;
  $('q-cat').value = lookups.cats.get(r.category_id)?.name ?? '';
  $('q-card').value = lookups.cards.get(r.card_id) ?? '';
  $('q-amount').value = (r.amount_cents / 100).toFixed(2).replace('.', ',');
  $('q-submit').textContent = 'Salvar';
  $('cancelEdit').style.display = 'inline';
  refreshHints();
  $('q-desc').focus();
}

function resetForm() {
  editingId = null;
  setAdvanced(null);
  $('q-desc').value = '';
  $('q-cat').value = '';
  $('q-amount').value = '';
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  $('q-submit').textContent = 'Adicionar';
  $('cancelEdit').style.display = 'none';
}
```

to:

```js
function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  if (r.split_person_id) {
    setAdvanced('split');
    $('q-person').value = lookups.people.get(r.split_person_id) ?? '';
    $('splitPercent').value = r.split_percent;
  } else {
    setAdvanced(null);
  }
  $('q-date').value = r.date;
  $('q-desc').value = r.description;
  $('q-cat').value = lookups.cats.get(r.category_id)?.name ?? '';
  $('q-card').value = lookups.cards.get(r.card_id) ?? '';
  $('q-amount').value = (r.amount_cents / 100).toFixed(2).replace('.', ',');
  $('q-submit').textContent = 'Salvar';
  $('cancelEdit').style.display = 'inline';
  refreshHints();
  $('q-desc').focus();
}

function resetForm() {
  editingId = null;
  setAdvanced(null);
  $('q-desc').value = '';
  $('q-cat').value = '';
  $('q-amount').value = '';
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  $('q-person').value = '';
  $('splitPercent').value = '';
  $('q-person-hint').textContent = '';
  $('q-submit').textContent = 'Adicionar';
  $('cancelEdit').style.display = 'none';
}
```

- [ ] **Step 13: Update `onSubmit`**

In `public/js/registrar.js`, replace the entire `onSubmit` function:

```js
async function onSubmit(e) {
  e.preventDefault();
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  $('q-person-hint').textContent = '';
  try {
    const catRef = resolveRef($('q-cat').value, state.cats);
    if (!catRef) return fieldError('q-cat-hint', 'q-cat', 'Informe uma categoria');
    const cardRef = resolveRef($('q-card').value, state.cards);
    if (!cardRef) return fieldError('q-card-hint', 'q-card', 'Informe um cartão');
    const amount = parseReais($('q-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fieldError('q-cat-hint', 'q-amount', 'Valor inválido');
    }

    const mode = advancedMode();
    let personRef = null;
    let splitPercent = null;
    if (mode === 'split') {
      personRef = resolveRef($('q-person').value, state.people);
      if (!personRef) return fieldError('q-person-hint', 'q-person', 'Informe uma pessoa');
      splitPercent = Number($('splitPercent').value);
      if (!Number.isInteger(splitPercent) || splitPercent < 1 || splitPercent > 99) {
        return fieldError('q-person-hint', 'splitPercent', 'Porcentagem inválida (1 a 99)');
      }
    }

    const category_id = await ensureId(catRef, '/api/categories');
    const card_id = await ensureId(cardRef, '/api/cards');
    const split_person_id = personRef ? await ensureId(personRef, '/api/people') : null;
    const split_percent = mode === 'split' ? splitPercent : null;
    const base = { category_id, card_id, description: $('q-desc').value };

    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
        split_person_id,
        split_percent,
      });
    } else if (mode === 'installment') {
      await api.post('/api/transactions', {
        ...base,
        installment_total_cents: amount,
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value || $('q-date').value.slice(0, 7),
      });
    } else if (mode === 'recurring') {
      await api.post('/api/recurring', {
        ...base,
        amount_cents: amount,
        day_of_month: Number($('dayOfMonth').value) || Number($('q-date').value.slice(8, 10)),
      });
    } else {
      await api.post('/api/transactions', {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
        split_person_id,
        split_percent,
      });
    }

    // Data e cartão ficam; o resto limpa. O formulário não fecha e o foco volta
    // para a descrição — o primeiro campo que de fato se digita de novo (§B.3).
    sticky.date = $('q-date').value;
    sticky.card = $('q-card').value;
    const catCreated = catRef.create !== undefined;
    const cardCreated = cardRef.create !== undefined;
    const personCreated = personRef ? personRef.create !== undefined : false;
    resetForm();
    if (catCreated || cardCreated || personCreated) await loadSelectors();
    $('q-desc').focus();
    await loadList();
  } catch (err) {
    showError(err.message);
  }
}
```

- [ ] **Step 14: Wire the new toggle and person-hint listener**

In `public/js/registrar.js`, change the bootstrap block:

```js
if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/registrar.html');
  $('month').value = currentMonth();
  $('toggleInstallment').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'installment' ? null : 'installment'),
  );
  $('toggleRecurring').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'recurring' ? null : 'recurring'),
  );
```

to:

```js
if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/registrar.html');
  $('month').value = currentMonth();
  $('toggleInstallment').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'installment' ? null : 'installment'),
  );
  $('toggleRecurring').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'recurring' ? null : 'recurring'),
  );
  $('toggleSplit').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'split' ? null : 'split'),
  );
  $('q-person').addEventListener('input', () => {
    $('q-person-hint').textContent = entryHint($('q-person').value, state.people, 'person');
  });
```

(the rest of the bootstrap block — month/perPage/filters/pager/form listeners and the trailing `loadSelectors().then(loadList);` — stays exactly as it is today.)

- [ ] **Step 15: Run the full test suite**

Run: `npm test`
Expected: all passing.

- [ ] **Step 16: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 17: Manual smoke check in the browser**

Run: `npm start`, open `/registrar.html`, and verify:
- "+ dividir com alguém" shows the person + percent fields, and clicking a different toggle (installment/recurring) hides them (mutually exclusive, same as today's installment/recurring pair).
- Typing a new person's name and submitting creates the person (check `GET /api/people`) and stores the split on the transaction.
- The list shows a `NN% Nome` sage-colored tag next to the description.
- Editing a split transaction pre-fills the person/percent fields and re-opens the split panel; editing a plain transaction does not.
- Clicking "Cancelar edição" or submitting clears the split fields (`resetForm`).

- [ ] **Step 18: Commit**

```bash
git add public/js/quickentry.js public/js/registrar.js public/registrar.html test/quickentry.test.ts test/registrarRender.test.ts
git commit -m "feat: registrar lets a transaction be split with another person"
```

---

## Task 9: Frontend — dashboard "A receber" panel

**Files:**
- Create: `public/js/receivables.js`
- Modify: `public/js/dashboard.js`
- Modify: `public/index.html` (new `#receivables` div)
- Test: `test/receivables.test.ts`

**Interfaces:**
- Consumes: `GET /api/transactions/receivables`, `POST /api/transactions/:id/split-received` (Task 7); `esc`, `formatBRL`, `monthShort` from `public/js/format.js`.
- Produces: `pendingReceivables(rows)`, `totalPendingCents(rows)`, `renderReceivables(rows)` — consumed only by `dashboard.js` in this same task.

**Scope note:** the spec's API section also exposes `DELETE /api/transactions/:id/split-received` (built in Task 7) "para o caso de marcar errado" — but the spec's own "UI — Acompanhar" section describes only a "marcar recebido" button and explicitly says received splits don't appear in the list at all. There is nothing in this slice's UI to attach an "unmark" control to (the row that would need it is gone). This task wires only the mark-as-received button, matching what the spec's UI section actually asks for; the DELETE route exists and is directly reachable via the API for whoever needs it later.

- [ ] **Step 1: Write the failing tests**

Create `test/receivables.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  {
    transaction_id: 1,
    person_id: 3,
    person_name: 'Fulano',
    description: 'Jantar',
    month: '2026-02',
    amount_cents: 5000,
    received: 0,
  },
  {
    transaction_id: 2,
    person_id: 4,
    person_name: 'Ciclano',
    description: 'Uber',
    month: '2026-03',
    amount_cents: 3000,
    received: 1,
  },
];

test('pendingReceivables keeps only what has not been received', async () => {
  const { pendingReceivables } = await import('../public/js/receivables.js');
  assert.deepEqual(
    pendingReceivables(rows).map((r) => r.transaction_id),
    [1],
  );
});

test('totalPendingCents sums only pending amounts', async () => {
  const { totalPendingCents } = await import('../public/js/receivables.js');
  assert.equal(totalPendingCents(rows), 5000);
});

test('renderReceivables shows an empty string when nothing is pending', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  assert.equal(renderReceivables([rows[1]]), '');
});

test('renderReceivables shows the person, description, month, amount and a receive button', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables(rows);
  assert.match(html, /Fulano/);
  assert.match(html, /Jantar/);
  assert.match(html, /fev\/2026/);
  assert.match(html, /R\$ 50,00/);
  assert.match(html, /data-receive="1"/);
  assert.doesNotMatch(html, /Ciclano/); // já recebido, não aparece
});

test('renderReceivables shows the total pending, not the total of everything', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables(rows);
  assert.match(html, /R\$ 50,00/);
  assert.doesNotMatch(html, /R\$ 80,00/); // não soma o já recebido
});

test('renderReceivables escapes the person name and description', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables([
    {
      transaction_id: 5,
      person_id: 9,
      person_name: '<b>Fulano</b>',
      description: '<i>x</i>',
      month: '2026-02',
      amount_cents: 1000,
      received: 0,
    },
  ]);
  assert.match(html, /&lt;b&gt;Fulano&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Fulano/);
  assert.match(html, /&lt;i&gt;x&lt;\/i&gt;/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test test/receivables.test.ts`
Expected: FAIL — `Cannot find module '../public/js/receivables.js'`

- [ ] **Step 3: Implement the pure render module**

Create `public/js/receivables.js`:

```js
import { esc, formatBRL, monthShort } from './format.js';

// "A tela é sobre o que falta receber, não um histórico" (design "UI —
// Acompanhar") — splits já recebidos somem da lista e do total.
export function pendingReceivables(rows) {
  return rows.filter((r) => !r.received);
}

export function totalPendingCents(rows) {
  return pendingReceivables(rows).reduce((sum, r) => sum + r.amount_cents, 0);
}

export function renderReceivables(rows) {
  const pending = pendingReceivables(rows);
  if (!pending.length) return '';
  const lines = pending
    .map(
      (r) => `
      <div class="flex items-baseline justify-between gap-4 py-3 border-b border-line last:border-0">
        <span>
          <span class="block">${esc(r.person_name)} · ${esc(r.description)}</span>
          <span class="block text-sm text-ink-mut">${monthShort(r.month)}</span>
        </span>
        <span class="flex items-center gap-3">
          <span class="font-mono whitespace-nowrap">${formatBRL(r.amount_cents)}</span>
          <button type="button" data-receive="${r.transaction_id}" class="text-sage text-sm">Marcar recebido</button>
        </span>
      </div>`,
    )
    .join('');
  return `
    <section class="paper-card mt-8">
      <h2 class="font-display text-2xl text-ink">A receber</h2>
      <div class="flex items-baseline justify-between gap-4 pb-3 border-b border-line">
        <span class="font-semibold">Total pendente</span>
        <span class="font-mono text-sage">${formatBRL(totalPendingCents(rows))}</span>
      </div>
      ${lines}
    </section>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test test/receivables.test.ts`
Expected: 6 passing tests.

- [ ] **Step 5: Add the panel container to `index.html`**

In `public/index.html`, change:

```html
    <div id="hero"></div>
    <div id="body"></div>
    <div id="commitments"></div>
```

to:

```html
    <div id="hero"></div>
    <div id="body"></div>
    <div id="commitments"></div>
    <div id="receivables"></div>
```

- [ ] **Step 6: Wire the panel into `dashboard.js`**

In `public/js/dashboard.js`, change the import block:

```js
import { renderAdvisor } from './advisor.js';
import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { currentMonth, esc, formatBRL, monthName } from './format.js';
import { meterBar, statusPill } from './ui.js';
```

to:

```js
import { renderAdvisor } from './advisor.js';
import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { currentMonth, esc, formatBRL, monthName } from './format.js';
import { renderReceivables } from './receivables.js';
import { meterBar, statusPill } from './ui.js';
```

Then add a new loader function right after `loadCommitments`:

```js
// Painel novo, carregado à parte do resto (mesmo padrão de `loadCommitments`):
// chamada assíncrona própria, erro não derruba o resto da tela. Sem filtro de
// mês — uma dívida de fevereiro continua valendo em abril (design "API"), então
// ao contrário de `load`/`loadCommitments` este painel não reage à troca de mês.
async function loadReceivables() {
  const el = document.getElementById('receivables');
  if (!el) return;
  try {
    const rows = await api.get('/api/transactions/receivables');
    el.innerHTML = renderReceivables(rows);
    el.querySelectorAll('button[data-receive]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api.post(`/api/transactions/${b.dataset.receive}/split-received`);
          loadReceivables();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  } catch {
    el.innerHTML = '';
  }
}
```

Then change the bootstrap block:

```js
if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => {
    load(monthEl.value);
    loadCommitments(monthEl.value);
  });
  load(monthEl.value);
  loadCommitments(monthEl.value);
}
```

to:

```js
if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => {
    load(monthEl.value);
    loadCommitments(monthEl.value);
  });
  load(monthEl.value);
  loadCommitments(monthEl.value);
  loadReceivables();
}
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all passing.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 9: Manual smoke check in the browser**

Run: `npm start`, open `/` (Acompanhar), and verify:
- With no splits recorded, no "A receber" panel appears (the section returns `''`).
- After creating a split transaction in `/registrar.html`, the panel shows it with the correct computed amount, person, description, and month.
- Clicking "Marcar recebido" removes the row and updates (or removes, if it was the only one) the total — reload the page to confirm it stays gone (persisted server-side, not just a client-side hide).
- Switching the dashboard's month selector does not affect the panel (no month filter, per design).

- [ ] **Step 10: Commit**

```bash
git add public/js/receivables.js public/js/dashboard.js public/index.html test/receivables.test.ts
git commit -m "feat: dashboard shows what is still owed back from a split"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), domain layer (Task 2/Task 5), API — people (Task 4), API — transactions split fields (Task 6), API — split-received/receivables (Task 7), UI — Registrar (Task 8), UI — Acompanhar (Task 9), migration (Task 1). Testing section's five bullets are each covered: `test/people.test.ts` (repo + use case, active filtering behavior — deliberately corrected per Deviation 4), `test/transactions.test.ts` (create/edit with split, schema pairing/range errors, null-clears-split, `listReceivables` computed amount, `split-received` toggling, no-split rows excluded), regression (`dashboard.test.ts`/`bi.test.ts` verified untouched — Deviation 6), `test/registrarRender.test.ts` (split tag + escaping; `resetForm`'s field-clearing is exercised indirectly through the manual smoke check in Task 8 Step 17, since it's DOM-wiring code with no automated test layer in this codebase — same reasoning `wireStep4`/`saveLimit` in the sibling `decidir.js` plan used).
- **Six documented deviations from the spec's literal snippets**, each justified at its point of use and again in the "Deviations" section up top: (1) `Person.active`/`Transaction.split_received` as `number` not `boolean`; (2) `Transaction.split_person_id`/`split_percent` as `number | null` not `?: number`; (3) `PersonRepository` mirrors `CardRepository`'s full-replace/changes-count shape instead of the spec's partial-patch/void shape; (4) `GET /api/people` returns everyone, not "active only," matching `categories`/`cards`' real behavior; (5) `listReceivables()`'s `received` field as `number`; (6) the regression claim about `bi.test.ts`/`dashboard.test.ts` was independently verified true this time (unlike the sibling `model_items` plan), so no fix task was added for them.
- **Placeholder scan:** none found — every step has literal code, no "TBD"/"similar to Task N".
- **Type consistency:** `Person`, `PersonRepository`, `CreatePersonInput`, `UpdatePersonInput`, `Transaction.split_person_id`/`split_percent`/`split_received`, `TransactionUseCaseDeps.people`, `CreateTransactionInput`/`UpdateTransactionInput`'s split fields, and the `split_person_id`/`split_percent`/`split_received`/`data-receive` names are identical everywhere they're used across Tasks 2-9.
- **Sequencing check:** Task 5 deliberately makes the new `insert`/`update` split parameters *optional* (not the spec's implied required shape) specifically so the codebase stays green between Task 5 (repository ready) and Task 6 (use case starts passing them) — the still-unmodified use case in that window keeps compiling and behaving identically, since the repository defaults missing split fields to `null`.
