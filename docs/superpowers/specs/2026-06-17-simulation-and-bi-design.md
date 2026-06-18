# Purchase Simulation + BI Expansion — Design

Date: 2026-06-17

## Summary

Two additions to the Gastando budget app:

1. **Purchase Simulation** — a throwaway "what-if" tool. Enter a purchase (amount,
   category, installments, start month) and see how the affected category's
   remaining budget changes across this month and future months, flagging any
   month that goes over limit. Read-only; nothing is persisted.
2. **BI expansion** — four new line charts on the existing BI page: spending by
   card, spending by group, budget vs actual, and committed installment forecast.

Both follow existing patterns: thin Express routers under `/api`, pure service
functions in `src/services`, vanilla ES-module frontend pages, and Chart.js for
visuals. No schema changes.

## 1. Purchase Simulation

### Frontend
- New page `public/simulate.html` + `public/js/simulate.js`.
- Nav link `Simulate` added to every page's `<nav>` (index, transactions,
  settings, bi, simulate).
- Inputs (top `card` panel, matching existing pages):
  - Category — `<select>` populated from `GET /api/categories`.
  - Total amount — BRL input, converted to cents.
  - Installments — integer, default `1`.
  - Start month — `<input type="month">`, default current month.
  - Update button triggers the request.
- Card is intentionally omitted: cards have no limit in the data model and do not
  affect a category-level projection.
- Results: a per-month table. Columns: Month, Installment, Limit,
  Remaining before, Remaining after, Status. Months where `spent_after > limit`
  are visually flagged (over). Currency formatted via existing `format.js`.

### Backend
- `src/services/simulate.js` — pure function:
  `simulatePurchase(db, { category_id, total_cents, count, first_month })`.
  - Reuses `splitCents(total_cents, count)` from `services/installments.js`.
  - Reuses `addMonths` from `services/dates.js`.
  - Reuses the dashboard's limit carry-forward query (latest
    `category_limits.month <= month`) and per-category monthly spend query.
  - For each affected month `i` in `0..count-1` (`month = addMonths(first_month, i)`):
    - `installment_cents` = `splitCents(...)[i]`
    - `limit_cents` = carry-forward limit for that category/month (0 if none)
    - `spent_before_cents` = real spend for that category that month
    - `spent_after_cents` = `spent_before_cents + installment_cents`
    - `remaining_before_cents` = `limit_cents - spent_before_cents`
    - `remaining_after_cents` = `limit_cents - spent_after_cents`
    - `status` = `'over'` if `spent_after_cents > limit_cents` else `'ok'`
  - Returns `{ category_id, name, months: [ ...above per month... ] }`.
- `src/routes/simulate.js` — `GET /api/simulate`, mounted at `/api/simulate` in
  `src/app.js`. Query params: `category_id`, `total_cents`, `count`, `first_month`.
  - Validation (via `validate.js` `fail`, `isMonth`, plus inline integer checks):
    - `first_month` must match `YYYY-MM` → 400.
    - `total_cents` must be a positive integer → 400.
    - `count` must be a positive integer (default 1 if omitted) → 400.
    - `category_id` must exist and be active → 404 if not found.

### Data flow
Browser form → `GET /api/simulate?...` → `simulatePurchase` reads `categories`,
`category_limits`, `transactions` (read-only) → JSON timeline → table render.

## 2. BI Expansion

All charts live on the existing `bi.html`, sharing the existing from/to month
filter. Each chart is its own `<canvas>`. `public/js/bi.js` gains a
`lineChart(canvasId, labels, datasets)` helper to avoid repetition, and each
chart keeps its own Chart instance (destroyed/rebuilt on Update).

New service functions in `src/services/bi.js` and routes in `src/routes/bi.js`,
each returning `{ months, series }` (same shape as existing `trends`), all
reusing `monthRange(from, to)`:

- **`GET /api/bi/by-card`** — `byCard(db, from, to)`: one series per card, monthly
  sum of all transactions (one-off + installment children) by `card_id`.
- **`GET /api/bi/by-group`** — `byGroup(db, from, to)`: one series per group
  (joined via `categories.group_id`), monthly sum.
- **`GET /api/bi/budget-vs-actual`** — `budgetVsActual(db, from, to)`: two series —
  `limit` (sum over active categories of carry-forward limit per month) and
  `spent` (sum of all transactions per month).
- **`GET /api/bi/installment-forecast`** — `installmentForecast(db, from, to)`:
  one series, monthly sum of transactions where `installment_group_id IS NOT NULL`
  (committed installment spend). Useful for seeing how much of upcoming months is
  already locked in.

Each route validates `from`/`to` as `YYYY-MM` and `from <= to`, matching the
existing `trends` route (400 on violation).

Layout: all charts stacked vertically on one page (no tabs), each under a short
heading.

## 3. Testing (TDD)

- `test/simulate.test.js`:
  - installment spillover across multiple months,
  - limit carry-forward into future months,
  - over-limit detection on an affected month,
  - validation errors (bad month, non-positive amount/count, unknown category),
  - single-month (count=1) purchase.
- Extend `test/bi.test.js` for the four new endpoints:
  - by-card series keyed by card,
  - by-group aggregation,
  - budget-vs-actual limit vs spent,
  - installment-forecast counts only installment transactions,
  - validation (bad month / from > to) on at least one new endpoint.

Tests use the existing `makeTestDb` helper (in-memory DB, applies
`001_schema.sql`). Note: the helper seeds only one group/category/card, so tests
that need limits or multiple cards/categories insert their own rows.

## Out of scope (YAGNI)
- Committing a simulation into a real transaction.
- Saved/named simulation scenarios.
- Per-card budgets or limits.
- Whole-budget (group totals / projected savings) what-if.
