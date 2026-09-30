# Concept Fidelity & Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five Serene Ledger concept-fidelity gaps (advisor voice, BI chart types, pt-BR language, editorial headers + transactions table) and add a derived warm-dark theme — all frontend-only.

**Architecture:** Refactor the color palette from hardcoded hex into CSS custom properties so a `[data-theme="dark"]` block can override them with no markup changes. Add a no-flash theme-init script + a header toggle. All new logic (advice selection, chart aggregation, theme resolution, row enrichment) lives in pure, unit-tested functions in `public/js/**`. No backend, API, or DB changes.

**Tech Stack:** Vanilla ES modules (`public/js/**`), Tailwind (CDN-independent, compiled via `npm run build:css`), Chart.js 4 (CDN), `node:test` runner (tests are CommonJS `.ts` files that dynamically `import()` the ES modules).

## Global Constraints

- **Frontend-only.** Touch only `public/**`, `tailwind.config.js`. No changes to `src/**`, `migrations/**`, or any HTTP/DB code.
- **No i18n framework.** pt-BR strings are hardcoded.
- **No AI/LLM and no new network calls.** Advice is deterministic and computed from data already fetched.
- **"Dashboard" and "BI" stay in English** in the nav (established BR-fintech loanwords); everything else is pt-BR.
- **Opacity utilities must keep working.** Tailwind colors use the `rgb(var(--x) / <alpha-value>)` form because the CSS component layer uses `/20` and `/10` opacities.
- **Run after any CSS/token change:** `npm run build:css` (compiles `public/css/tailwind.src.css` → `public/css/app.css`).
- **Test command:** `npm test` (runs `node --import tsx --test "test/**/*.test.{js,ts}"`).
- **Lint/format:** `npm run lint` (Biome) before each commit.
- **Commit style:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**Create:**
- `public/js/theme-init.js` — classic/CJS dual script: resolves + applies theme before paint; exports `resolveTheme` for tests.
- `public/js/advisor.js` — `selectAdvice(dashboardData)` + `renderAdvisor(dashboardData)`.
- `test/theme.test.ts`, `test/advisor.test.ts` — new unit tests.

**Modify:**
- `tailwind.config.js` — colors → CSS-var form.
- `public/css/tailwind.src.css` — `:root` + `[data-theme="dark"]` variables; dark elevation override.
- `public/js/chrome.js` — nav pt-BR labels + theme toggle button/handler + `themechange` dispatch.
- `public/js/charts.js` — `themeColor`, theme-aware `lineChart`, new `barChart`, `aggregateSeries`, `topSeries`.
- `public/js/ui.js` — `statusPill` pt-BR + new `pageHeader` helper.
- `public/js/dashboard.js` — hero pt-BR + advisor wiring.
- `public/js/transactions.js` — pt-BR pager/buttons + category/card column enrichment.
- `public/js/simulate.js` — pt-BR + results table + impact panel + advisory.
- `public/js/bi.js` — bar routing + Maior Impacto + pt-BR titles + `themechange` re-render.
- `public/js/budget.js` — pt-BR allocation/ceiling text.
- `public/js/settings.js` — pt-BR strings (toast, card labels).
- HTML: `index.html`, `transactions.html`, `parcelas.html`, `recurring.html`, `settings.html`, `bi.html`, `simulate.html`, `setup.html` — add theme-init script to `<head>`; pt-BR strings + `pageHeader`/table changes per screen.
- Tests updated for pt-BR strings: `test/ui.test.ts`, `test/dashboardRender.test.ts`, `test/chrome.test.ts`, `test/budget.test.ts`, `test/settingsRender.test.ts`, `test/transactionsRender.test.ts`, `test/simulateRender.test.ts`, `test/biChart.test.ts`.

---

## Phase 1 — Theme Foundation

### Task 1: CSS-variable token refactor

**Files:**
- Modify: `tailwind.config.js:6-19`
- Modify: `public/css/tailwind.src.css:5-7` (the `@layer base` block)

**Interfaces:**
- Produces: the same Tailwind color names (`paper`, `card`, `ink`, `ink-mut`, `line`, `sage`, `sage-soft`, `gold`, `gold-accent`, `clay`, `clay-soft`, `slate`) now backed by CSS variables. Light values are byte-for-byte the current hex, so light mode is unchanged.

- [ ] **Step 1: Replace the `colors` block in `tailwind.config.js`**

```js
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-mut': 'rgb(var(--ink-mut) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        'sage-soft': 'rgb(var(--sage-soft) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        'gold-accent': 'rgb(var(--gold-accent) / <alpha-value>)',
        clay: 'rgb(var(--clay) / <alpha-value>)',
        'clay-soft': 'rgb(var(--clay-soft) / <alpha-value>)',
        slate: 'rgb(var(--slate) / <alpha-value>)',
      },
```

- [ ] **Step 2: Replace the `@layer base` block in `public/css/tailwind.src.css`**

```css
@layer base {
  :root {
    --paper: 251 249 244;  --card: 255 255 255;
    --ink: 27 28 25;       --ink-mut: 66 72 68;
    --line: 228 226 221;
    --sage: 76 100 85;     --sage-soft: 143 169 152;
    --gold: 115 92 0;      --gold-accent: 212 175 55;
    --clay: 138 79 53;     --clay-soft: 194 125 96;
    --slate: 92 124 132;
  }
  [data-theme='dark'] {
    --paper: 23 24 21;     --card: 33 34 30;
    --ink: 242 241 236;    --ink-mut: 180 176 166;
    --line: 58 59 53;
    --sage: 178 205 187;   --sage-soft: 143 169 152;
    --gold: 233 195 73;    --gold-accent: 233 195 73;
    --clay: 255 181 151;   --clay-soft: 218 145 115;
    --slate: 143 176 184;
  }
  body { @apply bg-paper text-ink font-sans antialiased; }
}
```

- [ ] **Step 3: Rebuild CSS and run the full suite**

Run: `npm run build:css && npm test`
Expected: CSS compiles with no errors; all existing tests PASS (no test asserts on hex, so light mode is behaviorally identical).

- [ ] **Step 4: Verify no stray palette hex remains in the config**

Run: `grep -nE "#([0-9a-fA-F]{6})" tailwind.config.js`
Expected: no matches inside the `colors` block (shadow/other keys may still use rgba — that is fine).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js public/css/tailwind.src.css public/css/app.css
git commit -m "Refactor palette to CSS variables with warm-dark theme values

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: No-flash theme-init script

**Files:**
- Create: `public/js/theme-init.js`
- Create: `test/theme.test.ts`
- Modify: `<head>` of `index.html`, `transactions.html`, `parcelas.html`, `recurring.html`, `settings.html`, `bi.html`, `simulate.html`, `setup.html`

**Interfaces:**
- Produces: `resolveTheme(stored, prefersDark) -> 'light' | 'dark'`. Precedence: an explicit stored value wins; otherwise fall back to the OS preference.

- [ ] **Step 1: Write the failing test** — `test/theme.test.ts`

```ts
const { test } = require('node:test');
const assert = require('node:assert');

test('resolveTheme prefers an explicit stored value', () => {
  const { resolveTheme } = require('../public/js/theme-init.js');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('resolveTheme falls back to OS preference when unset', () => {
  const { resolveTheme } = require('../public/js/theme-init.js');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('', true), 'dark');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="resolveTheme"`
Expected: FAIL — cannot find module `../public/js/theme-init.js`.

- [ ] **Step 3: Create `public/js/theme-init.js`** (dual classic-in-browser / CJS-in-Node)

```js
// Runs synchronously in each page <head> to set the theme before first paint
// (prevents a dark-mode flash). Also exports resolveTheme for unit tests.
(function (root) {
  function resolveTheme(stored, prefersDark) {
    return stored || (prefersDark ? 'dark' : 'light');
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveTheme };
    return;
  }
  var stored = null;
  try {
    stored = localStorage.getItem('theme');
  } catch (e) {
    /* private mode — ignore */
  }
  var prefersDark = window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', resolveTheme(stored, prefersDark));
})(this);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="resolveTheme"`
Expected: PASS (both tests).

- [ ] **Step 5: Include the script in every page `<head>`**

In each of `index.html`, `transactions.html`, `parcelas.html`, `recurring.html`, `settings.html`, `bi.html`, `simulate.html`, `setup.html`, add this line as the **first** child of `<head>` (before the font/CSS links, so it runs earliest):

```html
  <script src="/js/theme-init.js"></script>
```

- [ ] **Step 6: Commit**

```bash
git add public/js/theme-init.js test/theme.test.ts public/*.html
git commit -m "Add no-flash theme-init script to all pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Header theme toggle + nav pt-BR + dark elevation

**Files:**
- Modify: `public/js/chrome.js:1-26`
- Modify: `public/css/tailwind.src.css` (append a dark `.paper-card` override inside `@layer components`)
- Modify: `test/chrome.test.ts`

**Interfaces:**
- Consumes: `data-theme` attribute + `localStorage.theme` (Task 2).
- Produces: clicking `#theme-toggle` flips `document.documentElement`'s `data-theme`, writes `localStorage.theme`, and dispatches a `window` `CustomEvent('themechange', { detail: { theme } })`. Nav labels become pt-BR (except Dashboard/BI).

- [ ] **Step 1: Update `test/chrome.test.ts`** — assert pt-BR nav labels and the toggle button

Add/adjust assertions in the existing nav-render test so it checks:
```ts
  assert.match(html, /Transações/);
  assert.match(html, /Configurações/);
  assert.match(html, /Recorrentes/);
  assert.match(html, />Dashboard</); // stays English
  assert.match(html, /id="theme-toggle"/);
```
(Update any existing assertions that expected `>Transactions<`, `>Settings<`, `>Recurring<` to the pt-BR strings above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="nav"`
Expected: FAIL — labels still English / no `theme-toggle`.

- [ ] **Step 3: Update `NAV_ITEMS` and `renderNav` in `public/js/chrome.js`**

Replace the `NAV_ITEMS` labels and add the toggle to the header:
```js
export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', route: '/' },
  { href: '/transactions.html', label: 'Transações', route: '/transactions.html' },
  { href: '/parcelas.html', label: 'Parcelas', route: '/parcelas.html' },
  { href: '/recurring.html', label: 'Recorrentes', route: '/recurring.html' },
  { href: '/settings.html', label: 'Configurações', route: '/settings.html' },
  { href: '/bi.html', label: 'BI', route: '/bi.html' },
  { href: '/simulate.html', label: 'Simular', route: '/simulate.html' },
];
```
In `renderNav`, replace the `<div id="nav-actions" class="ml-auto"></div>` line with a wrapper that includes the toggle:
```js
      <div class="ml-auto flex items-center gap-3">
        <button id="theme-toggle" type="button" aria-label="Alternar tema"
          class="text-ink-mut hover:text-sage text-lg leading-none">◐</button>
        <div id="nav-actions"></div>
      </div>
```

- [ ] **Step 4: Add the toggle handler to `mountChrome`**

In `public/js/chrome.js`, extend `mountChrome` (after setting `innerHTML`) with:
```js
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (e) {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    });
  }
```

- [ ] **Step 5: Add dark elevation override** — append inside `@layer components` in `public/css/tailwind.src.css`

```css
  [data-theme='dark'] .paper-card { @apply shadow-none; }
```
(The sage-tinted shadow is invisible on dark surfaces; the existing 1px border carries elevation, per the design-md.)

- [ ] **Step 6: Rebuild CSS, run tests**

Run: `npm run build:css && npm test -- --test-name-pattern="nav"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/chrome.js public/css/tailwind.src.css public/css/app.css test/chrome.test.ts
git commit -m "Add theme toggle and pt-BR nav labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Theme-aware charts + bar/aggregation helpers

**Files:**
- Modify: `public/js/charts.js`
- Modify: `test/biChart.test.ts`

**Interfaces:**
- Produces:
  - `themeColor(varName) -> 'rgb(r g b)'` (reads a CSS variable off `:root`).
  - `aggregateSeries(series) -> [{ name, total }]` where `total = sum(spent_cents)` per series.
  - `topSeries(series) -> { name, total } | null` (max total; ties → first).
  - `barChart(canvasId, labels, data, { horizontal })` (Chart.js bar chart).
  - `lineChart` unchanged in signature but now uses theme colors for grid/ticks.

- [ ] **Step 1: Add failing tests to `test/biChart.test.ts`**

```ts
test('aggregateSeries sums each series over the range', async () => {
  const { aggregateSeries } = await import('../public/js/charts.js');
  const series = [
    { name: 'Nubank', spent_cents: [1000, 2000, 500] },
    { name: 'Itaú', spent_cents: [0, 300, 0] },
  ];
  assert.deepEqual(aggregateSeries(series), [
    { name: 'Nubank', total: 3500 },
    { name: 'Itaú', total: 300 },
  ]);
});

test('topSeries returns the largest total, first on ties', async () => {
  const { topSeries } = await import('../public/js/charts.js');
  assert.deepEqual(
    topSeries([
      { name: 'A', spent_cents: [100] },
      { name: 'B', spent_cents: [500] },
      { name: 'C', spent_cents: [500] },
    ]),
    { name: 'B', total: 500 },
  );
  assert.equal(topSeries([]), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="aggregateSeries|topSeries"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add helpers + barChart to `public/js/charts.js`**

Add near the top (after `PALETTE`):
```js
export function themeColor(varName) {
  if (typeof getComputedStyle === 'undefined') return 'rgb(0 0 0)';
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `rgb(${v})`;
}

export function aggregateSeries(series) {
  return series.map((s) => ({
    name: s.name,
    total: s.spent_cents.reduce((a, b) => a + b, 0),
  }));
}

export function topSeries(series) {
  const agg = aggregateSeries(series);
  if (agg.length === 0) return null;
  return agg.reduce((best, cur) => (cur.total > best.total ? cur : best), agg[0]);
}
```
Add the bar chart (mirrors `lineChart`'s registry/destroy pattern):
```js
export function barChart(canvasId, labels, data, { horizontal = false } = {}) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const grid = themeColor('--line');
  const tick = themeColor('--ink-mut');
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: data.map((c) => c / 100),
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tick, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
        y: { ticks: { color: tick, font: { family: 'JetBrains Mono' } }, grid: { color: grid } },
      },
    },
  });
}
```

- [ ] **Step 4: Make `lineChart` grid/ticks theme-aware**

In `lineChart`, replace the hardcoded `grid: { color: '#e4e2dd' }` (both axes) with `grid: { color: themeColor('--line') }` and add `ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } }`.

- [ ] **Step 5: Run tests**

Run: `npm test -- --test-name-pattern="aggregateSeries|topSeries|datasetsFor"`
Expected: PASS (existing `datasetsFor` test still green).

- [ ] **Step 6: Commit**

```bash
git add public/js/charts.js test/biChart.test.ts
git commit -m "Add theme-aware chart colors, bar chart, and series aggregation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — Shared Helpers & Language

### Task 5: pt-BR status pills + pageHeader helper

**Files:**
- Modify: `public/js/ui.js`
- Modify: `test/ui.test.ts`

**Interfaces:**
- Produces:
  - `statusPill(status)` → pt-BR labels: `over` → "Acima", `approaching` → "Perto", else "OK" (classes unchanged: `pill-over`/`pill-warn`/`pill-ok`).
  - `pageHeader(title, subtitle)` → editorial header HTML (Playfair `text-3xl` title + `text-ink-mut` subtitle; subtitle optional).

- [ ] **Step 1: Update `test/ui.test.ts`**

Change the approaching/over assertions and add a pageHeader test:
```ts
  assert.match(statusPill('approaching'), /pill-warn/);
  assert.match(statusPill('approaching'), /Perto/);
```
(Also update the `Close`→`Perto` reference in the existing `approaching` test.) Add:
```ts
test('pageHeader renders a serif title and optional subtitle', async () => {
  const { pageHeader } = await import('../public/js/ui.js');
  const h = pageHeader('Transações', 'Organize seus gastos');
  assert.match(h, /font-display/);
  assert.match(h, /text-3xl/);
  assert.match(h, /Transações/);
  assert.match(h, /Organize seus gastos/);
  assert.doesNotMatch(pageHeader('Só título'), /<p/); // no subtitle → no <p>
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern="ui helpers|pageHeader"`
Expected: FAIL.

- [ ] **Step 3: Implement in `public/js/ui.js`**

Update `statusPill`:
```js
export function statusPill(status) {
  if (status === 'over') return `<span class="pill pill-over">Acima</span>`;
  if (status === 'approaching') return `<span class="pill pill-warn">Perto</span>`;
  return `<span class="pill pill-ok">OK</span>`;
}
```
Add `pageHeader`:
```js
export function pageHeader(title, subtitle) {
  return `<div class="mb-6">
    <h1 class="font-display text-3xl text-ink">${esc(title)}</h1>
    ${subtitle ? `<p class="text-ink-mut mt-1">${esc(subtitle)}</p>` : ''}
  </div>`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --test-name-pattern="ui helpers|pageHeader"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui.js test/ui.test.ts
git commit -m "pt-BR status pills and add pageHeader helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Settings & budget pt-BR

**Files:**
- Modify: `public/js/budget.js:101-120` (`allocationText`, `ceilingText`)
- Modify: `public/js/settings.js` (toast + card labels)
- Modify: `public/settings.html`
- Modify: `test/budget.test.ts`, `test/settingsRender.test.ts`

**Interfaces:**
- Consumes: `pageHeader` (Task 5).
- Produces: pt-BR settings strings; `allocationText`/`ceilingText` return Portuguese.

- [ ] **Step 1: Update `test/budget.test.ts` and `test/settingsRender.test.ts`**

Adjust the assertions that check `allocationText`/`ceilingText`/`renderCards` output to the pt-BR strings introduced in Step 3 (e.g. expect `Teto saudável`, `Acima do teto`/`Abaixo do teto` as applicable, and `Fatura` for the card statement label). Match the exact strings written in Step 3.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/budget.test.ts test/settingsRender.test.ts`
Expected: FAIL on the changed strings.

- [ ] **Step 3: Translate strings**

In `public/js/budget.js`, translate the human-readable strings returned by `ceilingText` and `allocationText` (e.g. "healthy ceiling" → "Teto saudável", over/under wording → "Acima do teto"/"Abaixo do teto"). Keep function names/return shape identical.

In `public/js/settings.js`:
- `renderCards`: "Remove" → "Remover"; "Closing" → "Fechamento"; "Due" → "Vencimento"; `Bill ${...}` → `Fatura ${...}`.
- Save toast `showError('Saved')` → `showError('Salvo')`.

In `public/settings.html`:
- Add `<script src="/js/theme-init.js"></script>` was done in Task 2. Replace the small `<h1 class="font-display text-2xl">Settings</h1>` with a `pageHeader`-style header (either hardcode the equivalent markup `<h1 class="font-display text-3xl text-ink">Configurações</h1>` or leave the JS to inject — hardcode here since settings has no single mount point): change "Settings" → "Configurações", "Savings model" → "Modelo de poupança", "Limits for" → "Limites de", "Cards" → "Cartões", and button "Save" → "Salvar", "Add" → "Adicionar", field labels (Monthly income → Renda mensal, Fixed costs → Custos fixos, Savings goal → Meta de poupança).

- [ ] **Step 4: Run tests**

Run: `npm test -- test/budget.test.ts test/settingsRender.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/budget.js public/js/settings.js public/settings.html test/budget.test.ts test/settingsRender.test.ts
git commit -m "pt-BR settings and budget strings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — Screens

### Task 7: Dashboard hero pt-BR + advisor callout

**Files:**
- Create: `public/js/advisor.js`
- Create: `test/advisor.test.ts`
- Modify: `public/js/dashboard.js`
- Modify: `test/dashboardRender.test.ts`

**Interfaces:**
- Consumes: dashboard payload `d` with `d.totals` (`projected_savings_cents`, `savings_goal_cents`, `teto_cents`, `vs_goal_cents`) and `d.categories` (`name`, `status`, `spent_cents`, `effective_spent_cents?`, `limit_cents`).
- Produces:
  - `selectAdvice(d) -> { id: 'over'|'below-goal'|'healthy', text: string }`.
  - `renderAdvisor(d) -> string` (warm sage callout card with the tip text + a "Revisar Orçamento" button linking to `settings.html`).

- [ ] **Step 1: Write `test/advisor.test.ts`**

```ts
const { test } = require('node:test');
const assert = require('node:assert');

const base = {
  totals: { projected_savings_cents: 300000, savings_goal_cents: 250000, teto_cents: 500000, vs_goal_cents: 50000 },
  categories: [{ name: 'Supermercado', status: 'ok', spent_cents: 40000, limit_cents: 50000 }],
};

test('selectAdvice flags the worst over-limit category first', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  const d = {
    ...base,
    categories: [
      { name: 'Jogos', status: 'over', spent_cents: 30000, effective_spent_cents: 30000, limit_cents: 25000 },
      { name: 'Uber', status: 'over', spent_cents: 60000, effective_spent_cents: 60000, limit_cents: 40000 },
    ],
  };
  const a = selectAdvice(d);
  assert.equal(a.id, 'over');
  assert.match(a.text, /Uber/); // biggest overage (20000 > 5000)
});

test('selectAdvice warns when projected savings is below goal', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  const d = { ...base, totals: { ...base.totals, projected_savings_cents: 200000, savings_goal_cents: 250000, vs_goal_cents: -50000 } };
  assert.equal(selectAdvice(d).id, 'below-goal');
});

test('selectAdvice reinforces when healthy', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  assert.equal(selectAdvice(base).id, 'healthy');
});

test('renderAdvisor includes the tip text and a settings CTA', async () => {
  const { renderAdvisor } = await import('../public/js/advisor.js');
  const html = renderAdvisor(base);
  assert.match(html, /Revisar Orçamento/);
  assert.match(html, /settings\.html/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/advisor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `public/js/advisor.js`**

```js
import { esc, formatBRL } from './format.js';

export function selectAdvice(d) {
  const t = d.totals;
  const over = d.categories
    .filter((c) => c.status === 'over')
    .map((c) => ({ c, overage: (c.effective_spent_cents ?? c.spent_cents) - c.limit_cents }))
    .sort((a, b) => b.overage - a.overage);
  if (over.length > 0) {
    const worst = over[0].c;
    return {
      id: 'over',
      text: `Você passou do limite em ${worst.name}. Considere remanejar ${formatBRL(over[0].overage)} de outra categoria.`,
    };
  }
  if (t.projected_savings_cents < t.savings_goal_cents) {
    const gap = t.savings_goal_cents - t.projected_savings_cents;
    return {
      id: 'below-goal',
      text: `Sua economia projetada está ${formatBRL(gap)} abaixo da meta. Reveja seus gastos discricionários para fechar o mês no azul.`,
    };
  }
  return {
    id: 'healthy',
    text: `Tudo dentro do teto — você está ${formatBRL(t.vs_goal_cents)} acima da meta. Continue assim.`,
  };
}

export function renderAdvisor(d) {
  const a = selectAdvice(d);
  return `
    <section class="paper-card mt-8 bg-sage-soft/10 border-sage-soft/40 flex flex-col md:flex-row md:items-center gap-4">
      <div class="flex-1">
        <div class="label-caps text-sage mb-1">Dica de Conselheiro</div>
        <p class="text-ink">${esc(a.text)}</p>
      </div>
      <a href="settings.html" class="btn-ghost whitespace-nowrap self-start md:self-auto">Revisar Orçamento</a>
    </section>`;
}
```

- [ ] **Step 4: Wire into `public/js/dashboard.js` + translate hero**

In `renderHero`, translate strings: `Projected savings` → `Economia projetada`; `Ceiling ${...}` → `Teto ${...}`; the `vs` string builder → `+${formatBRL(...)} acima da meta` / `${formatBRL(...)} vs meta`; `Spent` → `Gasto`; `of ceiling ${...}` → `do teto ${...}`. In `renderGroups`, `carryover` → `saldo`, `spent` → `gasto`.

Add the import and append the advisor after groups:
```js
import { renderAdvisor } from './advisor.js';
// ...in load():
    document.getElementById('groups').innerHTML = renderGroups(d) + renderAdvisor(d);
```

- [ ] **Step 5: Update `test/dashboardRender.test.ts`** for the pt-BR hero strings (`Economia projetada`, `Teto`, `acima da meta`) and add an assertion that the rendered dashboard contains `Dica de Conselheiro` if that test renders the full page; otherwise leave advisor coverage to `test/advisor.test.ts`.

- [ ] **Step 6: Run tests**

Run: `npm test -- test/advisor.test.ts test/dashboardRender.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/advisor.js public/js/dashboard.js test/advisor.test.ts test/dashboardRender.test.ts
git commit -m "Add deterministic advisor callout and pt-BR dashboard hero

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Transactions table columns + pt-BR

**Files:**
- Modify: `public/js/transactions.js`
- Modify: `public/transactions.html`
- Modify: `test/transactionsRender.test.ts`

**Interfaces:**
- Consumes: `groupTag` (from `ui.js`).
- Produces: `renderRows(rows, lookups)` where `lookups = { cats: Map<id,{name,group_id}>, groups: Map<id,{name}>, cards: Map<id,name> }` (defaults to empty Maps). Rows render Categoria (colored `groupTag` + name) and Cartão columns.

- [ ] **Step 1: Update `test/transactionsRender.test.ts`**

Provide lookups and assert the new columns:
```ts
const lookups = {
  cats: new Map([[1, { name: 'Restaurantes', group_id: 2 }]]),
  groups: new Map([[2, { name: 'Estilo de vida' }]]),
  cards: new Map([[5, 'Nubank']]),
};
const rowsWithRefs = rows.map((r) => ({ ...r, category_id: 1, card_id: 5 }));

test('renderRows shows category tag and card name', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows(rowsWithRefs, lookups);
  assert.match(html, /Restaurantes/);
  assert.match(html, /tag-gold/);   // "Estilo de vida" → gold tag
  assert.match(html, /Nubank/);
});
```
Keep the existing amount/installment assertions but pass `lookups` (or rely on the default empty Maps — update the existing call to `renderRows(rows)` to still work, since lookups defaults).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/transactionsRender.test.ts`
Expected: FAIL — no category/card columns.

- [ ] **Step 3: Update `renderRows` in `public/js/transactions.js`**

Add the import and rewrite `renderRows`:
```js
import { groupTag } from './ui.js';

export function renderRows(rows, lookups = { cats: new Map(), groups: new Map(), cards: new Map() }) {
  return rows
    .map((r) => {
      const cat = lookups.cats.get(r.category_id);
      const groupName = cat ? lookups.groups.get(cat.group_id)?.name ?? '' : '';
      const cardName = lookups.cards.get(r.card_id) ?? '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${r.date}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3">${groupName ? groupTag(groupName) : ''} <span class="text-sm">${esc(cat?.name ?? '')}</span></td>
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

- [ ] **Step 4: Build the lookups in `loadSelectors`/`loadList`**

Add a module-level `const lookups = { cats: new Map(), groups: new Map(), cards: new Map() };`. In `loadSelectors`, also fetch groups and populate all three maps:
```js
const [cats, cards, groups] = await Promise.all([
  api.get('/api/categories'), api.get('/api/cards'), api.get('/api/groups'),
]);
lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name, group_id: c.group_id }]));
lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
lookups.groups = new Map(groups.map((g) => [g.id, { name: g.name }]));
```
Update the `loadList` render call: `$('list').innerHTML = renderRows(rows, lookups);`.

- [ ] **Step 5: Update `public/transactions.html`**

- Replace `<h1 class="font-display text-2xl">Transactions</h1>` with `<h1 class="font-display text-3xl">Transações</h1>` and add a subtitle line under the header row: `<p class="text-ink-mut mb-4">Organize e acompanhe seus fluxos financeiros com precisão.</p>`.
- Add a `<thead>` before `<tbody id="list">`:
```html
      <thead><tr class="text-xs uppercase tracking-wide text-ink-mut border-b border-line">
        <th class="py-2 text-left font-semibold">Data</th>
        <th class="py-2 text-left font-semibold">Descrição</th>
        <th class="py-2 text-left font-semibold">Categoria</th>
        <th class="py-2 text-left font-semibold">Cartão</th>
        <th class="py-2 text-right font-semibold">Valor</th>
        <th class="py-2"></th>
      </tr></thead>
```
- Translate the remaining chrome: filter placeholders ("All categories"→"Todas as categorias", "All cards"→"Todos os cartões", "Search description"→"Buscar descrição"), "Export CSV"→"Exportar CSV", form labels (Date→Data, Category→Categoria, Card→Cartão, Amount→Valor, Description→Descrição, Installment→Parcelamento, First month→Primeiro mês), buttons Add→Adicionar / Cancel→Cancelar, pager `‹ Prev`→`‹ Anterior` / `Next ›`→`Próxima ›`, "Per page"→"Por página".

- [ ] **Step 6: Translate the pager text in `public/js/transactions.js`**

In `updatePager`, change `${from}–${to} of ${total} · page ${page}/${totalPages}` → `${from}–${to} de ${total} · página ${page}/${totalPages}`.

- [ ] **Step 7: Run tests**

Run: `npm test -- test/transactionsRender.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add public/js/transactions.js public/transactions.html test/transactionsRender.test.ts
git commit -m "Add category/card columns and pt-BR to transactions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: BI bar charts + Maior Impacto + pt-BR

**Files:**
- Modify: `public/js/bi.js`
- Modify: `public/bi.html`

**Interfaces:**
- Consumes: `barChart`, `aggregateSeries`, `topSeries`, `lineChart` (Task 4).
- Produces: by-card → vertical bars; by-group → horizontal bars + "Maior Impacto" label; budget-vs-actual stays via `lineChart` unless grouped-bar data is available (keep `lineChart` to avoid backend change — see note); re-renders on `themechange`.

> **Note:** `aggregateSeries` collapses each multi-month series to one total, which is exactly what a per-card / per-group bar needs. Budget-vs-actual and installment-forecast keep `lineChart` (their series are genuinely temporal); only the two single-comparison charts that read wrong as lines become bars. This matches the spec's YAGNI scope.

- [ ] **Step 1: Update `run()` in `public/js/bi.js`**

Replace the by-card and by-group render calls:
```js
import { aggregateSeries, barChart, lineChart, topSeries } from './charts.js';
// ...inside run(), after fetching:
    lineChart('chart', trends.months, trends.series, true);

    const cardAgg = aggregateSeries(byCard.series);
    barChart('byCard', cardAgg.map((s) => s.name), cardAgg.map((s) => s.total), { horizontal: false });

    const groupAgg = aggregateSeries(byGroup.series);
    barChart('byGroup', groupAgg.map((s) => s.name), groupAgg.map((s) => s.total), { horizontal: true });
    const top = topSeries(byGroup.series);
    const impactEl = document.getElementById('byGroupImpact');
    if (impactEl) impactEl.textContent = top ? `Maior impacto: ${top.name}` : '';

    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
    lineChart('savingsTrend', savings.months, savings.series, false);
```

- [ ] **Step 2: Re-render charts on theme change**

At the bottom bootstrap block of `bi.js` (inside the `if (typeof document !== 'undefined' ...)` guard), add:
```js
  window.addEventListener('themechange', run);
```

- [ ] **Step 3: Update `public/bi.html`**

- Replace `<h1 class="font-display text-2xl">BI</h1>` with:
```html
    <div class="mb-2">
      <h1 class="font-display text-3xl text-ink">Business Intelligence</h1>
      <p class="text-ink-mut mt-1">Visualize seu comportamento financeiro com clareza editorial.</p>
    </div>
```
- Translate chart titles: "Spending by category"→"Gasto por categoria", "Spending by card"→"Gasto por cartão", "Spending by group"→"Gasto por grupo", "Budget vs actual"→"Orçamento vs Real", "Committed installment forecast"→"Previsão de parcelas", "Savings over time"→"Poupança ao longo do tempo", "Update"→"Atualizar", From/To→De/Até.
- In the "Gasto por grupo" card header, add the impact label span:
```html
      <div class="paper-card"><div class="flex items-baseline justify-between mb-2"><h2 class="font-display text-lg">Gasto por grupo</h2><span id="byGroupImpact" class="label-caps text-sage"></span></div><canvas id="byGroup" height="140"></canvas></div>
```

- [ ] **Step 4: Manual verification (charts need a browser/DB; no unit test)**

Run: `npm run lint && npm test`
Expected: lint clean; full suite still PASS (no BI unit test asserts on chart type). Note in the commit that BI rendering was verified structurally via the aggregation unit tests in Task 4.

- [ ] **Step 5: Commit**

```bash
git add public/js/bi.js public/bi.html
git commit -m "BI: bar charts for card/group, Maior Impacto, pt-BR titles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Simulate results table + impact panel + pt-BR

**Files:**
- Modify: `public/js/simulate.js`
- Modify: `public/simulate.html`
- Modify: `test/simulateRender.test.ts`

**Interfaces:**
- Consumes: `meterBar`, `statusPill` (ui.js), `formatBRL`.
- Produces: `renderResult(d)` renders a two-column layout — a results table (Mês / Limite / Gasto projetado / +Esta compra / Novo total / Status) + an "Análise de Impacto" panel with per-month mini-meters. New pure helper `simulateAdvisory(months) -> string`.

- [ ] **Step 1: Update `test/simulateRender.test.ts`**

Add/replace assertions:
```ts
test('renderResult shows a results table and impact panel', async () => {
  const { renderResult } = await import('../public/js/simulate.js');
  const d = { months: [
    { month: '2026-07', limit_cents: 100000, installment_cents: 10000, remaining_after_cents: 15000, status: 'ok' },
    { month: '2026-08', limit_cents: 100000, installment_cents: 10000, remaining_after_cents: -5000, status: 'over' },
  ] };
  const html = renderResult(d);
  assert.match(html, /<table/);
  assert.match(html, /Análise de Impacto/);
  assert.match(html, /Novo total/);
  assert.match(html, /Acima/); // status pill pt-BR
});

test('simulateAdvisory phrases the over-count', async () => {
  const { simulateAdvisory } = await import('../public/js/simulate.js');
  assert.match(simulateAdvisory([{ status: 'over' }, { status: 'ok' }]), /excede o limite em 1 de 2/);
  assert.match(simulateAdvisory([{ status: 'ok' }]), /cabe no seu orçamento/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/simulateRender.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `renderResult` + add `simulateAdvisory` in `public/js/simulate.js`**

```js
export function simulateAdvisory(months) {
  const over = months.filter((m) => m.status === 'over').length;
  if (over === 0) return 'Este plano cabe no seu orçamento em todos os meses.';
  return `Este plano excede o limite em ${over} de ${months.length} meses — considere reduzir o número de parcelas.`;
}

export function renderResult(d) {
  const rows = d.months
    .map((m) => {
      const newTotal = m.limit_cents - m.remaining_after_cents;
      const projected = newTotal - m.installment_cents;
      return `
        <tr class="border-b border-line ${m.status === 'over' ? 'bg-clay-soft/10' : ''}">
          <td class="py-2 font-mono text-sm">${m.month}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(m.limit_cents)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(projected)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(m.installment_cents)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(newTotal)}</td>
          <td class="py-2 text-right">${statusPill(m.status)}</td>
        </tr>`;
    })
    .join('');
  const meters = d.months
    .map((m) => {
      const newTotal = m.limit_cents - m.remaining_after_cents;
      return `<div class="mb-3">
        <div class="flex justify-between text-xs text-ink-mut mb-1"><span class="font-mono">${m.month}</span><span class="font-mono">${formatBRL(newTotal)} / ${formatBRL(m.limit_cents)}</span></div>
        ${meterBar(newTotal, m.limit_cents, m.status)}
      </div>`;
    })
    .join('');
  return `
    <div class="grid md:grid-cols-[1fr,320px] gap-6">
      <div class="paper-card overflow-x-auto">
        <table class="w-full text-left">
          <thead><tr class="text-xs uppercase tracking-wide text-ink-mut border-b border-line">
            <th class="py-2 font-semibold">Mês</th>
            <th class="py-2 text-right font-semibold">Limite</th>
            <th class="py-2 text-right font-semibold">Gasto projetado</th>
            <th class="py-2 text-right font-semibold">+Esta compra</th>
            <th class="py-2 text-right font-semibold">Novo total</th>
            <th class="py-2 text-right font-semibold">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <aside class="paper-card">
        <h2 class="font-display text-lg mb-3">Análise de Impacto</h2>
        ${meters}
        <p class="text-sm text-ink-mut mt-4 border-t border-line pt-3">${simulateAdvisory(d.months)}</p>
      </aside>
    </div>`;
}
```
Also translate the validation string in `run()`: `'Enter a total amount'` → `'Informe um valor total'`.

- [ ] **Step 4: Update `public/simulate.html`**

Translate: "Simulate a purchase"→"Simular uma compra", the subtitle→"Veja como uma compra (ou parcelamento) afetaria uma categoria nos próximos meses. Nada é salvo.", field labels (Category→Categoria, Total→Valor total, First month→Primeiro mês), button "Simulate"→"Simular". Bump the `<h1>` to `text-3xl`.

- [ ] **Step 5: Run tests**

Run: `npm test -- test/simulateRender.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/simulate.js public/simulate.html test/simulateRender.test.ts
git commit -m "Simulate: results table, impact panel, advisory, pt-BR

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Recurring + Parcelas headers/pt-BR + full-suite sweep

**Files:**
- Modify: `public/recurring.html`, `public/parcelas.html` (and their render helpers `public/js/recurring.js`, `public/js/parcelas.js` for any user-facing English strings)
- Modify: `test/recurringRender.test.ts`, `test/parcelasRender.test.ts` (only if string assertions change)

**Interfaces:**
- Consumes: `pageHeader` conventions (Task 5).

- [ ] **Step 1: Bump headers + translate**

- `recurring.html`: "Recurring Templates" → "Recorrentes" (bump to `text-3xl`), "Add Recurring Template" → "Adicionar recorrente", and any button/field English strings → pt-BR.
- `parcelas.html`: keep "Parcelas" title (already pt) but bump to `text-3xl` if not already; translate "Edit installment" → "Editar parcela" and other visible English strings.
- In `recurring.js`/`parcelas.js`, translate any user-facing English strings in render output (e.g. status/action labels) to pt-BR.

- [ ] **Step 2: Update the two render tests** for any changed strings to match Step 1 exactly.

- [ ] **Step 3: Run the full suite + lint + CSS build**

Run: `npm run build:css && npm run lint && npm test`
Expected: CSS builds; Biome clean; **all** tests PASS.

- [ ] **Step 4: Grep sweep for leftover English chrome**

Run: `grep -rnE ">(Save|Cancel|Add|Edit|Delete|Remove|Settings|Transactions|Recurring|Spent|Ceiling|Over|Close)<" public/*.html`
Expected: no matches (all user-facing chrome now pt-BR; "Dashboard"/"BI" intentionally remain in nav only).

- [ ] **Step 5: Commit**

```bash
git add public/recurring.html public/parcelas.html public/js/recurring.js public/js/parcelas.js test/recurringRender.test.ts test/parcelasRender.test.ts
git commit -m "pt-BR + editorial headers for recurring and parcelas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes (spec coverage)

- **Workstream A (dark mode):** Tasks 1–4 (tokens, init, toggle, charts). ✅
- **Workstream B (pt-BR):** Tasks 3, 5, 6, 7, 8, 9, 10, 11 cover nav/status/settings/dashboard/transactions/BI/simulate/recurring/parcelas. ✅
- **Workstream C (headers + tx table):** Task 5 (`pageHeader`), Task 8 (columns), Tasks 9–11 (headers). ✅
- **Workstream D (BI charts):** Tasks 4 + 9. ✅
- **Workstream E (advisor):** Task 7 (dashboard) + Task 10 (simulate impact/advisory). ✅
- **Constraint — frontend-only:** every task touches only `public/**` + `tailwind.config.js`. ✅
- **Constraint — opacity utilities:** Task 1 uses `rgb(var(--x) / <alpha-value>)`. ✅

## Verification Checklist (end-to-end)

- [ ] `npm run build:css` succeeds.
- [ ] `npm run lint` clean.
- [ ] `npm test` all green.
- [ ] Manual: `npm start`, load each page, toggle theme — no flash on reload, charts recolor, all chrome pt-BR, advisor card renders on dashboard, transactions show category/card columns, BI shows bars for card/group, simulate shows table + impact panel.
