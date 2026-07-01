# Concept Fidelity & Dark Mode — Design

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan

## Background

Gastando's UI is a faithful implementation of the "Serene Ledger" design system at
the token/component level (see `tailwind.config.js` and the CSS `@layer components`
in `public/css/tailwind.src.css`). A design review comparing the built app against the
Stitch concept
([project `12854342184843741473`](https://stitch.withgoogle.com/projects/12854342184843741473))
found the foundation near-perfect but surfaced five screen-level gaps. This spec closes
those gaps and adds dark mode.

The design system's `designMd` declares `colorMode: LIGHT` only — there is no dark
palette in the concept. The dark palette here is a **derived** warm-dark variant that
reuses Serene Ledger's own `inverse-*` and `*-fixed-dim` tokens so it stays true to the
brand rather than being invented from scratch.

## Goals

1. **Dark mode** — a warm, editorial dark theme with a persisted manual toggle.
2. **pt-BR language** — all UI chrome in Portuguese, matching the concept and the BR market.
3. **Editorial headers + richer transactions table** — larger serif page titles with
   subtitles; category/card columns with color tags in the transactions list.
4. **BI chart variety** — bar charts where the concept uses bars, instead of rendering
   everything as a line chart.
5. **Advisor voice** — the concept's "calm financial advisor" personality: a Dashboard
   advisor callout and a Simulate impact panel, both driven by deterministic rules.

## Non-Goals

- No backend, HTTP API, use-case, repository, migration, or database changes. Every
  workstream is **frontend-only** (`public/**`, `tailwind.config.js`, `public/css/**`).
- No i18n framework — pt-BR strings are hardcoded (a future locale switch is out of scope).
- No AI/LLM calls — advice is deterministic and offline, preserving the self-contained
  SQLite model.
- No new dark palette *in Stitch* — the dark variant lives only in the app's CSS.
- No changes to the mobile bottom-sheet / FAB behavior beyond theming.

## Constraints & Principles

- **Frontend-only.** Confirmed feasible: the transactions list page already fetches
  `/api/categories` and `/api/cards`; BI already fetches all series; the dashboard payload
  already carries totals + per-category status. Nothing new is needed from the server.
- **YAGNI.** Only the two clearly-wrong BI charts (by-card, by-group) plus budget-vs-actual
  become bars; trend/savings stay line. Advice is a small prioritized rule set, not a
  content system.
- **Testable units.** All new logic lives in pure functions unit-tested with `node:test`.

---

## Workstream A — Theme Foundation (Dark Mode)

### A1. Token refactor to CSS custom properties

Move the palette out of hardcoded hex in `tailwind.config.js` into CSS custom properties
expressed as **space-separated RGB channels**, so Tailwind's opacity utilities
(`bg-sage-soft/20`, `/10`, etc. — used throughout the CSS component layer) keep working:

```js
// tailwind.config.js (colors)
colors: {
  paper:        'rgb(var(--paper) / <alpha-value>)',
  card:         'rgb(var(--card) / <alpha-value>)',
  ink:          'rgb(var(--ink) / <alpha-value>)',
  'ink-mut':    'rgb(var(--ink-mut) / <alpha-value>)',
  line:         'rgb(var(--line) / <alpha-value>)',
  sage:         'rgb(var(--sage) / <alpha-value>)',
  'sage-soft':  'rgb(var(--sage-soft) / <alpha-value>)',
  gold:         'rgb(var(--gold) / <alpha-value>)',
  'gold-accent':'rgb(var(--gold-accent) / <alpha-value>)',
  clay:         'rgb(var(--clay) / <alpha-value>)',
  'clay-soft':  'rgb(var(--clay-soft) / <alpha-value>)',
  slate:        'rgb(var(--slate) / <alpha-value>)',
}
```

Define the variables in `public/css/tailwind.src.css` under `@layer base`:

```css
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
```

**No markup changes.** Existing `bg-paper` / `text-ink` / `border-line` classes resolve to
the active theme automatically. The light values above are the current hex, so light mode
is visually unchanged.

Rationale for dark values (anchored to `designMd` tokens): `sage` → `inverse-primary
#b2cdbb`; `gold-accent` → `secondary-fixed-dim #e9c349`; `clay` → `tertiary-fixed-dim
#ffb597`; `ink` → `inverse-on-surface #f2f1ec`. Surfaces are warm charcoals (never pure
black) per the "warm-paper" ethos.

### A2. Elevation in dark

The signature sage-tinted card shadow (`0 4px 20px rgba(143,169,152,0.10)`) is invisible on
dark surfaces. In dark mode the `.paper-card` shadow is reduced/neutralized and the **1px
border carries elevation** — which the design-md already prescribes as the primary depth
cue. Implement by softening `--tw-shadow`-driven card shadow under `[data-theme='dark']`
(e.g. `.paper-card { @apply shadow-none; }` scoped to dark, relying on the existing border).

### A3. No-flash init

Add `public/js/theme-init.js` as a **classic** (non-module) script, included
**synchronously in the `<head>` of every page** so it runs before first paint:

```js
// theme-init.js
(function () {
  var t = localStorage.getItem('theme');
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
```

Pages to edit (add `<script src="/js/theme-init.js"></script>` to `<head>`): `index.html`,
`transactions.html`, `parcelas.html`, `recurring.html`, `settings.html`, `bi.html`,
`simulate.html`, `setup.html`.

### A4. Toggle

Add a sun/moon button to the header in `chrome.js renderNav` (desktop header; also reachable
on mobile). Clicking:
1. flips `data-theme` on `document.documentElement`,
2. writes `localStorage.theme`,
3. dispatches a `window` `themechange` CustomEvent (for charts).

The button glyph/label reflects the current theme. Default on first visit = OS preference
(handled by A3).

### A5. Chart theming

`public/js/charts.js` currently hardcodes grid color `#e4e2dd` and a fixed hex `PALETTE`.
Change it to read theme colors from the CSS variables at draw time:

```js
function themeColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `rgb(${v})`;
}
```

Grid/tick colors derive from `--line` / `--ink-mut`; series palette from
`--sage`/`--gold-accent`/`--clay`/`--slate`/`--sage-soft`/`--gold`. Chart pages
(`bi.js`, and any other canvas page) listen for `themechange` and re-run their render so
charts recolor when the theme flips.

### A6. Tests

- `theme-init` resolution: given (localStorage value, OS preference) → expected `data-theme`.
  Extract the resolution into a pure helper (e.g. `resolveTheme(stored, prefersDark)`) that
  both `theme-init.js` and tests import.

---

## Workstream B — pt-BR Language Pass

All UI chrome to Portuguese, **hardcoded**. Coverage checklist:

- **Nav** (`chrome.js NAV_ITEMS`): Transactions→Transações, Parcelas (already pt),
  Recurring→Recorrentes, Settings→Configurações, Simulate→Simular. **"Dashboard" and "BI"
  stay as-is** — both are established loanwords in BR fintech; everything else is pt-BR.
- **Hero** (`dashboard.js renderHero`): "Projected savings"→"Economia projetada",
  "Ceiling"→"Teto", "above goal"→"acima da meta", "vs goal"→"vs meta", "Spent"→"Gasto",
  "of ceiling"→"do teto".
- **Status pills** (`ui.js statusPill`): OK→OK, "Close"→"Perto", "Over"→"Acima".
- **Group meter / carryover** (`dashboard.js`): "carryover"→"saldo", "spent"→"gasto".
- **Buttons** (across pages): Add→Adicionar, Save→Salvar, Cancel→Cancelar, Edit→Editar,
  Delete→Excluir, Remove→Remover, Update→Atualizar.
- **Toasts** (`settings.js` "Saved"): →"Salvo". Error/validation strings shown to the user
  (e.g. simulate "Enter a total amount"→"Informe um valor total").
- **Pagination** (`transactions.js updatePager`): "of"→"de", "page"→"página",
  "Items per page"→"Itens por página", Prev/Next→Anterior/Próxima.
- **Settings** headings: "Savings model"→"Modelo de poupança",
  "Limits for"→"Limites de", "Cards"→"Cartões", "Healthy ceiling"→"Teto saudável",
  closing/due labels → "Fechamento"/"Vencimento", "Bill"→"Fatura".
- **Simulate**: "Simulate a purchase"→"Simular uma compra", "Over limit in N of M months"
  →"Acima do limite em N de M meses", column/field labels (see Workstream E).
- **BI**: chart titles → "Gasto por categoria", "Gasto por cartão", "Gasto por grupo",
  "Orçamento vs Real", "Previsão de parcelas", "Poupança ao longo do tempo".

Existing tests that assert English strings (e.g. `ui.js` `statusPill`, `budget.js`
`ceilingText`/allocation text, any dashboard/transactions render assertions) are updated to
the new pt-BR strings in the same pass.

---

## Workstream C — Editorial Headers + Transactions Table

### C1. Shared page header

Add a `pageHeader(title, subtitle)` helper (in `ui.js` or a small `chrome.js` export):

```js
export function pageHeader(title, subtitle) {
  return `<div class="mb-6">
    <h1 class="font-display text-3xl text-ink">${esc(title)}</h1>
    ${subtitle ? `<p class="text-ink-mut mt-1">${esc(subtitle)}</p>` : ''}
  </div>`;
}
```

Apply (replacing the current small `text-2xl` `<h1>`s) on: Transactions
("Transações" / "Organize e acompanhe seus fluxos financeiros com precisão."),
BI ("Business Intelligence" / "Visualize seu comportamento financeiro com clareza."),
Simulate ("Simular uma compra" / short subtitle), Settings ("Configurações"),
Recurring ("Recorrentes"), Parcelas ("Parcelas"). Dashboard keeps its current
title-less hero (matches the concept dashboard).

### C2. Transactions table columns

`transactions.js renderRows` gains **Categoria** and **Cartão** columns. Enrichment is
client-side from maps the page already has/loads:

- Category id→{name, group_id} from `/api/categories` (already fetched in `loadSelectors`).
- Card id→name from `/api/cards` (already fetched).
- Group id→{name, color} from `/api/groups` (add this fetch alongside the existing two).

Category cell renders the colored `groupTag(groupName)` (reusing the existing helper) next
to the category name; card cell renders the card name. Column headers in the HTML table are
updated to include Categoria and Cartão (matching the concept's Data / Descrição / Categoria
/ Cartão / Valor layout). Per-row Edit/Delete actions stay (functional tool need), placed in
a trailing actions column.

### C3. Tests

- `renderRows` given a row plus lookup maps → HTML contains the category name, colored tag
  class, and card name.

---

## Workstream D — BI Chart Types

Add to `charts.js`:

```js
export function barChart(canvasId, labels, data, { horizontal = false } = {}) { ... }
```

`data` is a flat array (one value per label) — a single aggregated series. Routing in
`bi.js`:

- **by-card → vertical bars.** Aggregate each card series over the selected range
  (sum `spent_cents`) → one bar per card.
- **by-group → horizontal bars.** Same aggregation; additionally compute the max and render
  a "Maior Impacto: {group}" label above the chart.
- **budget-vs-actual → grouped bars** (budget vs actual per month, two datasets).
- **category-trend → line** (unchanged). **savings-trend → line** (unchanged).
  **installment-forecast → line** (unchanged; keeps the committed-forecast reading).

A pure `aggregateSeries(series)` helper (sum each series' `spent_cents` → `[{name, total}]`)
is extracted for testing. Bars use theme colors (Workstream A5) and re-render on
`themechange`.

### D1. Tests

- `aggregateSeries` sums correctly and preserves series names/order.
- "Maior Impacto" selects the series with the greatest total (tie → first).

---

## Workstream E — Advisor Voice (Deterministic)

### E1. Dashboard advisor callout

Add `renderAdvisor(data)` (new pure function, e.g. in `dashboard.js` or a small
`advisor.js`) that returns a warm sage callout card appended after the groups. It picks the
**highest-priority** applicable tip from a prioritized rule set over the dashboard payload
already fetched (`totals` + `categories` with `status`/`carry_in`):

1. **Any category over limit** → "Você passou do limite em {categoria}. Considere remanejar."
   (names the worst offender by overage).
2. **Projected savings below goal** (`projected_savings_cents < savings_goal_cents`) →
   "Sua economia projetada está R$X abaixo da meta. Reveja os gastos em {maior grupo discricionário}."
3. **Healthy headroom** (on track, at/above goal) → positive reinforcement:
   "Tudo dentro do teto — você está R$X acima da meta. Continue assim."

The card renders the selected tip plus a **"Revisar Orçamento"** button linking to
`settings.html`. Exact copy finalized during implementation; the **rule selection** is the
tested contract.

### E2. Simulate impact panel + results table

Replace the current per-month card stack (`simulate.js renderResult`) with the concept
layout: a two-column grid (`md:grid-cols-[1fr,320px]`):

- **Left — results table**: columns Mês / Limite / Gasto projetado / +Esta compra /
  Novo total / Status, one row per month, status via `statusPill`, over-months tinted.
- **Right — "Análise de Impacto" panel**: per-month mini `meterBar`s plus a deterministic
  advisory line derived from the over/under counts, e.g.
  "Este plano excede o limite em {N} de {M} meses — considere reduzir para {X} parcelas."
  (positive variant when it fits: "Este plano cabe no seu orçamento em todos os meses.").

### E3. Tests

- `selectAdvice(dashboardData)` returns the expected rule id for representative inputs
  (over-limit, below-goal, healthy).
- `simulateAdvisory(months)` returns the correct over-count phrasing (and the positive
  variant when zero over-months).

---

## Testing Strategy

All new logic is pure and unit-tested with the existing `node:test` runner:

- `resolveTheme(stored, prefersDark)` (A6)
- `aggregateSeries` + "Maior Impacto" selection (D1)
- `renderRows` enrichment (C3)
- `selectAdvice` + `simulateAdvisory` (E3)
- pt-BR string updates propagate to existing `statusPill` / `ceilingText` / render tests (B)

No backend tests change (no backend changes). Manual visual QA in both themes per screen is
recommended but not gated by CI.

## Suggested Sequencing

1. **A — Theme foundation** (tokens are foundational; isolated to config/CSS/init/toggle/charts).
2. **B + C together** (both edit the same HTML/JS strings — do in one pass to avoid rework).
3. **D — BI charts.**
4. **E — Advisor voice.**

Each phase is independently mergeable.

## Open Questions

None. All scope, palette-derivation, advisor-source, and language decisions were resolved
during brainstorming.
