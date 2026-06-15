# Gastando Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, Dockerized web app that records credit-card transactions by category/month, compares them to editable per-month limits, models installments and a savings target, and shows BI trends over time.

**Architecture:** Single Node + Express process serves a vanilla HTML/CSS/JS frontend and a JSON REST API, persisting to a SQLite file (via `better-sqlite3`). Routes are thin factories `(db) => router`; all logic lives in `src/services/*` so it can be unit-tested directly, and the API is integration-tested with `supertest` against an in-memory database. The data model and seed come from [`docs/spec.md`](./spec.md) and [`card.md`](../card.md).

**Tech Stack:** Node 20, Express 4, better-sqlite3, supertest, Node's built-in test runner (`node:test`), c8 (coverage), Chart.js (CDN), Docker + docker-compose.

---

## Guardrails (apply to EVERY task)

These are hard rules. A task is not "done" until all of them hold.

1. **Test-first (TDD), always.** Write the failing test before the implementation. Run it, watch it fail for the right reason, then write the minimal code to pass. No production code is written ahead of a test that needs it.

2. **≥80% coverage, enforced by tooling, from task 1 onward.** Coverage is measured by `c8` over `src/**` and gated at **80% for lines, statements, functions, and branches**. The gate is configured in `.c8rc.json` (set up in Task 0) so it cannot be silently skipped. The frontend (`public/**`) is verified manually and is excluded from the coverage metric; `src/server.js` (process bootstrap/`listen`) is also excluded.
   - Before the commit step of **every** task, run `npm run coverage` and confirm it reports **PASS** with all four metrics ≥80%. If coverage dropped below 80%, add tests until it passes — do not commit under the threshold.
   - "Start with that" means the gate exists from Task 0: the very first feature task already runs against the coverage check, so coverage never has a chance to regress.

3. **One comprehensive commit per task.** Each task ends in exactly one commit that bundles the full, working slice: tests + implementation + any wiring/docs for that task. The commit must be self-contained — the suite passes and the coverage gate is green **at that commit**. Do not split a task across commits and do not batch multiple tasks into one commit. Use the commit message given in each task's final step.

4. **Green before commit.** `npm test` (functional) and `npm run coverage` (coverage gate) must both pass immediately before committing. Never commit red or with skipped/`.only` tests.

---

## File Structure

```
gastando/
  package.json
  .gitignore
  Dockerfile
  docker-compose.yml
  migrations/
    001_schema.sql        # tables
    002_seed.sql          # groups, categories, June limits, cards, settings
  src/
    db.js                 # openDatabase(), runMigrations()
    app.js                # createApp(db) -> express app (mounts routes, error handler)
    server.js             # opens real db, migrates, listens
    validate.js           # isMonth/isDate/isPositiveInt/required helpers
    services/
      money.js            # formatBRL(cents)
      dates.js            # monthOf(date), addMonths(ym, n)
      installments.js     # createInstallmentPurchase(), deleteInstallmentGroup()
      dashboard.js        # buildDashboard(db, month)
      bi.js               # trends(db, from, to)
    routes/
      groups.js
      categories.js
      cards.js
      limits.js
      transactions.js
      settings.js
      dashboard.js
      bi.js
  public/
    index.html            # dashboard
    transactions.html
    settings.html
    bi.html
    css/app.css           # design tokens lifted from card.html
    js/format.js          # client-side BRL formatting
    js/api.js             # fetch wrapper
    js/dashboard.js
    js/transactions.js
    js/settings.js
    js/bi.js
  test/
    helpers.js            # makeTestDb() -> in-memory db with schema + fixtures
    money.test.js
    dates.test.js
    crud.test.js
    transactions.test.js
    installments.test.js
    dashboard.test.js
    bi.test.js
  data/                   # gastando.db (gitignored, volume-mounted)
```

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `.c8rc.json`, `src/server.js`, `src/app.js`

- [ ] **Step 1: Initialize git and npm**

```bash
cd /mnt/c/Users/Thiago/code/gastando
git init
npm init -y
npm install express better-sqlite3
npm install --save-dev supertest c8
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
data/
*.log
```

- [ ] **Step 3: Set npm scripts in `package.json`**

Edit the `"scripts"` block to:

```json
"scripts": {
  "start": "node src/server.js",
  "test": "node --test",
  "coverage": "c8 node --test"
}
```

- [ ] **Step 3b: Create `.c8rc.json` (the 80% coverage gate)**

```json
{
  "all": true,
  "include": ["src/**/*.js"],
  "exclude": ["src/server.js"],
  "reporter": ["text", "text-summary"],
  "check-coverage": true,
  "lines": 80,
  "statements": 80,
  "functions": 80,
  "branches": 80
}
```

`"all": true` instruments every file under `src/**` (even ones with no tests yet) so the
gate reflects true coverage. `npm run coverage` exits non-zero if any metric is below 80%.

- [ ] **Step 4: Write `test/errorHandler.test.js` (test-first)**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { errorHandler } = require('../src/errorHandler');

function fakeRes() {
  return { code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; } };
}

test('uses err.status and err.message when present', () => {
  const res = fakeRes();
  errorHandler({ status: 400, message: 'bad input' }, {}, res, () => {});
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, { error: 'bad input' });
});

test('defaults to 500 and a generic message', () => {
  const res = fakeRes();
  const orig = console.error; console.error = () => {}; // silence expected log
  errorHandler({}, {}, res, () => {});
  console.error = orig;
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { error: 'Internal error' });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `node --test test/errorHandler.test.js`
Expected: FAIL — cannot find module `../src/errorHandler`.

- [ ] **Step 6: Create `src/errorHandler.js`**

```js
// Central Express error handler: services throw errors tagged with `.status`.
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal error' });
}

module.exports = { errorHandler };
```

- [ ] **Step 7: Create `src/app.js` (app factory, health route, wiring)**

```js
const express = require('express');
const path = require('path');
const { errorHandler } = require('./errorHandler');

function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Routes mounted in later tasks:
  // app.use('/api/groups', require('./routes/groups')(db));
  // ...

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 8: Write `test/app.test.js` (covers the app factory)**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');

test('health endpoint responds', async () => {
  const res = await request(createApp({})).get('/api/health').expect(200);
  assert.deepEqual(res.body, { ok: true });
});
```

- [ ] **Step 9: Create `src/server.js`**

```js
const path = require('path');
const { openDatabase, runMigrations } = require('./db');
const { createApp } = require('./app');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'gastando.db');
const db = openDatabase(dbPath);
runMigrations(db);

const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`Gastando listening on :${port}`));
```

- [ ] **Step 10: Run tests and verify they pass**

Run: `npm test`
Expected: PASS (errorHandler + app health tests).

- [ ] **Step 11: Verify the coverage gate is green (≥80%)**

Run: `npm run coverage`
Expected: the c8 summary prints and the command exits 0, with lines / statements /
functions / branches all ≥80% for `src/errorHandler.js` and `src/app.js`. (`src/server.js`
is excluded.) If any metric is below 80%, add tests until green before committing.

- [ ] **Step 12: Commit (one comprehensive commit for the task)**

```bash
git add -A
git commit -m "chore: scaffold express app, health route, tested error handler, coverage gate"
```

---

## Task 1: Database layer + schema

**Files:**
- Create: `src/db.js`, `migrations/001_schema.sql`, `test/helpers.js`

- [ ] **Step 1: Write `migrations/001_schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'neutral',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  name TEXT NOT NULL,
  examples TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE category_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  limit_cents INTEGER NOT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE installment_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  first_month TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  installment_group_id INTEGER REFERENCES installment_groups(id),
  installment_no INTEGER,
  installment_total INTEGER
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_tx_category ON transactions(category_id);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_group ON transactions(installment_group_id);
```

- [ ] **Step 2: Write `src/db.js`**

```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDatabase(filename) {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// Applies any migration .sql file in migrations/ not yet recorded.
function runMigrations(db, dir = path.join(__dirname, '..', 'migrations')) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
  }
}

module.exports = { openDatabase, runMigrations };
```

- [ ] **Step 3: Write `test/helpers.js` (schema-only in-memory db + fixtures)**

```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// In-memory db with schema applied (migration 001 only, no seed) plus
// a baseline group/category/card so tests can insert transactions.
function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '001_schema.sql'), 'utf8');
  db.exec(schema);
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db.prepare(
    "INSERT INTO categories (group_id, name, sort_order) VALUES (?, 'Supermercado', 0)"
  ).run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  return { db, groupId: g.lastInsertRowid, categoryId: c.lastInsertRowid, cardId: card.lastInsertRowid };
}

module.exports = { makeTestDb };
```

- [ ] **Step 4: Write a smoke test `test/crud.test.js` (schema loads)**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');

test('schema applies and base fixtures exist', () => {
  const { db, categoryId, cardId } = makeTestDb();
  assert.ok(categoryId > 0);
  assert.ok(cardId > 0);
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['groups','categories','category_limits','cards','transactions','installment_groups','settings']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});
```

- [ ] **Step 5: Run and verify pass**

Run: `npm test`
Expected: PASS (1+ tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: sqlite schema, migration runner, test db helper"
```

---

## Task 2: Money + date helpers

**Files:**
- Create: `src/services/money.js`, `src/services/dates.js`
- Test: `test/money.test.js`, `test/dates.test.js`

- [ ] **Step 1: Write `test/money.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { formatBRL } = require('../src/services/money');

test('formats cents as pt-BR currency', () => {
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(814000), 'R$ 8.140,00');
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(-5000), '-R$ 50,00');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/money.test.js`
Expected: FAIL — cannot find module `../src/services/money`.

- [ ] **Step 3: Write `src/services/money.js`**

```js
function formatBRL(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  const reais = Math.floor(v / 100).toLocaleString('pt-BR');
  const c = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${c}`;
}

module.exports = { formatBRL };
```

- [ ] **Step 4: Write `test/dates.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { monthOf, addMonths } = require('../src/services/dates');

test('monthOf extracts YYYY-MM from a date', () => {
  assert.equal(monthOf('2026-06-15'), '2026-06');
});

test('addMonths rolls over years', () => {
  assert.equal(addMonths('2026-06', 0), '2026-06');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', 12), '2027-01');
});
```

- [ ] **Step 5: Write `src/services/dates.js`**

```js
function monthOf(date) {
  return String(date).slice(0, 7);
}

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

module.exports = { monthOf, addMonths };
```

- [ ] **Step 6: Run and verify pass**

Run: `node --test test/money.test.js test/dates.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: money + date helpers"
```

---

## Task 3: Validation helper

**Files:**
- Create: `src/validate.js`
- Test: covered indirectly by route tests; add a quick unit test `test/validate.test.js`

- [ ] **Step 1: Write `test/validate.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { isMonth, isDate, isPositiveInt, fail } = require('../src/validate');

test('validators', () => {
  assert.equal(isMonth('2026-06'), true);
  assert.equal(isMonth('2026-6'), false);
  assert.equal(isDate('2026-06-15'), true);
  assert.equal(isDate('2026-06'), false);
  assert.equal(isPositiveInt(5), true);
  assert.equal(isPositiveInt(0), false);
  assert.equal(isPositiveInt(2.5), false);
});

test('fail throws a status-tagged error', () => {
  assert.throws(() => fail(400, 'bad'), e => e.status === 400 && e.message === 'bad');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/validate.test.js`
Expected: FAIL — cannot find module `../src/validate`.

- [ ] **Step 3: Write `src/validate.js`**

```js
const isMonth = v => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isPositiveInt = v => Number.isInteger(v) && v > 0;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

module.exports = { isMonth, isDate, isPositiveInt, fail };
```

- [ ] **Step 4: Run and verify pass**

Run: `node --test test/validate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: request validation helpers"
```

---

## Task 4: Groups + Categories CRUD

**Files:**
- Create: `src/routes/groups.js`, `src/routes/categories.js`
- Modify: `src/app.js` (mount routes)
- Test: `test/crud.test.js` (extend)

- [ ] **Step 1: Add failing API tests to `test/crud.test.js`**

Append:

```js
const request = require('supertest');
const { createApp } = require('../src/app');

function appWith() {
  const ctx = makeTestDb();
  return { app: createApp(ctx.db), ctx };
}

test('groups: create, list, update, delete', async () => {
  const { app } = appWith();
  const created = await request(app).post('/api/groups')
    .send({ name: 'Essenciais', color: 'sage', sort_order: 1 }).expect(201);
  assert.equal(created.body.name, 'Essenciais');

  const list = await request(app).get('/api/groups').expect(200);
  assert.ok(list.body.some(g => g.name === 'Essenciais'));

  await request(app).put(`/api/groups/${created.body.id}`)
    .send({ name: 'Essenciais / semi-fixos', color: 'sage', sort_order: 1 }).expect(200);
  await request(app).delete(`/api/groups/${created.body.id}`).expect(204);
});

test('categories: create requires a real group and supports soft-delete', async () => {
  const { app, ctx } = appWith();
  await request(app).post('/api/categories')
    .send({ group_id: 99999, name: 'X' }).expect(400);

  const c = await request(app).post('/api/categories')
    .send({ group_id: ctx.groupId, name: 'Transporte', examples: 'Uber' }).expect(201);
  assert.equal(c.body.active, 1);

  await request(app).delete(`/api/categories/${c.body.id}`).expect(204);
  const after = await request(app).get('/api/categories').expect(200);
  const found = after.body.find(x => x.id === c.body.id);
  assert.equal(found.active, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/crud.test.js`
Expected: FAIL — 404s (routes not mounted).

- [ ] **Step 3: Write `src/routes/groups.js`**

```js
const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM groups ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)'
    ).run(name, color, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM groups WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'UPDATE groups SET name=?, color=?, sort_order=? WHERE id=?'
    ).run(name, color, sort_order, req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 4: Write `src/routes/categories.js`**

```js
const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const group = db.prepare('SELECT id FROM groups WHERE id=?').get(group_id);
    if (!group) fail(400, 'group_id does not exist');
    const r = db.prepare(
      'INSERT INTO categories (group_id, name, examples, sort_order) VALUES (?, ?, ?, ?)'
    ).run(group_id, name, examples, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0, active = 1 } = req.body;
    if (!name) fail(400, 'name is required');
    if (!db.prepare('SELECT id FROM groups WHERE id=?').get(group_id)) fail(400, 'group_id does not exist');
    const r = db.prepare(
      'UPDATE categories SET group_id=?, name=?, examples=?, sort_order=?, active=? WHERE id=?'
    ).run(group_id, name, examples, sort_order, active ? 1 : 0, req.params.id);
    if (r.changes === 0) fail(404, 'category not found');
    res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id));
  });

  // Soft-delete: keep historical transactions intact.
  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE categories SET active=0 WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'category not found');
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 5: Mount both routes in `src/app.js`**

Replace the `// Routes mounted in later tasks:` comment block with:

```js
  app.use('/api/groups', require('./routes/groups')(db));
  app.use('/api/categories', require('./routes/categories')(db));
```

- [ ] **Step 6: Run and verify pass**

Run: `node --test test/crud.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: groups and categories CRUD"
```

---

## Task 5: Cards CRUD

**Files:**
- Create: `src/routes/cards.js`
- Modify: `src/app.js`
- Test: `test/crud.test.js` (extend)

- [ ] **Step 1: Add failing test to `test/crud.test.js`**

```js
test('cards: create, list, soft-delete', async () => {
  const { app } = appWith();
  const c = await request(app).post('/api/cards').send({ name: 'Itaú' }).expect(201);
  assert.equal(c.body.active, 1);
  await request(app).delete(`/api/cards/${c.body.id}`).expect(204);
  const list = await request(app).get('/api/cards').expect(200);
  assert.equal(list.body.find(x => x.id === c.body.id).active, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/crud.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write `src/routes/cards.js`**

```js
const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM cards ORDER BY id').all());
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare('INSERT INTO cards (name) VALUES (?)').run(name);
    res.status(201).json(db.prepare('SELECT * FROM cards WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, active = 1 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare('UPDATE cards SET name=?, active=? WHERE id=?')
      .run(name, active ? 1 : 0, req.params.id);
    if (r.changes === 0) fail(404, 'card not found');
    res.json(db.prepare('SELECT * FROM cards WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE cards SET active=0 WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'card not found');
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 4: Mount in `src/app.js`**

```js
  app.use('/api/cards', require('./routes/cards')(db));
```

- [ ] **Step 5: Run and verify pass**

Run: `node --test test/crud.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: cards CRUD"
```

---

## Task 6: Limits (per-month, with carry-forward read)

**Files:**
- Create: `src/routes/limits.js`
- Modify: `src/app.js`
- Test: `test/crud.test.js` (extend)

- [ ] **Step 1: Add failing test**

```js
test('limits: set per month and read with carry-forward', async () => {
  const { app, ctx } = appWith();
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 85000 }).expect(200);

  // Same month returns explicit value.
  const june = await request(app).get('/api/limits?month=2026-06').expect(200);
  assert.equal(june.body.find(l => l.category_id === ctx.categoryId).limit_cents, 85000);

  // Later month with no explicit row carries forward June's limit.
  const aug = await request(app).get('/api/limits?month=2026-08').expect(200);
  assert.equal(aug.body.find(l => l.category_id === ctx.categoryId).limit_cents, 85000);

  // Upsert replaces the value for the same (category, month).
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 90000 }).expect(200);
  const june2 = await request(app).get('/api/limits?month=2026-06').expect(200);
  assert.equal(june2.body.find(l => l.category_id === ctx.categoryId).limit_cents, 90000);

  await request(app).get('/api/limits?month=bad').expect(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/crud.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write `src/routes/limits.js`**

```js
const express = require('express');
const { isMonth, isPositiveInt, fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  // Resolved limit per active category for a month (carry-forward from prior months).
  router.get('/', (req, res) => {
    const month = req.query.month;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    const cats = db.prepare('SELECT id FROM categories WHERE active=1').all();
    const pick = db.prepare(
      `SELECT limit_cents FROM category_limits
       WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
    res.json(cats.map(c => {
      const row = pick.get(c.id, month);
      return { category_id: c.id, month, limit_cents: row ? row.limit_cents : 0 };
    }));
  });

  // Upsert a category's limit for a specific month.
  router.put('/', (req, res) => {
    const { category_id, month, limit_cents } = req.body;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    if (!Number.isInteger(limit_cents) || limit_cents < 0) fail(400, 'limit_cents must be a non-negative integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    db.prepare(
      `INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, ?, ?)
       ON CONFLICT(category_id, month) DO UPDATE SET limit_cents=excluded.limit_cents`
    ).run(category_id, month, limit_cents);
    res.json({ category_id, month, limit_cents });
  });

  return router;
};
```

- [ ] **Step 4: Mount in `src/app.js`**

```js
  app.use('/api/limits', require('./routes/limits')(db));
```

- [ ] **Step 5: Run and verify pass**

Run: `node --test test/crud.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: per-month limits with carry-forward read"
```

---

## Task 7: Transactions CRUD (single-shot)

**Files:**
- Create: `src/routes/transactions.js`
- Modify: `src/app.js`
- Test: `test/transactions.test.js`

- [ ] **Step 1: Write `test/transactions.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function appWith() {
  const ctx = makeTestDb();
  return { app: createApp(ctx.db), ctx };
}

test('transactions: create, filter by month, update, delete', async () => {
  const { app, ctx } = appWith();
  const body = { date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 5200, description: 'Pão de Açúcar' };
  const t = await request(app).post('/api/transactions').send(body).expect(201);
  assert.equal(t.body.amount_cents, 5200);
  assert.equal(t.body.installment_group_id, null);

  const june = await request(app).get('/api/transactions?month=2026-06').expect(200);
  assert.equal(june.body.length, 1);
  const july = await request(app).get('/api/transactions?month=2026-07').expect(200);
  assert.equal(july.body.length, 0);

  await request(app).put(`/api/transactions/${t.body.id}`)
    .send({ ...body, amount_cents: 6000 }).expect(200);
  await request(app).delete(`/api/transactions/${t.body.id}`).expect(204);
});

test('transactions: validation', async () => {
  const { app, ctx } = appWith();
  await request(app).post('/api/transactions')
    .send({ date: 'bad', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 100 }).expect(400);
  await request(app).post('/api/transactions')
    .send({ date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 0 }).expect(400);
  await request(app).post('/api/transactions')
    .send({ date: '2026-06-10', category_id: 99999, card_id: ctx.cardId, amount_cents: 100 }).expect(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/transactions.test.js`
Expected: FAIL — 404.

- [ ] **Step 3: Write `src/routes/transactions.js`**

```js
const express = require('express');
const { isDate, isMonth, isPositiveInt, fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month, category_id, card_id } = req.query;
    const where = [];
    const args = [];
    if (month !== undefined) {
      if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
      where.push("strftime('%Y-%m', date) = ?"); args.push(month);
    }
    if (category_id !== undefined) { where.push('category_id = ?'); args.push(Number(category_id)); }
    if (card_id !== undefined) { where.push('card_id = ?'); args.push(Number(card_id)); }
    const sql = `SELECT * FROM transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, id DESC`;
    res.json(db.prepare(sql).all(...args));
  });

  router.post('/', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    const r = db.prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description)
       VALUES (?, ?, ?, ?, ?)`
    ).run(date, category_id, card_id, amount_cents, description);
    res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    const r = db.prepare(
      `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=? WHERE id=?`
    ).run(date, category_id, card_id, amount_cents, description, req.params.id);
    if (r.changes === 0) fail(404, 'transaction not found');
    res.json(db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'transaction not found');
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 4: Mount in `src/app.js`**

```js
  app.use('/api/transactions', require('./routes/transactions')(db));
```

- [ ] **Step 5: Run and verify pass**

Run: `node --test test/transactions.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: single-shot transactions CRUD"
```

---

## Task 8: Installment expansion service + endpoints

**Files:**
- Create: `src/services/installments.js`
- Modify: `src/routes/transactions.js` (handle installment fields on POST), `src/app.js` (mount installment-groups delete)
- Create: `src/routes/installmentGroups.js`
- Test: `test/installments.test.js`

- [ ] **Step 1: Write `test/installments.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');
const { splitCents } = require('../src/services/installments');

test('splitCents distributes remainder to the first parcelas', () => {
  assert.deepEqual(splitCents(1000, 4), [250, 250, 250, 250]);
  assert.deepEqual(splitCents(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  assert.equal(splitCents(599 * 100 + 0, 6).reduce((a, b) => a + b, 0), 59900);
});

test('POST with installment fields expands across months and sums to total', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).post('/api/transactions').send({
    date: '2026-06-01', category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', installment_total_cents: 359400, installment_count: 6,
    first_month: '2026-06'
  }).expect(201);

  assert.equal(res.body.installment_group_id > 0, true);

  // 6 child transactions, one per month June..November.
  const all = ctx.db.prepare('SELECT * FROM transactions ORDER BY date').all();
  assert.equal(all.length, 6);
  assert.deepEqual(all.map(t => t.date.slice(0, 7)),
    ['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
  assert.equal(all.reduce((s, t) => s + t.amount_cents, 0), 359400);
  assert.equal(all[0].installment_no, 1);
  assert.equal(all[0].installment_total, 6);
});

test('DELETE installment group removes all child transactions', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).post('/api/transactions').send({
    date: '2026-06-01', category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', installment_total_cents: 359400, installment_count: 6,
    first_month: '2026-06'
  }).expect(201);
  await request(app).delete(`/api/installment-groups/${res.body.installment_group_id}`).expect(204);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/installments.test.js`
Expected: FAIL — cannot find module `../src/services/installments`.

- [ ] **Step 3: Write `src/services/installments.js`**

```js
const { addMonths } = require('./dates');
const { fail } = require('../validate');

// Split total into `count` parts; first (total % count) parts get +1 cent.
function splitCents(total, count) {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

// Creates the group + N month-spaced child transactions atomically. Returns group id.
function createInstallmentPurchase(db, p) {
  const { category_id, card_id, description = '', total_cents, count, first_month } = p;
  const tx = db.transaction(() => {
    const g = db.prepare(
      `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(description, total_cents, count, first_month, category_id, card_id);
    const groupId = g.lastInsertRowid;
    const amounts = splitCents(total_cents, count);
    const insert = db.prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
        installment_group_id, installment_no, installment_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    amounts.forEach((amt, i) => {
      const month = addMonths(first_month, i);
      insert.run(`${month}-01`, category_id, card_id, amt, description, groupId, i + 1, count);
    });
    return groupId;
  });
  return tx();
}

function deleteInstallmentGroup(db, id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
    const r = db.prepare('DELETE FROM installment_groups WHERE id=?').run(id);
    if (r.changes === 0) fail(404, 'installment group not found');
  });
  tx();
}

module.exports = { splitCents, createInstallmentPurchase, deleteInstallmentGroup };
```

- [ ] **Step 4: Extend POST in `src/routes/transactions.js` to handle installments**

Add this near the top of the `router.post('/')` handler, before the single-shot insert (after requiring the service at the top of the file: `const { createInstallmentPurchase } = require('../services/installments');` and `const { isMonth } = require('../validate');` if not already imported):

```js
    // Installment purchase path.
    if (req.body.installment_count !== undefined || req.body.installment_total_cents !== undefined) {
      const { installment_total_cents, installment_count, first_month } = req.body;
      if (!isPositiveInt(installment_total_cents)) fail(400, 'installment_total_cents must be a positive integer');
      if (!isPositiveInt(installment_count)) fail(400, 'installment_count must be a positive integer');
      if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
      if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
      if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
      const groupId = createInstallmentPurchase(db, {
        category_id, card_id, description,
        total_cents: installment_total_cents, count: installment_count, first_month,
      });
      const first = db.prepare(
        'SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1').get(groupId);
      return res.status(201).json({ ...first, installment_group_id: groupId });
    }
```

Make sure `category_id`, `card_id`, `description` are destructured before this block (move the existing `const { date, category_id, ... }` destructure above it; for installments `date` is not required).

- [ ] **Step 5: Write `src/routes/installmentGroups.js`**

```js
const express = require('express');
const { deleteInstallmentGroup } = require('../services/installments');

module.exports = (db) => {
  const router = express.Router();
  router.delete('/:id', (req, res) => {
    deleteInstallmentGroup(db, req.params.id);
    res.status(204).end();
  });
  return router;
};
```

- [ ] **Step 6: Mount in `src/app.js`**

```js
  app.use('/api/installment-groups', require('./routes/installmentGroups')(db));
```

- [ ] **Step 7: Run and verify pass**

Run: `node --test test/installments.test.js test/transactions.test.js`
Expected: PASS (both files).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: installment purchases expand across months"
```

---

## Task 9: Settings + Dashboard aggregation

**Files:**
- Create: `src/routes/settings.js`, `src/services/dashboard.js`, `src/routes/dashboard.js`
- Modify: `src/app.js`
- Test: `test/dashboard.test.js`

- [ ] **Step 1: Write `test/dashboard.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function seedSettings(db) {
  const set = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  set.run('monthly_income', '1435000');
  set.run('fixed_costs', '377000');
  set.run('savings_goal', '244000');
}

test('settings round-trip', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/settings')
    .send({ monthly_income: 1435000, fixed_costs: 377000, savings_goal: 244000 }).expect(200);
  const s = await request(app).get('/api/settings').expect(200);
  assert.equal(s.body.monthly_income, 1435000);
  assert.equal(s.body.savings_goal, 244000);
});

test('dashboard computes spend, status, teto and projected savings', async () => {
  const ctx = makeTestDb();
  seedSettings(ctx.db);
  const app = createApp(ctx.db);

  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 85000 }).expect(200);
  // Two transactions in June totalling 90000 (> 85000 -> over).
  for (const amt of [50000, 40000]) {
    await request(app).post('/api/transactions').send({
      date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: amt }).expect(201);
  }

  const d = await request(app).get('/api/dashboard?month=2026-06').expect(200);
  const cat = d.body.categories.find(c => c.category_id === ctx.categoryId);
  assert.equal(cat.spent_cents, 90000);
  assert.equal(cat.limit_cents, 85000);
  assert.equal(cat.remaining_cents, -5000);
  assert.equal(cat.status, 'over');

  assert.equal(d.body.totals.teto_cents, 1435000 - 377000 - 244000); // 814000
  assert.equal(d.body.totals.spent_cents, 90000);
  assert.equal(d.body.totals.projected_savings_cents, 1435000 - 377000 - 90000); // 968000
  assert.ok(Array.isArray(d.body.groups));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/dashboard.test.js`
Expected: FAIL — 404 / module missing.

- [ ] **Step 3: Write `src/routes/settings.js`**

```js
const express = require('express');

const KEYS = ['monthly_income', 'fixed_costs', 'savings_goal'];

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const out = {};
    for (const k of KEYS) {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
      out[k] = row ? Number(row.value) : 0;
    }
    res.json(out);
  });

  router.put('/', (req, res) => {
    const set = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    db.transaction(() => {
      for (const k of KEYS) {
        if (req.body[k] !== undefined) set.run(k, String(Math.trunc(req.body[k])));
      }
    })();
    const out = {};
    for (const k of KEYS) {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
      out[k] = row ? Number(row.value) : 0;
    }
    res.json(out);
  });

  return router;
};
```

- [ ] **Step 4: Write `src/services/dashboard.js`**

```js
function buildDashboard(db, month) {
  const cats = db.prepare(
    `SELECT c.id, c.name, c.group_id, c.examples, g.name AS group_name, g.color AS group_color, g.sort_order AS group_sort
     FROM categories c JOIN groups g ON g.id = c.group_id
     WHERE c.active = 1 ORDER BY g.sort_order, c.sort_order, c.id`).all();

  const pickLimit = db.prepare(
    `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
  const sumSpend = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?`);

  const categories = cats.map(c => {
    const limit = pickLimit.get(c.id, month);
    const limit_cents = limit ? limit.limit_cents : 0;
    const spent_cents = sumSpend.get(c.id, month).s;
    return {
      category_id: c.id, name: c.name, examples: c.examples,
      group_id: c.group_id, group_name: c.group_name, group_color: c.group_color,
      limit_cents, spent_cents,
      remaining_cents: limit_cents - spent_cents,
      status: spent_cents > limit_cents ? 'over' : 'ok',
    };
  });

  const groupsMap = new Map();
  for (const c of categories) {
    if (!groupsMap.has(c.group_id)) {
      groupsMap.set(c.group_id, {
        group_id: c.group_id, name: c.group_name, color: c.group_color,
        limit_cents: 0, spent_cents: 0,
      });
    }
    const g = groupsMap.get(c.group_id);
    g.limit_cents += c.limit_cents;
    g.spent_cents += c.spent_cents;
  }
  const groups = [...groupsMap.values()];

  const num = k => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
    return row ? Number(row.value) : 0;
  };
  const income = num('monthly_income');
  const fixed = num('fixed_costs');
  const goal = num('savings_goal');
  const spent_cents = categories.reduce((s, c) => s + c.spent_cents, 0);
  const limit_total = categories.reduce((s, c) => s + c.limit_cents, 0);
  const teto_cents = income - fixed - goal;
  const projected_savings_cents = income - fixed - spent_cents;

  return {
    month, categories, groups,
    totals: {
      limit_cents: limit_total, spent_cents,
      monthly_income_cents: income, fixed_costs_cents: fixed,
      savings_goal_cents: goal, teto_cents,
      projected_savings_cents,
      vs_goal_cents: projected_savings_cents - goal,
    },
  };
}

module.exports = { buildDashboard };
```

- [ ] **Step 5: Write `src/routes/dashboard.js`**

```js
const express = require('express');
const { isMonth, fail } = require('../validate');
const { buildDashboard } = require('../services/dashboard');

module.exports = (db) => {
  const router = express.Router();
  router.get('/', (req, res) => {
    if (!isMonth(req.query.month)) fail(400, 'month must be YYYY-MM');
    res.json(buildDashboard(db, req.query.month));
  });
  return router;
};
```

- [ ] **Step 6: Mount in `src/app.js`**

```js
  app.use('/api/settings', require('./routes/settings')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));
```

- [ ] **Step 7: Run and verify pass**

Run: `node --test test/dashboard.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: settings and dashboard aggregation"
```

---

## Task 10: BI trends aggregation

**Files:**
- Create: `src/services/bi.js`, `src/routes/bi.js`
- Modify: `src/app.js`
- Test: `test/bi.test.js`

- [ ] **Step 1: Write `test/bi.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('bi trends returns per-category spend across a month range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000 }).expect(201);
  await request(app).post('/api/transactions').send({
    date: '2026-07-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 30000 }).expect(201);

  const r = await request(app).get('/api/bi/trends?from=2026-06&to=2026-08').expect(200);
  assert.deepEqual(r.body.months, ['2026-06', '2026-07', '2026-08']);
  const series = r.body.series.find(s => s.category_id === ctx.categoryId);
  assert.deepEqual(series.spent_cents, [10000, 30000, 0]);

  await request(app).get('/api/bi/trends?from=bad&to=2026-08').expect(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/bi.test.js`
Expected: FAIL — 404 / module missing.

- [ ] **Step 3: Write `src/services/bi.js`**

```js
const { addMonths } = require('./dates');

function monthRange(from, to) {
  const months = [];
  let cur = from;
  for (let i = 0; i < 600 && cur <= to; i++) { months.push(cur); cur = addMonths(cur, 1); }
  return months;
}

function trends(db, from, to) {
  const months = monthRange(from, to);
  const cats = db.prepare('SELECT id, name FROM categories WHERE active=1 ORDER BY sort_order, id').all();
  const q = db.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
     WHERE category_id=? AND strftime('%Y-%m', date)=?`);
  const series = cats.map(c => ({
    category_id: c.id, name: c.name,
    spent_cents: months.map(m => q.get(c.id, m).s),
  }));
  return { months, series };
}

module.exports = { trends, monthRange };
```

- [ ] **Step 4: Write `src/routes/bi.js`**

```js
const express = require('express');
const { isMonth, fail } = require('../validate');
const { trends } = require('../services/bi');

module.exports = (db) => {
  const router = express.Router();
  router.get('/trends', (req, res) => {
    const { from, to } = req.query;
    if (!isMonth(from) || !isMonth(to)) fail(400, 'from/to must be YYYY-MM');
    if (from > to) fail(400, 'from must be <= to');
    res.json(trends(db, from, to));
  });
  return router;
};
```

- [ ] **Step 5: Mount in `src/app.js`**

```js
  app.use('/api/bi', require('./routes/bi')(db));
```

- [ ] **Step 6: Run and verify pass**

Run: `node --test test/bi.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: BI trends aggregation"
```

---

## Task 11: Seed migration from card.md

**Files:**
- Create: `migrations/002_seed.sql`

- [ ] **Step 1: Write `migrations/002_seed.sql`**

```sql
INSERT INTO groups (id, name, color, sort_order) VALUES
  (1, 'Essenciais / semi-fixos', 'sage', 1),
  (2, 'Estilo de vida', 'gold', 2),
  (3, 'Fundos', 'slate', 3),
  (4, 'Folga', 'neutral', 4);

INSERT INTO categories (id, group_id, name, examples, sort_order, active) VALUES
  (1, 1, 'Supermercado', 'Pão de Açúcar, Assaí', 1, 1),
  (2, 1, 'Transporte', 'Uber, Abastece Aí, NuTag, Metrô', 2, 1),
  (3, 1, 'Assinaturas & Serviços', 'Apple, Claude, Disney+, Seguro celular', 3, 1),
  (4, 1, 'Pet (Border Collie)', 'Lelupets, ração, veterinário', 4, 1),
  (5, 1, 'Saúde & Farmácia', 'Droga Raia, farmácia', 5, 1),
  (6, 2, 'Restaurantes & Delivery', 'iFood, Guacamole, hambúrgueres', 6, 1),
  (7, 2, 'Jogos', 'Steam, PlayStation, Oculus', 7, 1),
  (8, 2, 'Hobbies criativos', 'Show da Música, Caçula, materiais de arte', 8, 1),
  (9, 2, 'Esportes & Vestuário', 'Tennislab, Nike, Marc4', 9, 1),
  (10, 2, 'Lazer & Eventos', 'Ingressos, rolês, cinema', 10, 1),
  (11, 2, 'Compras gerais (Marketplace)', 'Mercado Livre, Amazon, Mercado Pago', 11, 1),
  (12, 3, 'Viagens', 'Avianca, Hotels.com', 12, 1),
  (13, 3, 'Casa & Manutenção', 'Ferragens, móveis, reforma', 13, 1),
  (14, 3, 'Educação & Cursos', 'PUC-Rio, cursos', 14, 1),
  (15, 4, 'Imprevistos / Folga', 'Margem de segurança', 15, 1);

INSERT INTO category_limits (category_id, month, limit_cents) VALUES
  (1, '2026-06', 85000),
  (2, '2026-06', 52000),
  (3, '2026-06', 45000),
  (4, '2026-06', 25000),
  (5, '2026-06', 18000),
  (6, '2026-06', 65000),
  (7, '2026-06', 35000),
  (8, '2026-06', 55000),
  (9, '2026-06', 35000),
  (10, '2026-06', 20000),
  (11, '2026-06', 100000),
  (12, '2026-06', 65000),
  (13, '2026-06', 30000),
  (14, '2026-06', 22000),
  (15, '2026-06', 45000);

INSERT INTO cards (name) VALUES ('Nubank'), ('Mercado Pago'), ('Itaú');

INSERT INTO settings (key, value) VALUES
  ('monthly_income', '1435000'),
  ('fixed_costs', '377000'),
  ('savings_goal', '244000');
```

- [ ] **Step 2: Verify seed applies cleanly to a fresh db**

Run:
```bash
node -e "const {openDatabase,runMigrations}=require('./src/db'); const fs=require('fs'); try{fs.unlinkSync('/tmp/seedcheck.db')}catch{}; const db=openDatabase('/tmp/seedcheck.db'); runMigrations(db); const cats=db.prepare('SELECT COUNT(*) n FROM categories').get().n; const teto=(()=>{const g=k=>Number(db.prepare('SELECT value FROM settings WHERE key=?').get(k).value); return g('monthly_income')-g('fixed_costs')-g('savings_goal')})(); console.log('categories',cats,'teto',teto); process.exit(cats===15 && teto===814000 ? 0 : 1)"
```
Expected: prints `categories 15 teto 814000`, exits 0.

- [ ] **Step 3: Confirm full test suite still green**

Run: `npm test`
Expected: PASS (all files; tests use schema-only `makeTestDb`, so seed IDs don't collide).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed groups, categories, June limits, cards, savings model from card.md"
```

---

## Task 12: Frontend — shared CSS/JS + Dashboard

**Files:**
- Create: `public/css/app.css`, `public/js/format.js`, `public/js/api.js`, `public/index.html`, `public/js/dashboard.js`

- [ ] **Step 1: Create `public/css/app.css`**

Lift the design tokens and core components from `card.html` (the `:root` palette,
fonts, `.wrap`, `.hero`, `.meter`, `.pill`, card styles). Copy the `<style>` block
from `card.html` into this file and add a simple top nav:

```css
/* Paste the :root{...} and component rules from card.html here. */
.nav{display:flex;gap:18px;align-items:center;margin-bottom:24px;font-weight:600}
.nav a{color:var(--ink-mut);text-decoration:none}
.nav a.active{color:var(--sage-deep)}
.toast{position:fixed;bottom:20px;right:20px;background:var(--clay-bg);color:var(--clay);
  padding:12px 16px;border-radius:10px;display:none}
.toast.show{display:block}
```

- [ ] **Step 2: Create `public/js/format.js`**

```js
export function formatBRL(cents) {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  const reais = Math.floor(v / 100).toLocaleString('pt-BR');
  const c = String(v % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${c}`;
}
export function reaisToCents(reais) { return Math.round(Number(reais) * 100); }
export function currentMonth() { return new Date().toISOString().slice(0, 7); }
```

- [ ] **Step 3: Create `public/js/api.js`**

```js
async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  del: (u) => req('DELETE', u),
};
export function showError(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}
```

- [ ] **Step 4: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/" class="active">Dashboard</a>
      <a href="/transactions.html">Transactions</a>
      <a href="/settings.html">Settings</a>
      <a href="/bi.html">BI</a>
      <input type="month" id="month" style="margin-left:auto" />
    </nav>
    <div id="hero"></div>
    <div id="groups"></div>
  </div>
  <script type="module" src="/js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `public/js/dashboard.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, currentMonth } from './format.js';

const monthEl = document.getElementById('month');
monthEl.value = currentMonth();
monthEl.addEventListener('change', load);

async function load() {
  try {
    const d = await api.get(`/api/dashboard?month=${monthEl.value}`);
    renderHero(d.totals);
    renderGroups(d);
  } catch (e) { showError(e.message); }
}

function renderHero(t) {
  const ok = t.projected_savings_cents >= t.savings_goal_cents;
  document.getElementById('hero').innerHTML = `
    <div class="hero">
      <div>
        <div class="big-label">Projected savings</div>
        <div class="savings ${ok ? 'ok' : 'under'}">${formatBRL(t.projected_savings_cents)}</div>
        <div class="vs-goal">Goal ${formatBRL(t.savings_goal_cents)} · Teto ${formatBRL(t.teto_cents)}</div>
      </div>
      <div class="hero-right">
        <div class="meter-row"><span>Spent</span><b>${formatBRL(t.spent_cents)}</b></div>
        <div class="meter ${t.spent_cents > t.teto_cents ? 'over' : ''}">
          <i style="width:${Math.min(100, t.teto_cents ? t.spent_cents / t.teto_cents * 100 : 0)}%"></i>
        </div>
        <div class="meter-foot">of teto ${formatBRL(t.teto_cents)}</div>
      </div>
    </div>`;
}

function renderGroups(d) {
  const byGroup = new Map(d.groups.map(g => [g.group_id, { ...g, cats: [] }]));
  for (const c of d.categories) byGroup.get(c.group_id).cats.push(c);
  document.getElementById('groups').innerHTML = [...byGroup.values()].map(g => `
    <section>
      <h2 class="serif">${g.name} — ${formatBRL(g.spent_cents)} / ${formatBRL(g.limit_cents)}</h2>
      ${g.cats.map(c => {
        const pct = c.limit_cents ? Math.min(100, c.spent_cents / c.limit_cents * 100) : 0;
        return `<div class="cat">
          <div class="meter-row"><span>${c.name}</span>
            <b>${formatBRL(c.spent_cents)} / ${formatBRL(c.limit_cents)}</b></div>
          <div class="meter ${c.status === 'over' ? 'over' : ''}"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('')}
    </section>`).join('');
}

load();
```

- [ ] **Step 6: Manual verification**

Run: `npm start` then open `http://localhost:3000`.
Expected: dashboard loads, hero shows teto R$ 8.140,00, all 15 categories render with empty (0) spend meters for the current month. (Set the month picker to `2026-06` to see seeded limits.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: dashboard frontend (hero + grouped category meters)"
```

---

## Task 13: Frontend — Transactions page

**Files:**
- Create: `public/transactions.html`, `public/js/transactions.js`

- [ ] **Step 1: Create `public/transactions.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Transactions</title>
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Dashboard</a>
      <a href="/transactions.html" class="active">Transactions</a>
      <a href="/settings.html">Settings</a>
      <a href="/bi.html">BI</a>
      <input type="month" id="month" style="margin-left:auto" />
    </nav>
    <form id="form" class="card">
      <input type="date" id="date" required />
      <select id="category"></select>
      <select id="card"></select>
      <input type="number" id="amount" step="0.01" min="0" placeholder="Amount (R$)" />
      <input type="text" id="description" placeholder="Description" />
      <label><input type="checkbox" id="isInstallment" /> Installment</label>
      <span id="installmentFields" style="display:none">
        <input type="number" id="count" min="1" placeholder="# parcelas" />
        <input type="month" id="firstMonth" />
      </span>
      <button type="submit">Add</button>
    </form>
    <table id="list"></table>
  </div>
  <script type="module" src="/js/transactions.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/js/transactions.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('month').value = currentMonth();
$('isInstallment').addEventListener('change', e => {
  $('installmentFields').style.display = e.target.checked ? 'inline' : 'none';
  $('amount').disabled = e.target.checked;
});
$('month').addEventListener('change', loadList);
$('form').addEventListener('submit', onSubmit);

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadList() {
  try {
    const rows = await api.get(`/api/transactions?month=${$('month').value}`);
    $('list').innerHTML = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.description}</td>
        <td class="mono">${formatBRL(r.amount_cents)}</td>
        <td>${r.installment_no ? r.installment_no + '/' + r.installment_total : ''}</td>
        <td><button data-del="${r.id}" ${r.installment_group_id ? 'disabled title="delete via group"' : ''}>×</button></td>
      </tr>`).join('');
    $('list').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/transactions/${b.dataset.del}`); loadList(); }
        catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

async function onSubmit(e) {
  e.preventDefault();
  try {
    const base = { category_id: Number($('category').value), card_id: Number($('card').value),
      description: $('description').value };
    if ($('isInstallment').checked) {
      await api.post('/api/transactions', { ...base,
        installment_total_cents: reaisToCents($('amount').value || prompt('Total amount (R$)')),
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value });
    } else {
      await api.post('/api/transactions', { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
    }
    $('form').reset(); $('installmentFields').style.display = 'none'; $('amount').disabled = false;
    loadList();
  } catch (err) { showError(err.message); }
}

loadSelectors().then(loadList);
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, open `/transactions.html`. Add a single transaction (it appears in the
list and is reflected on the dashboard). Add an installment of 6 parcelas with first month
`2026-06` and confirm 6 rows appear across June–November with `n/6` markers.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: transactions page (entry, list, installment toggle)"
```

---

## Task 14: Frontend — Settings page

**Files:**
- Create: `public/settings.html`, `public/js/settings.js`

- [ ] **Step 1: Create `public/settings.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Settings</title>
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Dashboard</a>
      <a href="/transactions.html">Transactions</a>
      <a href="/settings.html" class="active">Settings</a>
      <a href="/bi.html">BI</a>
      <input type="month" id="month" style="margin-left:auto" />
    </nav>
    <section class="card">
      <h2 class="serif">Savings model</h2>
      <label>Monthly income (R$) <input type="number" id="monthly_income" step="0.01" /></label>
      <label>Fixed costs (R$) <input type="number" id="fixed_costs" step="0.01" /></label>
      <label>Savings goal (R$) <input type="number" id="savings_goal" step="0.01" /></label>
      <button id="saveSettings">Save</button>
    </section>
    <section class="card">
      <h2 class="serif">Limits for <span id="monthLabel"></span></h2>
      <table id="limits"></table>
    </section>
    <section class="card">
      <h2 class="serif">Cards</h2>
      <div id="cards"></div>
      <input id="newCard" placeholder="New card name" /><button id="addCard">Add</button>
    </section>
  </div>
  <script type="module" src="/js/settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/js/settings.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('month').value = currentMonth();
$('monthLabel').textContent = $('month').value;
$('month').addEventListener('change', () => { $('monthLabel').textContent = $('month').value; loadLimits(); });

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
  } catch (e) { showError(e.message); }
}
$('saveSettings').addEventListener('click', async () => {
  try {
    await api.put('/api/settings', {
      monthly_income: reaisToCents($('monthly_income').value),
      fixed_costs: reaisToCents($('fixed_costs').value),
      savings_goal: reaisToCents($('savings_goal').value),
    });
    showError('Saved'); // reuse toast for confirmation
  } catch (e) { showError(e.message); }
});

async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`)]);
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = cats.filter(c => c.active).map(c => `
      <tr><td>${c.name}</td>
      <td><input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}" /></td></tr>`).join('');
    $('limits').querySelectorAll('input[data-cat]').forEach(inp =>
      inp.addEventListener('change', async () => {
        try {
          await api.put('/api/limits', { category_id: Number(inp.dataset.cat),
            month: $('month').value, limit_cents: reaisToCents(inp.value) });
        } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    $('cards').innerHTML = cards.filter(c => c.active)
      .map(c => `<span>${c.name} <button data-del="${c.id}">×</button></span>`).join(' ');
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}
$('addCard').addEventListener('click', async () => {
  try { await api.post('/api/cards', { name: $('newCard').value }); $('newCard').value = ''; loadCards(); }
  catch (e) { showError(e.message); }
});

loadSettings(); loadLimits(); loadCards();
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, open `/settings.html`. Confirm savings fields show 14350 / 3770 / 2440.
Edit a limit for `2026-06`, then check the dashboard reflects it. Add and remove a card.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: settings page (savings model, per-month limits, cards)"
```

---

## Task 15: Frontend — BI page

**Files:**
- Create: `public/bi.html`, `public/js/bi.js`

- [ ] **Step 1: Create `public/bi.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — BI</title>
  <link rel="stylesheet" href="/css/app.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Dashboard</a>
      <a href="/transactions.html">Transactions</a>
      <a href="/settings.html">Settings</a>
      <a href="/bi.html" class="active">BI</a>
    </nav>
    <div class="card">
      <label>From <input type="month" id="from" /></label>
      <label>To <input type="month" id="to" /></label>
      <button id="run">Update</button>
    </div>
    <canvas id="chart" height="120"></canvas>
  </div>
  <script type="module" src="/js/bi.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/js/bi.js`**

```js
import { api, showError } from './api.js';
import { currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('to').value = currentMonth();
$('from').value = currentMonth().slice(0, 5) + '01'; // Jan of current year
let chart;

async function run() {
  try {
    const d = await api.get(`/api/bi/trends?from=${$('from').value}&to=${$('to').value}`);
    const datasets = d.series
      .filter(s => s.spent_cents.some(v => v > 0))
      .map(s => ({ label: s.name, data: s.spent_cents.map(c => c / 100), fill: false, tension: 0.3 }));
    if (chart) chart.destroy();
    chart = new Chart($('chart'), {
      type: 'line',
      data: { labels: d.months, datasets },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  } catch (e) { showError(e.message); }
}
$('run').addEventListener('click', run);
run();
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, open `/bi.html`. With a couple of transactions entered across two months,
confirm a line chart renders one line per category that has spend.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: BI trends page (Chart.js line chart)"
```

---

## Task 16: Docker packaging

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
ENV PORT=3000
ENV DB_PATH=/app/data/gastando.db
EXPOSE 3000
CMD ["node", "src/server.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  gastando:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

- [ ] **Step 3: Build and run**

Run:
```bash
docker compose up --build -d
```
Expected: container starts; `curl -s localhost:3000/api/health` returns `{"ok":true}`;
`curl -s "localhost:3000/api/dashboard?month=2026-06"` returns 15 categories with seeded limits.

- [ ] **Step 4: Verify persistence across rebuild**

Run:
```bash
curl -s -X POST localhost:3000/api/transactions -H 'Content-Type: application/json' \
  -d '{"date":"2026-06-10","category_id":1,"card_id":1,"amount_cents":5200,"description":"persist test"}'
docker compose down
docker compose up --build -d
curl -s "localhost:3000/api/transactions?month=2026-06"
```
Expected: the "persist test" transaction is still present after the rebuild (data volume intact).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: docker + compose with persistent data volume"
```

---

## Task 17: README + final full-suite run

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

Document: what the app is, `docker compose up --build`, the URL, where data lives
(`./data/gastando.db`), how to back up (copy that file), and `npm test` for development.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites (errorHandler, app, money, dates, validate, crud, transactions, installments, dashboard, bi).

- [ ] **Step 3: Run the coverage gate (final acceptance)**

Run: `npm run coverage`
Expected: exits 0 with lines / statements / functions / branches all ≥80% across `src/**`
(excluding `src/server.js`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README with run, backup, and dev instructions"
```

---

## Self-Review Notes (spec coverage)

- Individual transactions, manual entry → Tasks 7, 13. ✅
- Per-month editable limits with carry-forward → Tasks 6, 14; dashboard read in Task 9. ✅
- Cards per transaction, editable → Tasks 5, 7, 14. ✅
- Installments modeled (expand across N months, atomic, group delete) → Task 8. ✅
- Full savings model (income/fixed/goal → teto, projected savings) → Tasks 9, 12, 14. ✅
- BI trends → Tasks 10, 15. ✅
- Dockerized, SQLite persistence across rebuild → Task 16. ✅
- Seed from card.md (15 categories, June limits, 3 cards, savings numbers) → Task 11. ✅
- Cents-integer money, pt-BR formatting → Task 2; client format in Task 12. ✅
- TDD with services unit-tested + API integration-tested → Tasks 1–11. ✅
- English UI / pt-BR data → HTML labels in English, seed names in pt-BR. ✅
