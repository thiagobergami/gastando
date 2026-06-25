# Category detail screen — transactions by category + spend trend

- **Date:** 2026-06-25
- **Status:** Approved (design)
- **Branch context:** `refactor/typescript-clean-architecture`

## Problem

The dashboard shows each category's limit, spent, and status, but there is no way
to drill into a category to see *which* transactions make up that spend, or how the
category has trended over recent months. Today the only transaction list is the
global Transactions page (all categories, paginated by month).

## Goals

1. **Per-category transactions screen** — a separate, view-only screen listing all
   transactions for one category in a chosen month, reached by clicking a category
   card on the dashboard.
2. **Spend trend** — on that same screen, a chart of the category's **spent vs limit**
   over the trailing 6 months (the selected month plus the previous five), plus a
   single-month summary (spent / limit / remaining).

## Non-goals (YAGNI)

- Editing/adding/deleting transactions on this screen (stays on the Transactions page).
- A top-nav entry for the screen (it is a drill-down that needs a category id).
- Pagination of the category transaction list (a single category in a single month
  is small scope; show the whole month).
- Carryover/effective-spend in the summary — the screen shows **raw spent vs the
  month's limit**, consistent with the BI charts.

## Key decisions

### D1 — Trend data via a new focused endpoint
Add `GET /api/bi/category-trend?category_id=&from=&to=`.
- *Why:* the chart needs both **spent and limit per month** for one category.
  `/api/bi/trends` returns every category but no limit; computing client-side would
  mean ~6 `/api/dashboard` round-trips. The new endpoint reuses the exact building
  blocks already in `bi.ts`: `monthRange`, `reports.spendByCategoryMonth`,
  `limits.resolve`.
- *Rejected:* reuse `/api/bi/trends` (no limit, all categories); client-side
  computation (chatty).

### D2 — Extract chart helpers into a shared module
Move `PALETTE`, `datasetsFor`, `lineChart` from `public/js/bi.js` into a new
`public/js/charts.js`; `bi.js` and the new `category.js` both import from it.
- *Why:* both pages need line charts; extracting avoids duplication. Only ripple is
  the import path in `test/biChart.test.ts`.
- *Rejected:* duplicating `lineChart` into `category.js`.

### D3 — Query-string coercion for `category_id`
`zPositiveInt` in `schemas/common.ts` requires `typeof === 'number'`, but query
params arrive as strings. The new endpoint's schema must coerce `category_id`
before the positive-integer check (e.g. a `zPositiveIntFromQuery` factory using
`z.preprocess`, or coerce in the controller as the transactions controller does
with `Number(category_id)`). `from`/`to` continue to validate as `zMonth` strings.

## Detailed design

### 1. New screen — `public/category.html` + `public/js/category.js`

**Route:** `category.html?id=<categoryId>&month=<YYYY-MM>`. `month` defaults to the
current month when absent. View-only.

**Layout**

```
┌─────────────────────────────────────────────┐
│ ← Dashboard       Supermercado    [2026-06 ▾]│  back link · category name · month picker
├─────────────────────────────────────────────┤
│ Spent R$820 · Limit R$900 · Left R$80   [ok] │  summary: meterBar + statusPill (reused from ui.js)
│ ▰▰▰▰▰▰▰▱▱▱                                    │
├─────────────────────────────────────────────┤
│ Spend trend — last 6 months                  │
│   [ line chart: Spent vs Limit ]             │  Chart.js, 2 series
├─────────────────────────────────────────────┤
│ 2026-06-03  Pão de Açúcar          R$120,00  │  view-only rows:
│ 2026-06-11  Carrefour    3/10      R$240,00  │  date · description (+installment tag) · amount
└─────────────────────────────────────────────┘
```

**HTML** mirrors `bi.html`/`transactions.html` conventions: `<div id="nav">`,
`max-w-5xl` main, `paper-card` blocks, Google Fonts + `/css/app.css`, and the
Chart.js CDN `<script src="https://cdn.jsdelivr.net/npm/chart.js@4">` (as in
`bi.html`). A `<canvas id="trend">` for the chart and a `<tbody id="list">` for rows.

**`category.js` behaviour**
- Parse `id` and `month` from `location.search`; default month via `currentMonth()`.
- `mountChrome('/')` so the Dashboard nav item stays highlighted (screen is not in
  the nav). Includes a "← Dashboard" link in the page header.
- On first load, fetch `/api/categories` once and find the category by `id` for its
  name/examples; if not found, render a "Category not found" message and stop.
- `load(month)`:
  - `from = addMonths(month, -5)`, `to = month` (trailing 6 months).
  - In parallel:
    - `GET /api/transactions?category_id=<id>&month=<month>` → rows (full month, no
      pager).
    - `GET /api/bi/category-trend?category_id=<id>&from=<from>&to=<to>` →
      `{ months, series: [Spent, Limit] }`.
  - **Summary spent** = sum of the fetched rows' `amount_cents` (always matches the
    visible list). **Limit** = last value of the trend's `Limit` series. Remaining =
    limit − spent; status `over` when spent > limit. Render with `meterBar` +
    `statusPill` from `ui.js` and `formatBRL` from `format.js`.
  - Render rows (date · description + installment tag when `installment_no` · amount),
    reusing the row markup from `transactions.js` **minus** the Edit/Delete buttons.
  - Render the chart via the shared `lineChart('trend', months, series, false)`
    (`onlyNonZero = false` so the Limit line always shows even at zero spend).
- Month picker `change` re-runs `load(month)` (and updates the `month` query param so
  the URL is shareable/refresh-safe).

**States:** empty month → "No transactions this month" + zeroed chart; unknown id →
"Category not found"; API error → existing `showError` toast.

### 2. Trend backend

**Use case** — `src/application/use-cases/bi.ts`, add:
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
}
```
Shape matches the existing BI series so the chart helpers consume it unchanged.

**Controller** — `src/adapters/http/controllers/bi.ts`, add:
```ts
router.get('/category-trend', (req, res) => {
  const { category_id, from, to } = parse(biCategoryRangeSchema, req.query);
  res.json(uc.categoryTrend(category_id, from, to));
});
```

**Schema** — `src/adapters/http/schemas/bi.ts`, add `biCategoryRangeSchema`:
`category_id` (positive int, **coerced from query string** per D3), `from`/`to`
(`zMonth`), refined `from <= to` (mirrors `biRangeSchema`).

**Response example**
```json
GET /api/bi/category-trend?category_id=5&from=2026-01&to=2026-06
{
  "months": ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"],
  "series": [
    { "name": "Spent", "spent_cents": [82000, 79050, 90100, 0, 61000, 82000] },
    { "name": "Limit", "spent_cents": [90000, 90000, 90000, 90000, 90000, 90000] }
  ]
}
```

### 3. Dashboard — clickable category cards

In `public/js/dashboard.js#renderGroups`, wrap each category `paper-card` in
`<a href="category.html?id=${c.category_id}&month=${d.month}">` with a hover
affordance (e.g. a hover class). `c.category_id` and `d.month` are already present in
the `/api/dashboard` payload — **no backend change**. `renderGroups(d)` already
receives `d`, so `d.month` is in scope.

### 4. Refactor — `public/js/charts.js`

New module exporting `PALETTE`, `datasetsFor`, `lineChart` (moved verbatim from
`bi.js`, which keeps the `charts` registry / `Chart` global usage). `bi.js` imports
them from `./charts.js`. Update `test/biChart.test.ts` to import `datasetsFor` /
`PALETTE` from `../public/js/charts.js`.

## Testing strategy (TDD)

- **Use case** (`test/bi.test.ts` or new): `categoryTrend` returns the correct
  `months` array and Spent/Limit series for a seeded category across a range.
- **HTTP** (`test/bi.test.ts`): `GET /api/bi/category-trend` happy path; validation
  failures — missing/zero/negative `category_id`, non-`YYYY-MM` `from`/`to`,
  `from > to` (each a 400 via the error mapper).
- **Frontend render** (new `test/categoryRender.test.ts`, mirroring
  `transactionsRender.test.ts`/`dashboardRender.test.ts`): the row renderer outputs
  date/description/amount and the installment tag; the summary renderer reflects
  spent/limit/remaining and over/ok status.
- **Dashboard render** (`test/dashboardRender.test.ts`): category cards now link to
  `category.html?id=…`.
- **Regression:** `test/biChart.test.ts` passes against the moved import.

## File change list

**New**
- `public/category.html`
- `public/js/category.js`
- `public/js/charts.js`
- `test/categoryRender.test.ts`

**Modified**
- `src/application/use-cases/bi.ts` — `categoryTrend`
- `src/adapters/http/controllers/bi.ts` — `/category-trend` route
- `src/adapters/http/schemas/bi.ts` — `biCategoryRangeSchema` (+ query coercion helper)
- `public/js/bi.js` — import chart helpers from `charts.js`
- `public/js/dashboard.js` — clickable category cards
- `test/biChart.test.ts` — import path update
- `test/bi.test.ts` — `categoryTrend` + endpoint tests

No DB migrations, entities, or ports change — all data needs are met by existing
repository methods (`spendByCategoryMonth`, `limits.resolve`, transactions
`list`/`count` with the `categoryId` filter).
