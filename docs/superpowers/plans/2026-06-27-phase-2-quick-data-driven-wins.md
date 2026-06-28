# Phase 2 — Quick Data-Driven Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three small, high-leverage improvements: suggest category limits from spend history, add category/card/description filters to Transactions, and give the budget meter a third "approaching" state.

**Architecture:** Each is a thin vertical slice over existing services. Suggested limits add a use-case method over `ReportRepository.spendByCategoryMonth` plus a GET route and two frontend buttons. Filters extend the existing `TransactionFilter`/`buildWhere`. The three-state meter adds a small domain helper used by the dashboard use-case and reflected in the shared `ui.js` renderers.

**Tech Stack:** TypeScript hexagonal, Express 5, better-sqlite3, zod, `node:test` + supertest, vanilla ESM + Tailwind.

## Global Constraints

(Same as Phases 0–1; repeated so this plan stands alone.)

- Node 22; money in integer **cents**; months `YYYY-MM`, dates `YYYY-MM-DD`.
- Hexagonal layering; ports in `src/domain/ports/index.ts`; errors via `AppError`.
- Tests CommonJS `require('node:test')` in `test/*.test.ts`; `makeTestDb()` for DB, `supertest` + `createApp(ctx.db)` for API.
- Coverage ≥80% (`npm run coverage`).
- HTTP validation via zod + `parse()`; existence rules in use-cases.
- Frontend render functions pure + unit-tested; DOM bootstrap follows existing pages.
- Commit after each task.

---

### Task 1: Suggested limits from history (API)

**Files:**
- Modify: `src/application/use-cases/limits.ts`
- Modify: `src/infra/composition.ts:77` (add `reports` dep)
- Modify: `src/adapters/http/controllers/limits.ts`
- Test: `test/crud.test.ts` (append) or new `test/limitSuggestions.test.ts`

**Interfaces:**
- Consumes: `ReportRepository.spendByCategoryMonth`, `CategoryRepository.listActive`, `addMonths` from `src/domain/services/dates`.
- Produces: `LimitUseCases.suggestions(month: string): LimitSuggestion[]` and `GET /api/limits/suggestions?month=YYYY-MM`.

```ts
export interface LimitSuggestion { category_id: number; last_month_cents: number; avg3_cents: number; }
```

- [ ] **Step 1: Write the failing test**

Create `test/limitSuggestions.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('GET /api/limits/suggestions returns last-month and 3-month average', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const tx = (date, cents) => request(app).post('/api/transactions')
    .send({ date, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: cents, description: 'x' })
    .expect(201);
  await tx('2026-03-10', 30000); // 3 months before June
  await tx('2026-04-10', 60000);
  await tx('2026-05-10', 90000); // last month before June
  const res = await request(app).get('/api/limits/suggestions?month=2026-06').expect(200);
  const row = res.body.find(r => r.category_id === ctx.categoryId);
  assert.equal(row.last_month_cents, 90000);
  assert.equal(row.avg3_cents, 60000); // (30000+60000+90000)/3
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/limitSuggestions.test.ts`
Expected: FAIL — route 404 / not found.

- [ ] **Step 3: Extend the use-case**

In `src/application/use-cases/limits.ts`:

```ts
import type { LimitRepository, CategoryRepository, ReportRepository } from '../../domain/ports';
import { addMonths } from '../../domain/services/dates';
import { AppError } from '../../domain/errors';

export interface LimitUseCaseDeps {
  limits: LimitRepository; categories: CategoryRepository; reports: ReportRepository;
}
export interface LimitSuggestion { category_id: number; last_month_cents: number; avg3_cents: number; }
```

Add to the returned object:

```ts
    suggestions(month: string): LimitSuggestion[] {
      const m1 = addMonths(month, -1);
      const m2 = addMonths(month, -2);
      const m3 = addMonths(month, -3);
      return categories.listActive().map(c => {
        const a = reports.spendByCategoryMonth(c.id, m1);
        const b = reports.spendByCategoryMonth(c.id, m2);
        const d = reports.spendByCategoryMonth(c.id, m3);
        return { category_id: c.id, last_month_cents: a, avg3_cents: Math.round((a + b + d) / 3) };
      });
    },
```

- [ ] **Step 4: Wire `reports` in composition**

In `src/infra/composition.ts`:

```ts
    limits: makeLimitUseCases({
      limits: repositories.limits, categories: repositories.categories, reports: repositories.reports,
    }),
```

- [ ] **Step 5: Add the route**

In `src/adapters/http/controllers/limits.ts`, add **before** `router.get('/')`:

```ts
  router.get('/suggestions', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.suggestions(month));
  });
```

- [ ] **Step 6: Run; confirm pass**

Run: `npx tsx --test test/limitSuggestions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/application/use-cases/limits.ts src/infra/composition.ts src/adapters/http/controllers/limits.ts test/limitSuggestions.test.ts
git commit -m "feat(limits): suggest limits from last-month and 3-month-average spend"
```

---

### Task 2: Suggested-limits buttons (Settings + Setup)

**Files:**
- Modify: `public/settings.html` (two buttons above `#limits`)
- Modify: `public/js/settings.js`
- Modify: `public/setup.html` (two buttons in the limits step)
- Modify: `public/js/setup.js`

**Interfaces:**
- Consumes: `GET /api/limits/suggestions?month=`.
- Produces: clicking a button fills every `input[data-cat]` with the suggested value. On Settings it dispatches `change` so the existing listener persists; on Setup it only fills + re-runs allocation (Setup persists on finish).

- [ ] **Step 1: Add buttons to `settings.html`**

Just above the `<table>`/`#limits` container:

```html
<div class="flex gap-2 mb-3">
  <button id="useLastMonth" class="btn-ghost text-sm">Use last month</button>
  <button id="useAvg3" class="btn-ghost text-sm">Use 3-month average</button>
</div>
```

- [ ] **Step 2: Wire them in `settings.js`**

Add a helper and listeners (inside the `if (typeof document …)` bootstrap, after `wireLimitInputs` is available):

```js
async function applySuggestions(field) {
  try {
    const sugg = await api.get(`/api/limits/suggestions?month=${$('month').value}`);
    const byCat = new Map(sugg.map(s => [s.category_id, s[field]]));
    $('limits').querySelectorAll('input[data-cat]').forEach(inp => {
      const v = byCat.get(Number(inp.dataset.cat));
      if (v !== undefined) { inp.value = (v / 100).toFixed(2); inp.dispatchEvent(new Event('change')); }
    });
    updateAllocation();
  } catch (e) { showError(e.message); }
}
$('useLastMonth').addEventListener('click', () => applySuggestions('last_month_cents'));
$('useAvg3').addEventListener('click', () => applySuggestions('avg3_cents'));
```

- [ ] **Step 3: Add buttons + wiring to Setup**

In `public/setup.html`, inside the limits step, add the same two buttons with ids `setupUseLastMonth` / `setupUseAvg3`. In `public/js/setup.js`, inside the bootstrap, add:

```js
async function applySuggestions(field) {
  try {
    const sugg = await api.get(`/api/limits/suggestions?month=${month}`);
    const byCat = new Map(sugg.map(s => [s.category_id, s[field]]));
    $('limits').querySelectorAll('input[data-cat]').forEach(inp => {
      const v = byCat.get(Number(inp.dataset.cat));
      if (v !== undefined) inp.value = (v / 100).toFixed(2);
    });
    updateAllocation();
  } catch (e) { showError(e.message); }
}
$('setupUseLastMonth').addEventListener('click', () => applySuggestions('last_month_cents'));
$('setupUseAvg3').addEventListener('click', () => applySuggestions('avg3_cents'));
```

- [ ] **Step 4: Manual smoke**

Run: `npm start`; on Settings, enter a couple of past-month transactions first, then click "Use last month" and confirm inputs fill and persist (reload shows them). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add public/settings.html public/js/settings.js public/setup.html public/js/setup.js
git commit -m "feat(limits): one-click suggested limits in Settings and Setup"
```

---

### Task 3: Transaction filters — category, card, description search (API)

**Files:**
- Modify: `src/domain/ports/index.ts:34` (`TransactionFilter.q`)
- Modify: `src/infra/repositories/transactions.ts:5-12` (`buildWhere`)
- Modify: `src/application/use-cases/transactions.ts:45-48` (`list` passes `q`)
- Modify: `src/adapters/http/controllers/transactions.ts:15-39` (parse `q`)
- Test: `test/transactions.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/transactions?q=<text>` filters by `description LIKE %text%`; `category_id` and `card_id` already filter (repo + controller support them).

- [ ] **Step 1: Write the failing test**

```ts
test('GET /api/transactions filters by description q', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const add = d => request(app).post('/api/transactions')
    .send({ date: '2026-06-01', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 100, description: d })
    .expect(201);
  await add('Coffee at Starbucks');
  await add('Groceries');
  const res = await request(app).get('/api/transactions?q=coffee').expect(200);
  assert.equal(res.body.length, 1);
  assert.match(res.body[0].description, /Coffee/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/transactions.test.ts`
Expected: FAIL — both rows returned (q ignored).

- [ ] **Step 3: Add `q` to the filter type**

In `src/domain/ports/index.ts`:

```ts
export interface TransactionFilter { month?: string; categoryId?: number; cardId?: number; q?: string; }
```

- [ ] **Step 4: Extend `buildWhere`**

In `src/infra/repositories/transactions.ts`, inside `buildWhere`, before the `return`:

```ts
  if (f.q !== undefined && f.q !== '') { where.push('description LIKE ?'); args.push(`%${f.q}%`); }
```

- [ ] **Step 5: Pass `q` through the use-case**

In `src/application/use-cases/transactions.ts` `list`:

```ts
    list(page: TransactionPage): { total: number; items: Transaction[] } {
      const filter = { month: page.month, categoryId: page.categoryId, cardId: page.cardId, q: page.q };
      return { total: transactions.count(filter), items: transactions.list(page) };
    },
```

- [ ] **Step 6: Parse `q` in the controller**

In `src/adapters/http/controllers/transactions.ts` GET handler, after the `card_id` line:

```ts
    if (req.query.q !== undefined) page.q = String(req.query.q);
```

- [ ] **Step 7: Run; confirm pass + coverage**

Run: `npm run coverage`
Expected: PASS, ≥80%.

- [ ] **Step 8: Commit**

```bash
git add src/domain/ports/index.ts src/infra/repositories/transactions.ts src/application/use-cases/transactions.ts src/adapters/http/controllers/transactions.ts test/transactions.test.ts
git commit -m "feat(transactions): description search filter (q)"
```

---

### Task 4: Transaction filters — frontend controls

**Files:**
- Modify: `public/transactions.html` (filter row)
- Modify: `public/js/transactions.js`

**Interfaces:**
- Consumes: `/api/categories`, `/api/cards`, `GET /api/transactions?...&category_id=&card_id=&q=`.
- Produces: category/card dropdowns (with an "All" option) and a search box that re-query on change.

- [ ] **Step 1: Add controls to `transactions.html`**

Near the existing month input:

```html
<select id="filterCategory" class="rounded border border-line bg-card px-3 py-2"><option value="">All categories</option></select>
<select id="filterCard" class="rounded border border-line bg-card px-3 py-2"><option value="">All cards</option></select>
<input id="search" type="search" placeholder="Search description" class="rounded border border-line bg-card px-3 py-2" />
```

- [ ] **Step 2: Populate the filter dropdowns**

In `transactions.js` `loadSelectors`, after populating the form selects, also fill the filters (keep the leading "All" option):

```js
  const opt = c => `<option value="${c.id}">${esc(c.name)}</option>`;
  $('filterCategory').insertAdjacentHTML('beforeend', cats.filter(c => c.active).map(opt).join(''));
  $('filterCard').insertAdjacentHTML('beforeend', cards.filter(c => c.active).map(opt).join(''));
```

(Add `esc` to the `./format.js` import if Phase 0 hasn't already.)

- [ ] **Step 3: Include filters in the query**

In `loadList`, build the URL from all controls:

```js
    const qs = new URLSearchParams({ month: $('month').value, limit: String(perPage), offset: String(offset) });
    if ($('filterCategory').value) qs.set('category_id', $('filterCategory').value);
    if ($('filterCard').value) qs.set('card_id', $('filterCard').value);
    if ($('search').value.trim()) qs.set('q', $('search').value.trim());
    const { items: rows, total } = await getPage(`/api/transactions?${qs}`);
```

- [ ] **Step 4: Re-query on control change**

In the bootstrap, add:

```js
  ['filterCategory', 'filterCard'].forEach(id => $(id).addEventListener('change', () => { page = 1; loadList(); }));
  $('search').addEventListener('input', () => { page = 1; loadList(); });
```

- [ ] **Step 5: Manual smoke**

Run: `npm start`; add a few transactions, then filter by category, by card, and by a search term. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add public/transactions.html public/js/transactions.js
git commit -m "feat(transactions): category/card/search filters on the page"
```

---

### Task 5: Three-state budget meter (domain helper + dashboard)

**Files:**
- Create: `src/domain/services/budget.ts`
- Modify: `src/application/use-cases/dashboard.ts:44` (use the helper)
- Test: `test/budget.test.ts` (append — note this is a frontend-helper test today; create `test/budgetStatus.test.ts` for the domain helper)
- Modify: `test/dashboard.test.ts` (adjust any status assertions in the 80–100% band)

**Interfaces:**
- Produces: `budgetStatus(spentCents: number, limitCents: number, approachAt?: number): 'ok' | 'approaching' | 'over'`. The dashboard payload's per-category `status` now has three values.

- [ ] **Step 1: Write the failing domain test**

Create `test/budgetStatus.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const { budgetStatus } = require('../src/domain/services/budget');

test('budgetStatus is over above limit, approaching from 80%, else ok', () => {
  assert.equal(budgetStatus(101, 100), 'over');
  assert.equal(budgetStatus(100, 100), 'approaching'); // at the limit
  assert.equal(budgetStatus(80, 100), 'approaching');
  assert.equal(budgetStatus(79, 100), 'ok');
  assert.equal(budgetStatus(50, 0), 'ok');             // no limit set
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/budgetStatus.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/domain/services/budget.ts`:

```ts
export type BudgetStatus = 'ok' | 'approaching' | 'over';

export function budgetStatus(spentCents: number, limitCents: number, approachAt = 0.8): BudgetStatus {
  if (limitCents > 0 && spentCents > limitCents) return 'over';
  if (limitCents > 0 && spentCents >= limitCents * approachAt) return 'approaching';
  return 'ok';
}
```

- [ ] **Step 4: Use it in the dashboard use-case**

In `src/application/use-cases/dashboard.ts`, import and replace the inline status:

```ts
import { budgetStatus } from '../../domain/services/budget';
```
```ts
          status: budgetStatus(effective_spent_cents, limit_cents),
```

- [ ] **Step 5: Fix dashboard tests in the new band**

Run: `npx tsx --test test/dashboard.test.ts`
If a case with spend in 80–100% of limit previously asserted `'ok'`, update it to `'approaching'`. (Cases that are clearly under 80% or over 100% are unchanged.) Re-run → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/services/budget.ts src/application/use-cases/dashboard.ts test/budgetStatus.test.ts test/dashboard.test.ts
git commit -m "feat(budget): three-state status (ok/approaching/over) in dashboard"
```

---

### Task 6: Three-state rendering (frontend)

**Files:**
- Modify: `public/js/ui.js:7-17` (`meterBar`, `statusPill`)
- Modify: `public/css/tailwind.src.css` (add `.pill-warn`, `.meter-fill.approaching`)
- Test: `test/ui.test.ts` (append); `test/dashboardRender.test.ts` (add an approaching case)

**Interfaces:**
- Consumes: `status` of `'ok' | 'approaching' | 'over'`.
- Produces: `meterBar` renders an `approaching` fill; `statusPill` renders a "Close" warn pill.

- [ ] **Step 1: Write the failing render tests**

Append to `test/ui.test.ts`:

```ts
test('statusPill renders a warn pill when approaching', async () => {
  const { statusPill } = await import('../public/js/ui.js');
  assert.match(statusPill('approaching'), /pill-warn/);
  assert.match(statusPill('approaching'), /Close/);
});

test('meterBar marks the approaching fill', async () => {
  const { meterBar } = await import('../public/js/ui.js');
  assert.match(meterBar(85, 100, 'approaching'), /meter-fill approaching/);
  assert.doesNotMatch(meterBar(85, 100, 'approaching'), /over/);
});
```

- [ ] **Step 2: Run; confirm fail**

Run: `npx tsx --test test/ui.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `ui.js`**

```js
export function meterBar(spentCents, limitCents, status) {
  const pct = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  const over = status === 'over' || (limitCents > 0 && spentCents > limitCents);
  const cls = over ? ' over' : status === 'approaching' ? ' approaching' : '';
  return `<div class="meter"><div class="meter-fill${cls}" style="width:${pct}%"></div></div>`;
}

export function statusPill(status) {
  if (status === 'over') return `<span class="pill pill-over">Over</span>`;
  if (status === 'approaching') return `<span class="pill pill-warn">Close</span>`;
  return `<span class="pill pill-ok">OK</span>`;
}
```

- [ ] **Step 4: Add the CSS variants**

Run: `grep -n "pill-over\|meter-fill" public/css/tailwind.src.css`
Find the existing `.pill-over` and `.meter-fill.over` blocks and add gold-toned siblings next to them, e.g.:

```css
.pill-warn { @apply bg-gold/15 text-gold-700; }   /* mirror .pill-over, gold instead of clay */
.meter-fill.approaching { @apply bg-gold; }        /* mirror .meter-fill.over */
```

(Match the exact utility classes the existing `.pill-over` / `.meter-fill.over` use — substitute the gold palette token. Confirm the gold token names from the surrounding file.)

- [ ] **Step 5: Rebuild CSS**

Run: `npm run build:css`
Expected: regenerates `public/css/app.css` including the new classes.

- [ ] **Step 6: Run render tests; confirm pass**

Run: `npx tsx --test test/ui.test.ts test/dashboardRender.test.ts`
Expected: PASS.

- [ ] **Step 7: Manual smoke**

Run: `npm start`; set a category limit and add spend at ~85% of it; confirm the meter is gold and the pill says "Close". Stop the server.

- [ ] **Step 8: Full suite + commit**

Run: `npm run coverage`
```bash
git add public/js/ui.js public/css/tailwind.src.css test/ui.test.ts test/dashboardRender.test.ts
git commit -m "feat(ui): three-state meter and warn pill"
```

---

## Self-Review

- **Spec coverage:** suggested limits API + UI (Tasks 1–2), transaction filters API + UI (Tasks 3–4), three-state meter domain+dashboard+render (Tasks 5–6). All three Phase-2 items covered.
- **Placeholder scan:** the only soft spot is the CSS (Task 6.4) — handled by a grep step that locates the exact existing classes to mirror, rather than guessing utility names.
- **Type consistency:** `LimitSuggestion` defined in Task 1 and consumed by the frontend in Task 2 via field names `last_month_cents` / `avg3_cents`. `TransactionFilter.q` flows port→repo→use-case→controller with the same name. `budgetStatus` signature is identical in helper (Task 5) and tests (Tasks 5–6); status string union `'ok'|'approaching'|'over'` is the same on backend (Task 5) and frontend (Task 6).
- **Coupling note:** `category.js` `renderSummary` and the simulate use-case still compute a two-state status independently. Adopting `budgetStatus`/the three-state pills there is a trivial follow-up but is intentionally out of this phase's scope to keep tasks isolated.
