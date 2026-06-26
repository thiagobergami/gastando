# Category Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a view-only per-category screen, reached by clicking a dashboard category card, that lists that category's transactions for a chosen month and charts its spent-vs-limit over the trailing 6 months.

**Architecture:** Frontend-only new screen (`category.html` + `category.js`) backed by the existing `/api/transactions` category filter plus one new read endpoint `GET /api/bi/category-trend`. Chart rendering helpers are extracted from `bi.js` into a shared `charts.js`. No DB, entity, or port changes — all data comes from existing repository methods.

**Tech Stack:** TypeScript + Express 5 + better-sqlite3 (backend, clean architecture: domain / application / adapters); vanilla ES-module browser JS + Tailwind (prebuilt `app.css`) + Chart.js (CDN) (frontend); `node:test` + `supertest` (tests).

## Global Constraints

- No new runtime dependencies. Chart.js is already loaded via CDN; backend stays on `express`, `better-sqlite3`, `zod` only.
- No DB migrations, entity, or port changes — reuse `reports.spendByCategoryMonth`, `limits.resolve`, and the transactions `list`/`count` `categoryId` filter.
- Money is integer cents end-to-end; format for display with `formatBRL` from `format.js`.
- Months are `YYYY-MM` strings; dates are `YYYY-MM-DD`.
- Query-string numbers must be coerced before validation: `zPositiveInt` requires `typeof === 'number'`, but `req.query` values are strings.
- Summary and trend show **raw** spent vs the month's resolved limit (no carryover).
- `app.css` is a prebuilt Tailwind artifact that is **gitignored — never `git add` or commit it**. Any new utility class used in HTML/JS only takes visual effect after `npm run build:css` (run in CI/Docker at build time, and locally for verification); render tests assert on class strings and do not need the rebuild.
- Test runner: `node --import tsx --test <file>` for one file; `npm test` for all.

## File Structure

**New**
- `public/js/charts.js` — chart helpers (`PALETTE`, `datasetsFor`, `lineChart`) shared by `bi.js` and `category.js`.
- `public/category.html` — the category detail screen markup.
- `public/js/category.js` — page logic + exported pure renderers (`renderRows`, `renderSummary`).
- `test/categoryRender.test.ts` — render tests for the new screen.

**Modified**
- `public/js/bi.js` — import chart helpers from `charts.js` (drop local copies).
- `test/biChart.test.ts` — import helpers from `charts.js`.
- `src/application/use-cases/bi.ts` — add `categoryTrend`.
- `src/adapters/http/schemas/bi.ts` — add `biCategoryRangeSchema` (with `category_id` query coercion).
- `src/adapters/http/controllers/bi.ts` — add `GET /category-trend` route.
- `public/js/dashboard.js` — wrap each category card in a link to `category.html`.
- `test/dashboardRender.test.ts` — assert the new link.
- `test/bi.test.ts` — endpoint happy-path + validation tests.
- `public/css/app.css` — rebuilt locally in Task 5 for verification only (gitignored; **not** committed).

---

### Task 1: Extract chart helpers into `charts.js`

Pure refactor: move `PALETTE`, `datasetsFor`, `lineChart` out of `bi.js` so both `bi.js` and the new `category.js` can import them. Behavior unchanged.

**Files:**
- Create: `public/js/charts.js`
- Modify: `public/js/bi.js:1-35`
- Modify: `test/biChart.test.ts:5`

**Interfaces:**
- Produces: `public/js/charts.js` exporting
  - `PALETTE: string[]`
  - `datasetsFor(series: {name, spent_cents:number[]}[], onlyNonZero: boolean)`
  - `lineChart(canvasId: string, labels: string[], series: {name, spent_cents:number[]}[], onlyNonZero: boolean): void`

- [ ] **Step 1: Point the existing chart test at the new module (failing test)**

Edit `test/biChart.test.ts` line 5, changing the import path:

```js
  const { datasetsFor, PALETTE } = await import('../public/js/charts.js');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test test/biChart.test.ts`
Expected: FAIL — `Cannot find module '.../public/js/charts.js'`.

- [ ] **Step 3: Create `public/js/charts.js` with the helpers**

```js
export const PALETTE = ['#4c6455', '#d4af37', '#c27d60', '#5c7c84', '#8fa998', '#735c00'];

export function datasetsFor(series, onlyNonZero) {
  return series
    .filter(s => !onlyNonZero || s.spent_cents.some(v => v > 0))
    .map((s, i) => ({
      label: s.name,
      data: s.spent_cents.map(c => c / 100),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length],
      fill: false,
      tension: 0.3,
    }));
}

const charts = {};
export function lineChart(canvasId, labels, series, onlyNonZero) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels, datasets: datasetsFor(series, onlyNonZero) },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
        y: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
      },
    },
  });
}
```

- [ ] **Step 4: Replace the top of `public/js/bi.js` (lines 1-35) to import from `charts.js`**

Replace lines 1-35 (the imports, `PALETTE`, `datasetsFor`, the `charts` registry, and `lineChart`) with just the imports below. Leave `run()` and the bootstrap block (current lines 37 onward) untouched.

```js
import { api, showError } from './api.js';
import { currentMonth, addMonths } from './format.js';
import { mountChrome } from './chrome.js';
import { lineChart } from './charts.js';
```

- [ ] **Step 5: Run the chart test and the full suite to verify green**

Run: `node --import tsx --test test/biChart.test.ts`
Expected: PASS.
Run: `npm test`
Expected: PASS (no regressions; `bi.js` still drives the BI page through the imported `lineChart`).

- [ ] **Step 6: Commit**

```bash
git add public/js/charts.js public/js/bi.js test/biChart.test.ts
git commit -m "refactor: extract chart helpers into shared charts.js" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `GET /api/bi/category-trend` endpoint

Add a read endpoint returning one category's Spent and Limit series across a month range. Tested through HTTP with `supertest` (consistent with every other BI use-case method in `test/bi.test.ts`; this single HTTP test fully exercises the `categoryTrend` use case).

**Files:**
- Modify: `src/application/use-cases/bi.ts` (add method to the returned object)
- Modify: `src/adapters/http/schemas/bi.ts`
- Modify: `src/adapters/http/controllers/bi.ts`
- Test: `test/bi.test.ts` (append two tests)

**Interfaces:**
- Consumes: `monthRange` (already imported in `bi.ts`), `reports.spendByCategoryMonth`, `limits.resolve` (already in `makeBiUseCases` scope); `zMonth`, `zPositiveInt` from `schemas/common`.
- Produces:
  - Use case: `categoryTrend(categoryId: number, from: string, to: string): { months: string[]; series: { name: string; spent_cents: number[] }[] }` (series order: `Spent` then `Limit`).
  - HTTP: `GET /api/bi/category-trend?category_id=<int>&from=<YYYY-MM>&to=<YYYY-MM>` → same shape; 400 on invalid input.

- [ ] **Step 1: Append failing endpoint tests to `test/bi.test.ts`**

```js
test('bi category-trend returns Spent and Limit series for one category', async () => {
  const ctx = makeTestDb();
  ctx.db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 90000)").run(ctx.categoryId);
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 30000 }).expect(201);
  await request(app).post('/api/transactions').send({
    date: '2026-06-20', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 12000 }).expect(201);

  const r = await request(app)
    .get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=2026-05&to=2026-06`).expect(200);
  assert.deepEqual(r.body.months, ['2026-05', '2026-06']);
  const spent = r.body.series.find(s => s.name === 'Spent');
  const limit = r.body.series.find(s => s.name === 'Limit');
  assert.deepEqual(spent.spent_cents, [0, 42000]);   // no spend in May; 30000+12000 in June
  assert.deepEqual(limit.spent_cents, [0, 90000]);    // no limit at/before May; 90000 in June
});

test('bi category-trend validates inputs (400s)', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/category-trend?from=2026-05&to=2026-06').expect(400);                       // missing category_id
  await request(app).get('/api/bi/category-trend?category_id=0&from=2026-05&to=2026-06').expect(400);          // non-positive
  await request(app).get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=bad&to=2026-06`).expect(400); // bad month
  await request(app).get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=2026-08&to=2026-06`).expect(400); // from > to
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --import tsx --test test/bi.test.ts`
Expected: the two new tests FAIL (unknown route returns 404, not 200/400 as asserted); existing BI tests still pass.

- [ ] **Step 3: Add the `categoryTrend` method to the use case**

In `src/application/use-cases/bi.ts`, add this method inside the returned object (e.g. immediately after `trends`, keeping a comma after the previous method):

```ts
    categoryTrend(categoryId: number, from: string, to: string) {
      const months = monthRange(from, to);
      return {
        months,
        series: [
          { name: 'Spent', spent_cents: months.map(m => reports.spendByCategoryMonth(categoryId, m)) },
          { name: 'Limit', spent_cents: months.map(m => limits.resolve(categoryId, m)) },
        ],
      };
    },
```

- [ ] **Step 4: Add the validation schema**

Replace the contents of `src/adapters/http/schemas/bi.ts` with:

```ts
import { z } from 'zod';
import { zMonth, zPositiveInt } from './common';

export const biRangeSchema = z.object({
  from: zMonth('from/to must be YYYY-MM'),
  to: zMonth('from/to must be YYYY-MM'),
}).refine(d => d.from <= d.to, { message: 'from must be <= to' });

// category_id arrives as a query string; coerce to a number before the
// positive-integer check (zPositiveInt requires typeof === 'number').
export const biCategoryRangeSchema = z.object({
  category_id: z.preprocess(
    v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    zPositiveInt('category_id must be a positive integer'),
  ),
  from: zMonth('from/to must be YYYY-MM'),
  to: zMonth('from/to must be YYYY-MM'),
}).refine(d => d.from <= d.to, { message: 'from must be <= to' });
```

- [ ] **Step 5: Add the controller route**

In `src/adapters/http/controllers/bi.ts`, update the schema import and add the route. Change the import line:

```ts
import { biRangeSchema, biCategoryRangeSchema } from '../schemas/bi';
```

Add this route inside `makeBiController`, before `return router;`:

```ts
  router.get('/category-trend', (req, res) => {
    const { category_id, from, to } = parse(biCategoryRangeSchema, req.query);
    res.json(uc.categoryTrend(category_id, from, to));
  });
```

- [ ] **Step 6: Run tests and typecheck to verify green**

Run: `node --import tsx --test test/bi.test.ts`
Expected: PASS (all BI tests, including the two new ones).
Run: `npm run typecheck`
Expected: no type errors (`parse(biCategoryRangeSchema, …)` yields `category_id: number`).

- [ ] **Step 7: Commit**

```bash
git add src/application/use-cases/bi.ts src/adapters/http/schemas/bi.ts src/adapters/http/controllers/bi.ts test/bi.test.ts
git commit -m "feat: add GET /api/bi/category-trend (category spent vs limit series)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Make dashboard category cards link to the detail screen

Wrap each category card in `renderGroups` in an anchor to `category.html?id=<categoryId>&month=<month>`.

**Files:**
- Modify: `public/js/dashboard.js:32-63` (the `renderGroups` category-card template)
- Test: `test/dashboardRender.test.ts` (append one test)

**Interfaces:**
- Consumes: `d.month` (present in the `/api/dashboard` payload) and `c.category_id` (already used in `renderGroups`).
- Produces: each category card is an `<a href="category.html?id=${c.category_id}&month=${month}">` (consumed by Task 4's screen via URL params).

- [ ] **Step 1: Append a failing link test to `test/dashboardRender.test.ts`**

```js
test('renderGroups links each category to its detail screen', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const html = renderGroups({ ...data, month: '2026-06' });
  assert.match(html, /href="category\.html\?id=1&month=2026-06"/);
  assert.match(html, /href="category\.html\?id=2&month=2026-06"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test test/dashboardRender.test.ts`
Expected: FAIL — no `href="category.html...` in the output.

- [ ] **Step 3: Update `renderGroups` to emit links**

In `public/js/dashboard.js`, inside `renderGroups`, add a `month` binding at the top of the function body (just after `export function renderGroups(d) {`):

```js
  const month = d.month || '';
```

Then change the category card's opening and closing tags. Change the opening tag of the per-category template from:

```js
          <div class="paper-card">
```

to:

```js
          <a href="category.html?id=${c.category_id}&month=${month}" class="paper-card block hover:border-sage transition-colors">
```

and change that card's matching closing `</div>` (the one immediately before the closing backtick of the per-category template, after the meter/pill row) to:

```js
          </a>
```

- [ ] **Step 4: Run the dashboard render tests to verify green**

Run: `node --import tsx --test test/dashboardRender.test.ts`
Expected: PASS (new link test plus the existing examples/tag/carryover tests — those pass `data` without `month`, so `month` is `''`, which does not affect their assertions).

- [ ] **Step 5: Commit**

```bash
git add public/js/dashboard.js test/dashboardRender.test.ts
git commit -m "feat: link dashboard category cards to the category detail screen" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Category detail screen (`category.html` + `category.js`)

View-only screen: header (back link, name, month picker), spent/limit/left summary, trailing-6-month line chart (Spent vs Limit), and the month's transaction rows. Pure renderers are unit-tested; the data-loading bootstrap is guarded by `typeof document` (same pattern as `transactions.js`).

**Files:**
- Create: `public/js/category.js`
- Create: `public/category.html`
- Test: `test/categoryRender.test.ts`

**Interfaces:**
- Consumes: `formatBRL`, `currentMonth`, `addMonths` from `format.js`; `meterBar`, `statusPill` from `ui.js`; `lineChart` from `charts.js` (Task 1); `api`, `showError` from `api.js`; `mountChrome` from `chrome.js`; `GET /api/transactions?category_id=&month=` and `GET /api/bi/category-trend?category_id=&from=&to=` (Task 2); `GET /api/categories` (for the name); link params from Task 3.
- Produces: exported `renderRows(rows)` and `renderSummary({ spent_cents, limit_cents })` (pure, returns HTML strings).

- [ ] **Step 1: Write the failing render tests in `test/categoryRender.test.ts`**

```js
const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  { id: 1, date: '2026-06-03', description: 'Pão de Açúcar', amount_cents: 12000,
    installment_no: null, installment_total: null, installment_group_id: null },
  { id: 2, date: '2026-06-11', description: 'Carrefour', amount_cents: 24000,
    installment_no: 3, installment_total: 10, installment_group_id: 5 },
];

test('category renderRows shows date/desc/amount + installment chip, view-only', async () => {
  const { renderRows } = await import('../public/js/category.js');
  const html = renderRows(rows);
  assert.match(html, /Pão de Açúcar/);
  assert.match(html, /R\$ 120,00/);
  assert.match(html, /R\$ 240,00/);
  assert.match(html, /3\/10/);                 // installment chip
  assert.doesNotMatch(html, /data-edit/);      // no edit affordance
  assert.doesNotMatch(html, /data-del/);       // no delete affordance
});

test('category renderRows shows an empty state', async () => {
  const { renderRows } = await import('../public/js/category.js');
  assert.match(renderRows([]), /No transactions/);
});

test('category renderSummary shows spent/limit/left and status', async () => {
  const { renderSummary } = await import('../public/js/category.js');
  const ok = renderSummary({ spent_cents: 82000, limit_cents: 90000 });
  assert.match(ok, /R\$ 820,00/);    // spent
  assert.match(ok, /R\$ 900,00/);    // limit
  assert.match(ok, /R\$ 80,00/);     // remaining
  assert.match(ok, /pill-ok/);
  const over = renderSummary({ spent_cents: 95000, limit_cents: 90000 });
  assert.match(over, /pill-over/);
  assert.match(over, /meter-fill over/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test test/categoryRender.test.ts`
Expected: FAIL — `Cannot find module '.../public/js/category.js'`.

- [ ] **Step 3: Create `public/js/category.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, currentMonth, addMonths } from './format.js';
import { mountChrome } from './chrome.js';
import { meterBar, statusPill } from './ui.js';
import { lineChart } from './charts.js';

const $ = id => document.getElementById(id);

function params() {
  const q = new URLSearchParams(location.search);
  return { id: Number(q.get('id')), month: q.get('month') || currentMonth() };
}

export function renderRows(rows) {
  if (!rows.length) {
    return `<tr><td class="py-4 text-ink-mut" colspan="3">No transactions this month.</td></tr>`;
  }
  return rows.map(r => `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${r.date}</td>
      <td class="py-3">${r.description}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
    </tr>`).join('');
}

export function renderSummary({ spent_cents, limit_cents }) {
  const remaining = limit_cents - spent_cents;
  const status = spent_cents > limit_cents ? 'over' : 'ok';
  return `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-mut mb-2">
      <span>Spent <b class="text-ink font-mono">${formatBRL(spent_cents)}</b></span>
      <span>Limit <b class="text-ink font-mono">${formatBRL(limit_cents)}</b></span>
      <span>Left <b class="text-ink font-mono">${formatBRL(remaining)}</b></span>
      ${statusPill(status)}
    </div>
    ${meterBar(spent_cents, limit_cents, status)}`;
}

async function load(id, month) {
  try {
    const from = addMonths(month, -5);
    const [rows, trend] = await Promise.all([
      api.get(`/api/transactions?category_id=${id}&month=${month}`),
      api.get(`/api/bi/category-trend?category_id=${id}&from=${from}&to=${month}`),
    ]);
    const spent_cents = rows.reduce((s, r) => s + r.amount_cents, 0);
    const limitSeries = trend.series.find(s => s.name === 'Limit');
    const limit_cents = limitSeries.spent_cents[limitSeries.spent_cents.length - 1];
    $('summary').innerHTML = renderSummary({ spent_cents, limit_cents });
    $('list').innerHTML = renderRows(rows);
    lineChart('trend', trend.months, trend.series, false);
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/');
  const { id, month } = params();
  $('month').value = month;
  api.get('/api/categories')
    .then(cats => {
      const cat = cats.find(c => c.id === id);
      if (!cat) { $('catName').textContent = 'Category not found'; return; }
      $('catName').textContent = cat.name;
      $('month').addEventListener('change', () => {
        const q = new URLSearchParams(location.search);
        q.set('month', $('month').value);
        history.replaceState(null, '', `?${q}`);
        load(id, $('month').value);
      });
      load(id, month);
    })
    .catch(e => showError(e.message));
}
```

- [ ] **Step 4: Run the render tests to verify green**

Run: `node --import tsx --test test/categoryRender.test.ts`
Expected: PASS (importing `category.js` in Node is safe — the bootstrap is guarded by `typeof document !== 'undefined'`, exactly like `transactions.js`).

- [ ] **Step 5: Create `public/category.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Category</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2 space-y-6">
    <div class="flex items-center gap-3">
      <a href="/" class="text-sage text-sm">← Dashboard</a>
      <h1 id="catName" class="font-display text-2xl"></h1>
      <input type="month" id="month" class="ml-auto rounded border border-line bg-card px-3 py-2" />
    </div>
    <section class="paper-card"><div id="summary"></div></section>
    <section class="paper-card">
      <h2 class="font-display text-lg mb-2">Spend trend — last 6 months</h2>
      <canvas id="trend" height="120"></canvas>
    </section>
    <section class="paper-card overflow-x-auto">
      <table class="w-full text-left"><tbody id="list"></tbody></table>
    </section>
  </main>
  <script type="module" src="/js/category.js"></script>
</body>
</html>
```

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all tests, including the new `categoryRender` tests).

- [ ] **Step 7: Commit**

```bash
git add public/js/category.js public/category.html test/categoryRender.test.ts
git commit -m "feat: add view-only category detail screen with spend trend" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Rebuild Tailwind CSS and verify end to end

Regenerate the prebuilt `app.css` **locally** so the new utility classes (`block`, `hover:border-sage`, `transition-colors`, `gap-x-4`, `gap-y-1`, `py-4`, etc.) are present for the smoke check, then run the automated gates. `app.css` is **gitignored** — it is regenerated by `build:css` in CI/Docker, so this task does **not** commit it and produces no new commit (it is a verification gate).

**Files:**
- Modify (local only, gitignored — do not commit): `public/css/app.css` (generated)

- [ ] **Step 1: Rebuild the CSS locally**

Run: `npm run build:css`
Expected: completes without error; `public/css/app.css` is regenerated (it will now contain the new utilities scanned from `dashboard.js`, `category.js`, and `category.html`). Do not `git add` it — it is gitignored.

- [ ] **Step 2: Run the full automated gates**

Run: `npm test`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual smoke check (human reviewer)**

Run: `npm start`, then in the browser:
1. On the dashboard, hover a category card — it shows a sage border (hover affordance) and pointer cursor.
2. Click a category card — navigate to `/category.html?id=<n>&month=<current>`.
3. Confirm: the category name in the header, a Spent/Limit/Left summary with meter + OK/Over pill, a "Spend trend — last 6 months" line chart with **two** lines (Spent and Limit), and the month's transactions listed (date · description · amount, with an installment chip where applicable) and **no** edit/delete buttons.
4. Change the month picker — list, summary, and chart update; the URL's `month` param updates.
5. Click "← Dashboard" to return.

- [ ] **Step 4: No commit (app.css is gitignored)**

Do not commit `app.css`. Confirm the working tree has no staged build artifact:

Run: `git status --short`
Expected: `public/css/app.css` does not appear (it is gitignored). Task 5 adds no new commit; the feature is complete after Tasks 1–4 plus this verification gate.

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-25-category-transactions-and-spend-trend-design.md`):
- New screen `category.html?id=&month=`, view-only, header/month-picker/summary/list → Task 4. ✓
- Reached by clicking a dashboard category card → Task 3. ✓
- Spend trend, trailing 6 months, Spent vs Limit → Task 2 (data) + Task 4 (chart). ✓
- Summary spent = sum of rows; limit = trend's last point → Task 4 `load`. ✓
- New `GET /api/bi/category-trend` + `categoryTrend` use case + schema with query coercion (D1, D3) → Task 2. ✓
- Extract chart helpers into `charts.js`, update `biChart` import (D2) → Task 1. ✓
- Tests: endpoint happy-path + validation (Task 2), category render incl. view-only assertion (Task 4), dashboard link (Task 3), moved chart-helper test (Task 1). ✓
- No DB/entity/port changes; CSS rebuild for the prebuilt artifact → Task 5. ✓
- Out of scope (edit/delete on screen, nav entry, list pagination, carryover) — not implemented. ✓

**Placeholder scan:** No TBD/TODO/"handle errors"/"similar to" — every code step shows complete content. ✓

**Type/name consistency:** `categoryTrend(categoryId, from, to)` and the `{ months, series:[{name:'Spent'|'Limit', spent_cents}] }` shape are identical across the use case (Task 2), the endpoint test (Task 2), and the chart/summary consumption (Task 4, which reads the `'Limit'` series by name). `renderRows`/`renderSummary` signatures match between the tests and the implementation in Task 4. `lineChart`/`datasetsFor`/`PALETTE` names are consistent between Task 1's `charts.js` and its consumers (`bi.js`, `category.js`, `biChart.test.ts`). ✓
