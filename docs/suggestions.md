# Gastando — Improvement & Feature Suggestions

- Date: 2026-06-26
- Scope: review of current functionality with prioritized improvements and new features
- Based on: full read of `src/` (hexagonal: domain / application / adapters / infra),
  `public/` frontend, `migrations/`, and `docs/spec.md`

Suggestions are prioritized by **leverage per effort** and **fit to the stated
purpose** (a local-first, single-user credit-card budget tracker). Each item is
sized **S** (~hours), **M** (~half-day to day), or **L** (multi-day), with the
gap or rationale grounded in the current code.

---

## What the app does today

A local-first, single-user **credit-card budget tracker**: Node + Express 5 +
better-sqlite3 + Zod, TypeScript with a clean hexagonal architecture, vanilla
JS + Tailwind ("Serene Ledger") frontend, shipped as self-contained binaries.

**Health:** typecheck clean, 104 tests, 80% coverage gate, tidy
domain/application/adapters/infra split — in good shape to extend.

**Working features:** onboarding wizard → dashboard (savings hero + per-category
meters with **overspend carryover**) → transactions (CRUD, pagination,
installment expansion) → settings (per-month limit history, groups/categories/
cards, savings model with ceiling reconciliation) → 5 BI charts → installment
what-if simulator → view-only category detail with trend.

---

## Tier 1 — Highest-value new features (strong fit)

### 1. Installments command-center ("Parcelas") — [M]
Parcelas are a first-class, very-Brazilian credit-card concept, but today you can
only **create** and **delete** a group. There is **no list/overview, and editing
is specced but unimplemented** — `InstallmentRepository` exposes only
`createPurchase` / `remove` (no GET, no re-expand).

**Add:** a page listing every active installment group — remaining balance,
parcelas paid/left (e.g. 3/6), monthly amount, total future committed outflow —
plus edit (atomic re-expand) and "pay off early." The BI `installment-forecast`
series already computes the monthly commitment; this surfaces it as something
actionable. Highest fit, and it closes a real spec gap.

### 2. Recurring / subscription transactions — [M]
Manual entry is the **only** input, yet the seed data is full of monthly
subscriptions (Apple, Claude, Disney+, seguro). Add a "recurring" template
(category / card / amount / day) that one-click materializes each month's charges
— optionally flagging when an amount changed vs last month. Removes the single
biggest friction in the app.

### 3. Suggested limits from history — [S]
Half the app is "spend vs limit," but limits are set blind. Add "use last month"
/ "use 3-month average" buttons in **Settings** and the **onboarding** limits
step. The data is one `spendByCategoryMonth` call per month — small effort, turns
limit-setting from guesswork into data-driven.

### 4. Savings history — the missing half of BI — [M]
Projected savings vs goal is the **dashboard hero**, yet BI is entirely
spend-side — there is no savings trend anywhere. Add a "Savings over time" chart
(income − fixed − actual spend per month, vs goal; realized vs projected). The
one view that speaks directly to the headline number.

---

## Tier 1.5 — Cheap, high value

### 5. CSV export + in-app DB backup/restore — [S–M]
Export transactions/dashboard to CSV; back up & restore the SQLite file from the
UI (today the README says "copy the file by hand"). A simple CSV/paste
**importer** (the spec's "may be revisited") is the biggest lever against
manual-entry fatigue.

### 6. Per-card statement view — [L, most on-theme]
It is a **credit-card** tracker, but cards are just name + active. Add closing/due
day per card and a "projected bill for card X this month" view
(`spendByCardMonth` already aggregates the data). This is what makes it a
credit-card app rather than a generic budget app.

---

## Tier 2 — Improvements to existing features

- **Surface filters on Transactions — [S].** The API supports `category_id` /
  `card_id`, but the page only filters by month. Add category/card dropdowns + a
  description search.
- **Three-state budget meter — [S].** Status is binary `ok | over`; add
  "approaching" (≥80%) so the dashboard warns *before* a limit is blown.
- **Implement installment-group edit — [S–M].** Standalone correctness gap vs the
  spec (see #1): editing amount/count should re-expand the child transactions
  atomically. Today only create/delete exist, and editing a single parcela row
  silently desyncs it from the group total.
- **Escape rendered HTML — [S].** Output is interpolated straight into
  `innerHTML` (`${c.name}`, `${r.description}`, `${groupName}`) with no escaping.
  A category like "Casa & Jardim" or a description containing `<` renders wrong.
  Low security risk (single local user) but a real rendering bug — add an
  `escapeHtml` helper.
- **Replace `prompt()` / `confirm()` in Settings — [M].** Rename/recolor/add use
  raw browser prompts; recolor asks you to *type* a palette token. Inline editing
  + color swatches.

---

## Tier 3 — Technical / hardening

- **PR CI — [S].** Release workflows are tag-triggered; there is **no
  PR-triggered `npm test` + `typecheck` + coverage gate**, so the 104 tests and
  80% rule do not actually gate merges. Add one.
- **Bind to 127.0.0.1 by default — [S].** `listen(port)` binds *all* interfaces;
  a "runs entirely on your machine," no-auth app is currently reachable by anyone
  on the LAN. Default to loopback with an optional `HOST` override.
- **Linter/formatter + editorconfig — [S].** None present (Biome, or
  ESLint + Prettier).
- **Housekeeping — [S].** Move the root mockups `card.html` /
  `orcamento-cartoes.html` into `docs/`.

---

## Deliberately out of scope

Respecting the locked non-goals in `spec.md`: multi-user / authentication, cloud
sync, real-time bank integration, native mobile app.

---

## Recommended starting point

- **#1 Installments** and **#3 Suggested limits** — most value per effort; both
  lean on existing data/services.
- **#2 Recurring transactions** — biggest friction win.
- **PR CI** and **localhost binding** — quick hardening wins worth doing
  regardless.
