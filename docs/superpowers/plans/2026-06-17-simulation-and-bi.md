# Purchase Simulation + BI Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only purchase simulation (multi-month category projection) and four new BI line charts (by card, by group, budget vs actual, installment forecast) to the Gastando budget app.

**Architecture:** Follow existing patterns exactly — pure service functions in `src/services`, thin Express routers in `src/routes` mounted in `src/app.js`, and vanilla ES-module frontend pages under `public/`. No schema changes. All new BI endpoints return `{ months, series }` where each series has a `spent_cents` array (the plotted value per month), matching the existing `trends` endpoint so one frontend helper renders them all.

**Tech Stack:** Node.js, Express 5, better-sqlite3, node:test + supertest, Chart.js 4 (CDN), vanilla ES modules.

---

## Reference: existing query patterns (reused, do not re-derive)

- Limit carry-forward (from `src/services/dashboard.js`):
  `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`
- Per-category monthly spend:
  `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?`
- `splitCents(total, count)` from `src/services/installments.js` — splits cents, first `total % count` parts get +1.
- `addMonths(ym, n)` and `monthRange(from, to)` already exist (`src/services/dates.js`, `src/services/bi.js`).
- Test helper `makeTestDb()` (`test/helpers.js`) returns `{ db, groupId, categoryId, cardId }`. It seeds ONE group ('Test'), ONE category ('Supermercado'), ONE card ('Nubank', id 1), and NO limits. Tests needing limits or extra rows insert their own.

---

## Task 1: Simulation service

**Files:**
- Create: `src/services/simulate.js`
- Test: `test/simulate.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/simulate.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { simulatePurchase } = require('../src/services/simulate');

test('simulate spreads installments and carries the limit forward', () => {
  const { db, categoryId } = makeTestDb();
  db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 50000)").run(categoryId);
  db.prepare("INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES ('2026-06-02', ?, 1, 40000)").run(categoryId);

  const r = simulatePurchase(db, { category_id: categoryId, total_cents: 30000, count: 3, first_month: '2026-06' });
  assert.equal(r.name, 'Supermercado');
  assert.equal(r.months.length, 3);

  // June: existing 40000 + installment 10000 = 50000, limit 50000 -> ok, remaining 0
  assert.equal(r.months[0].month, '2026-06');
  assert.equal(r.months[0].installment_cents, 10000);
  assert.equal(r.months[0].spent_before_cents, 40000);
  assert.equal(r.months[0].spent_after_cents, 50000);
  assert.equal(r.months[0].remaining_after_cents, 0);
  assert.equal(r.months[0].status, 'ok');

  // July: limit carries forward (50000), no prior spend
  assert.equal(r.months[1].month, '2026-07');
  assert.equal(r.months[1].limit_cents, 50000);
  assert.equal(r.months[1].remaining_after_cents, 40000);
});

test('simulate flags an over-limit month', () => {
  const { db, categoryId } = makeTestDb();
  db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 5000)").run(categoryId);
  const r = simulatePurchase(db, { category_id: categoryId, total_cents: 9000, count: 1, first_month: '2026-06' });
  assert.equal(r.months[0].status, 'over');
  assert.equal(r.months[0].remaining_after_cents, -4000);
});

test('simulate returns null for an unknown category', () => {
  const { db } = makeTestDb();
  assert.equal(simulatePurchase(db, { category_id: 9999, total_cents: 1000, count: 1, first_month: '2026-06' }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/simulate.test.js`
Expected: FAIL — `Cannot find module '../src/services/simulate'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/simulate.js`:

```js
const { splitCents } = require('./installments');
const { addMonths } = require('./dates');

// Read-only what-if. Projects a (possibly installment) purchase onto a category's
// monthly limit across the affected months. Returns null if the category is unknown/inactive.
function simulatePurchase(db, { category_id, total_cents, count, first_month }) {
  const cat = db.prepare('SELECT id, name FROM categories WHERE id=? AND active=1').get(category_id);
  if (!cat) return null;

  const pickLimit = db.prepare(
    'SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1');
  const sumSpend = db.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?");

  const amounts = splitCents(total_cents, count);
  const months = amounts.map((installment_cents, i) => {
    const month = addMonths(first_month, i);
    const lim = pickLimit.get(category_id, month);
    const limit_cents = lim ? lim.limit_cents : 0;
    const spent_before_cents = sumSpend.get(category_id, month).s;
    const spent_after_cents = spent_before_cents + installment_cents;
    return {
      month,
      installment_cents,
      limit_cents,
      spent_before_cents,
      spent_after_cents,
      remaining_before_cents: limit_cents - spent_before_cents,
      remaining_after_cents: limit_cents - spent_after_cents,
      status: spent_after_cents > limit_cents ? 'over' : 'ok',
    };
  });

  return { category_id: cat.id, name: cat.name, months };
}

module.exports = { simulatePurchase };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/simulate.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/simulate.js test/simulate.test.js
git commit -m "feat: purchase simulation service (multi-month projection)"
```

---

## Task 2: Simulation route + wiring

**Files:**
- Create: `src/routes/simulate.js`
- Modify: `src/app.js` (add mount line)
- Test: `test/simulate.test.js` (append route tests)

- [ ] **Step 1: Write the failing test**

Append to `test/simulate.test.js`:

```js
const request = require('supertest');
const { createApp } = require('../src/app');

test('GET /api/simulate returns a timeline and validates inputs', async () => {
  const { db, categoryId } = makeTestDb();
  const app = createApp(db);

  const ok = await request(app)
    .get(`/api/simulate?category_id=${categoryId}&total_cents=30000&count=3&first_month=2026-06`).expect(200);
  assert.equal(ok.body.months.length, 3);

  // count defaults to 1 when omitted
  const one = await request(app)
    .get(`/api/simulate?category_id=${categoryId}&total_cents=30000&first_month=2026-06`).expect(200);
  assert.equal(one.body.months.length, 1);

  await request(app)
    .get(`/api/simulate?category_id=${categoryId}&total_cents=30000&count=3&first_month=bad`).expect(400);
  await request(app)
    .get(`/api/simulate?category_id=${categoryId}&total_cents=0&count=3&first_month=2026-06`).expect(400);
  await request(app)
    .get(`/api/simulate?category_id=99999&total_cents=30000&count=1&first_month=2026-06`).expect(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/simulate.test.js`
Expected: FAIL — the route returns 404 for the valid request (route not mounted yet) / `Cannot find module '../routes/simulate'` when app loads.

- [ ] **Step 3: Write minimal implementation**

Create `src/routes/simulate.js`:

```js
const express = require('express');
const { isMonth, fail } = require('../validate');
const { simulatePurchase } = require('../services/simulate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const category_id = Number(req.query.category_id);
    const total_cents = Number(req.query.total_cents);
    const count = req.query.count === undefined ? 1 : Number(req.query.count);
    const { first_month } = req.query;

    if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
    if (!Number.isInteger(total_cents) || total_cents <= 0) fail(400, 'total_cents must be a positive integer');
    if (!Number.isInteger(count) || count <= 0) fail(400, 'count must be a positive integer');

    const result = simulatePurchase(db, { category_id, total_cents, count, first_month });
    if (!result) fail(404, 'category not found');
    res.json(result);
  });

  return router;
};
```

Modify `src/app.js` — add this line directly after the `/api/bi` mount:

```js
  app.use('/api/simulate', require('./routes/simulate')(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/simulate.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/simulate.js src/app.js test/simulate.test.js
git commit -m "feat: GET /api/simulate endpoint"
```

---

## Task 3: Simulation frontend page + nav links

No frontend test framework exists in this repo, so this task is verified by running the server and loading the page.

**Files:**
- Create: `public/simulate.html`
- Create: `public/js/simulate.js`
- Modify: `public/index.html`, `public/transactions.html`, `public/settings.html`, `public/bi.html` (add `Simulate` nav link)

- [ ] **Step 1: Create the page**

Create `public/simulate.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Simulate</title>
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Dashboard</a>
      <a href="/transactions.html">Transactions</a>
      <a href="/settings.html">Settings</a>
      <a href="/bi.html">BI</a>
      <a href="/simulate.html" class="active">Simulate</a>
    </nav>
    <div class="card">
      <h2>Simulate a purchase</h2>
      <p class="sub">See how a purchase (or installment plan) would affect a category over the coming months. Nothing is saved.</p>
      <select id="category"></select>
      <input type="number" id="amount" step="0.01" min="0" placeholder="Total (R$)" />
      <input type="number" id="count" min="1" value="1" placeholder="# parcelas" />
      <input type="month" id="firstMonth" />
      <button id="run" class="btn">Simulate</button>
    </div>
    <table id="result"></table>
  </div>
  <script type="module" src="/js/simulate.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the page script**

Create `public/js/simulate.js`:

```js
import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('firstMonth').value = currentMonth();

async function loadCategories() {
  try {
    const cats = await api.get('/api/categories');
    $('category').innerHTML = cats
      .filter(c => c.active)
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (e) { showError(e.message); }
}

async function run() {
  try {
    const total_cents = reaisToCents($('amount').value);
    if (!Number.isInteger(total_cents) || total_cents <= 0) { showError('Enter a total amount'); return; }
    const params = new URLSearchParams({
      category_id: $('category').value,
      total_cents,
      count: Number($('count').value) || 1,
      first_month: $('firstMonth').value,
    });
    const d = await api.get('/api/simulate?' + params.toString());
    render(d);
  } catch (e) { showError(e.message); }
}

function render(d) {
  const rows = d.months.map(m => `
    <tr class="${m.status === 'over' ? 'over' : ''}">
      <td>${m.month}</td>
      <td>${formatBRL(m.installment_cents)}</td>
      <td>${formatBRL(m.limit_cents)}</td>
      <td>${formatBRL(m.remaining_before_cents)}</td>
      <td>${formatBRL(m.remaining_after_cents)}</td>
      <td>${m.status}</td>
    </tr>`).join('');
  $('result').innerHTML = `
    <thead><tr>
      <th>Month</th><th>Installment</th><th>Limit</th>
      <th>Remaining before</th><th>Remaining after</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

$('run').addEventListener('click', run);
loadCategories();
```

- [ ] **Step 3: Add the nav link to the other pages**

In each of `public/index.html`, `public/transactions.html`, `public/settings.html`, `public/bi.html`, add this line inside the existing `<nav class="nav">` block, immediately after the `<a href="/bi.html">…</a>` line (keep that page's own `class="active"` where it already is):

```html
      <a href="/simulate.html">Simulate</a>
```

Note: `transactions.html` has `<input type="month" id="month" style="margin-left:auto" />` as the last nav child — insert the Simulate link BEFORE that input so the month picker stays right-aligned.

- [ ] **Step 4: Verify in the browser**

Run: `npm start` (serves on the port in `src/server.js`).
Open `/simulate.html`. Pick a category, enter a total (e.g. 300), set parcelas to 3, click Simulate. Expected: a 3-row table starting at the chosen month, each row showing installment/limit/remaining, over-limit rows flagged. Confirm the `Simulate` link shows in the nav on Dashboard, Transactions, Settings, and BI. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add public/simulate.html public/js/simulate.js public/index.html public/transactions.html public/settings.html public/bi.html
git commit -m "feat: simulation page + nav link"
```

---

## Task 4: BI service — four new aggregations

**Files:**
- Modify: `src/services/bi.js`
- Test: `test/bi.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `test/bi.test.js`:

```js
test('bi by-card sums spend per card', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000 }).expect(201);
  const r = await request(app).get('/api/bi/by-card?from=2026-06&to=2026-07').expect(200);
  const s = r.body.series.find(x => x.card_id === ctx.cardId);
  assert.deepEqual(s.spent_cents, [10000, 0]);
  await request(app).get('/api/bi/by-card?from=2026-08&to=2026-06').expect(400);
});

test('bi by-group aggregates categories in a group', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 25000 }).expect(201);
  const r = await request(app).get('/api/bi/by-group?from=2026-06&to=2026-06').expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 25000);
});

test('bi budget-vs-actual returns Limit and Spent series', async () => {
  const ctx = makeTestDb();
  ctx.db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 80000)").run(ctx.categoryId);
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 30000 }).expect(201);
  const r = await request(app).get('/api/bi/budget-vs-actual?from=2026-06&to=2026-06').expect(200);
  assert.equal(r.body.series.find(s => s.name === 'Limit').spent_cents[0], 80000);
  assert.equal(r.body.series.find(s => s.name === 'Spent').spent_cents[0], 30000);
});

test('bi installment-forecast counts only installment transactions', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 5000 }).expect(201);
  await request(app).post('/api/transactions').send({
    category_id: ctx.categoryId, card_id: ctx.cardId,
    installment_total_cents: 30000, installment_count: 3, first_month: '2026-06' }).expect(201);
  const r = await request(app).get('/api/bi/installment-forecast?from=2026-06&to=2026-08').expect(200);
  assert.deepEqual(r.body.series[0].spent_cents, [10000, 10000, 10000]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/bi.test.js`
Expected: FAIL — new endpoints return 404 (routes not added yet).

- [ ] **Step 3: Add the service functions**

In `src/services/bi.js`, add these functions before `module.exports` and export them. Keep the existing `trends`/`monthRange`:

```js
function byCard(db, from, to) {
  const months = monthRange(from, to);
  const cards = db.prepare('SELECT id, name FROM cards ORDER BY id').all();
  const q = db.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE card_id=? AND strftime('%Y-%m', date)=?");
  const series = cards.map(c => ({
    card_id: c.id, name: c.name,
    spent_cents: months.map(m => q.get(c.id, m).s),
  }));
  return { months, series };
}

function byGroup(db, from, to) {
  const months = monthRange(from, to);
  const groups = db.prepare('SELECT id, name FROM groups ORDER BY sort_order, id').all();
  const q = db.prepare(
    `SELECT COALESCE(SUM(t.amount_cents),0) AS s FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE c.group_id=? AND strftime('%Y-%m', t.date)=?`);
  const series = groups.map(g => ({
    group_id: g.id, name: g.name,
    spent_cents: months.map(m => q.get(g.id, m).s),
  }));
  return { months, series };
}

function budgetVsActual(db, from, to) {
  const months = monthRange(from, to);
  const cats = db.prepare('SELECT id FROM categories WHERE active=1').all();
  const pickLimit = db.prepare(
    'SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1');
  const spendAll = db.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE strftime('%Y-%m', date)=?");
  const limit_cents = months.map(m =>
    cats.reduce((sum, c) => {
      const l = pickLimit.get(c.id, m);
      return sum + (l ? l.limit_cents : 0);
    }, 0));
  const spent_cents = months.map(m => spendAll.get(m).s);
  return {
    months,
    series: [
      { name: 'Limit', spent_cents: limit_cents },
      { name: 'Spent', spent_cents },
    ],
  };
}

function installmentForecast(db, from, to) {
  const months = monthRange(from, to);
  const q = db.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE installment_group_id IS NOT NULL AND strftime('%Y-%m', date)=?");
  return {
    months,
    series: [{ name: 'Committed installments', spent_cents: months.map(m => q.get(m).s) }],
  };
}
```

Update the export line to:

```js
module.exports = { trends, byCard, byGroup, budgetVsActual, installmentForecast, monthRange };
```

- [ ] **Step 4: Run tests** (they still 404 until Task 5 adds routes)

Run: `node --test test/bi.test.js`
Expected: still FAIL on the four new tests (routes pending). This is expected — proceed to Task 5; do not commit yet.

---

## Task 5: BI routes

**Files:**
- Modify: `src/routes/bi.js`

- [ ] **Step 1: Add the routes**

Rewrite `src/routes/bi.js` to add a shared range validator and the four endpoints:

```js
const express = require('express');
const { isMonth, fail } = require('../validate');
const { trends, byCard, byGroup, budgetVsActual, installmentForecast } = require('../services/bi');

module.exports = (db) => {
  const router = express.Router();

  function range(req) {
    const { from, to } = req.query;
    if (!isMonth(from) || !isMonth(to)) fail(400, 'from/to must be YYYY-MM');
    if (from > to) fail(400, 'from must be <= to');
    return { from, to };
  }

  router.get('/trends', (req, res) => {
    const { from, to } = range(req);
    res.json(trends(db, from, to));
  });
  router.get('/by-card', (req, res) => {
    const { from, to } = range(req);
    res.json(byCard(db, from, to));
  });
  router.get('/by-group', (req, res) => {
    const { from, to } = range(req);
    res.json(byGroup(db, from, to));
  });
  router.get('/budget-vs-actual', (req, res) => {
    const { from, to } = range(req);
    res.json(budgetVsActual(db, from, to));
  });
  router.get('/installment-forecast', (req, res) => {
    const { from, to } = range(req);
    res.json(installmentForecast(db, from, to));
  });

  return router;
};
```

- [ ] **Step 2: Run the full BI test file to verify it passes**

Run: `node --test test/bi.test.js`
Expected: PASS — original `trends` tests plus the four new ones.

- [ ] **Step 3: Commit**

```bash
git add src/services/bi.js src/routes/bi.js test/bi.test.js
git commit -m "feat: BI endpoints — by-card, by-group, budget-vs-actual, installment-forecast"
```

---

## Task 6: BI frontend — render the four charts

Verified by running the server (no frontend test framework).

**Files:**
- Modify: `public/bi.html`
- Modify: `public/js/bi.js`

- [ ] **Step 1: Add canvases to the page**

In `public/bi.html`, replace the single `<canvas id="chart" height="120"></canvas>` with headed canvases (keep everything else, including the existing `Simulate` nav link added in Task 3):

```html
    <h2 class="sub">Spending by category</h2>
    <canvas id="chart" height="120"></canvas>
    <h2 class="sub">Spending by card</h2>
    <canvas id="byCard" height="120"></canvas>
    <h2 class="sub">Spending by group</h2>
    <canvas id="byGroup" height="120"></canvas>
    <h2 class="sub">Budget vs actual</h2>
    <canvas id="budgetVsActual" height="120"></canvas>
    <h2 class="sub">Committed installment forecast</h2>
    <canvas id="installmentForecast" height="120"></canvas>
```

- [ ] **Step 2: Rewrite the page script to render all charts**

Replace the contents of `public/js/bi.js` with:

```js
import { api, showError } from './api.js';
import { currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('to').value = currentMonth();
$('from').value = currentMonth().slice(0, 5) + '01'; // Jan of current year

const charts = {};

// Renders one line chart. `series` items each have { name, spent_cents: number[] }.
// `onlyNonZero` drops flat-zero series (used for the per-category chart which has many).
function lineChart(canvasId, labels, series, onlyNonZero) {
  const datasets = series
    .filter(s => !onlyNonZero || s.spent_cents.some(v => v > 0))
    .map(s => ({ label: s.name, data: s.spent_cents.map(c => c / 100), fill: false, tension: 0.3 }));
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart($(canvasId), {
    type: 'line',
    data: { labels, datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

async function run() {
  try {
    const qs = `from=${$('from').value}&to=${$('to').value}`;
    const [trends, byCard, byGroup, bva, forecast] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`),
      api.get(`/api/bi/by-card?${qs}`),
      api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`),
      api.get(`/api/bi/installment-forecast?${qs}`),
    ]);
    lineChart('chart', trends.months, trends.series, true);
    lineChart('byCard', byCard.months, byCard.series, false);
    lineChart('byGroup', byGroup.months, byGroup.series, false);
    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
  } catch (e) { showError(e.message); }
}

$('run').addEventListener('click', run);
run();
```

- [ ] **Step 3: Verify in the browser**

Run: `npm start`. Open `/bi.html`. Expected: five charts render for the default range. Add a couple of transactions (one installment) via `/transactions.html`, return to BI, click Update — by-card, by-group, budget-vs-actual, and installment-forecast all reflect the data. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add public/bi.html public/js/bi.js
git commit -m "feat: BI page renders by-card, by-group, budget-vs-actual, installment-forecast charts"
```

---

## Task 7: Full test sweep

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass, including `test/simulate.test.js` and the extended `test/bi.test.js`.

- [ ] **Step 2: Commit (only if any incidental fixes were needed)**

```bash
git add -A
git commit -m "test: full suite green for simulation + BI expansion"
```

---

## Self-Review Notes

- **Spec coverage:** Simulation service (Task 1) + route (Task 2) + page (Task 3) cover spec §1. BI service (Task 4) + routes (Task 5) + frontend (Task 6) cover all four charts in spec §2. Tests in Tasks 1, 2, 4 cover spec §3.
- **Field naming:** every series uses `spent_cents` as the plotted-value array (including `budget-vs-actual`, where the `Limit` series stores limit cents under `spent_cents` for frontend uniformity). The frontend `lineChart` helper relies on this. Consistent across Tasks 4 and 6.
- **Card omitted from simulation** per spec (cards have no limits) — confirmed in Tasks 1–3.
- **No schema changes** — confirmed; only reads.
