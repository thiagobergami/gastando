# Serene Ledger UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin all five Gastando pages (Dashboard, Transactions, Settings, BI, Simulate) to the Stitch "Serene Ledger" design using Tailwind, responsive desktop+mobile, wired to the existing API.

**Architecture:** Keep the "static shell + fetch-and-render-DOM" frontend. Add a Tailwind CLI build step that compiles one static `public/css/app.css`. Refactor each page module to expose a **pure `render*(data) → HTML string`** function (unit-tested with `node --test`, no DOM) plus a thin DOM bootstrap that fetches data, injects the string, and wires events. Shared nav/chrome and render helpers live in new `public/js/chrome.js` and `public/js/ui.js`. No backend changes.

**Tech Stack:** Node 20 + Express 5 + better-sqlite3 (unchanged), Tailwind CSS (CLI build), Chart.js (CDN, restyled), vanilla ESM browser modules, `node:test` + supertest.

## Global Constraints

- No build step beyond the Tailwind CLI; no client framework or bundler.
- No backend/API changes — every endpoint already returns the fields the design needs.
- Currency stored/sent as integer cents; displayed via `formatBRL` as `R$ x.xxx,xx` (pt-BR).
- UI labels in English; data/content (category names, examples) in pt-BR.
- Fonts: Playfair Display (display/headings/big numbers), Inter (body/UI), JetBrains Mono (currency/dates).
- Palette tokens: paper `#fbf9f4`, card `#ffffff`, ink `#1b1c19`, ink-mut `#424844`, line `#e4e2dd`, sage `#4c6455`, sage-soft `#8fa998`, gold `#735c00`, gold-accent `#d4af37`, clay `#8a4f35`, clay-soft `#c27d60`, slate `#5c7c84`.
- Over-limit visual = clay/terracotta; within-limit = sage. Status comes from the API `status` field (`ok`/`over`) where present.
- Coverage gate ≥80% must stay green (`npm run coverage`).
- ESM frontend modules are imported into CJS tests via dynamic `import()`.

---

## File Structure

**Create:**
- `tailwind.config.js` — design tokens + content globs.
- `public/css/tailwind.src.css` — `@tailwind` directives + `@layer components`.
- `public/js/ui.js` — pure render helpers (`meterBar`, `statusPill`, `groupTag`, `field`, `currency`).
- `public/js/chrome.js` — `renderNav(active)` returning the responsive top-nav + bottom-tab-bar markup; `mountChrome(active)` injecting it and the FAB.
- `test/ui.test.js` — unit tests for `ui.js`.
- `test/chrome.test.js` — unit tests for `chrome.js` nav markup.
- `test/dashboardRender.test.js`, `test/transactionsRender.test.js`, `test/settingsRender.test.js`, `test/biChart.test.js`, `test/simulateRender.test.js` — unit tests for each page's pure render functions.

**Modify:**
- `package.json` — devDep `tailwindcss`; scripts `build:css`, `watch:css`.
- `.gitignore` — add `public/css/app.css`.
- `Dockerfile` — `RUN npm run build:css` before `CMD`.
- `public/index.html`, `public/transactions.html`, `public/settings.html`, `public/bi.html`, `public/simulate.html` — new Tailwind shells.
- `public/js/dashboard.js`, `public/js/transactions.js`, `public/js/settings.js`, `public/js/bi.js`, `public/js/simulate.js` — split into pure render fn + bootstrap; emit new markup.
- `docs/spec.md` — update §3 and §7.

**Delete from git (keep generated locally):**
- `public/css/app.css` — now a build artifact.

---

## Task 1: Tailwind toolchain, tokens, and build pipeline

**Files:**
- Create: `tailwind.config.js`, `public/css/tailwind.src.css`
- Modify: `package.json`, `.gitignore`, `Dockerfile`
- Remove from git: `public/css/app.css`

**Interfaces:**
- Produces: a `npm run build:css` script compiling `public/css/tailwind.src.css` → `public/css/app.css`; Tailwind utilities for all palette tokens (`bg-paper`, `text-sage`, `font-display`, `font-mono`, `rounded-lg`, `shadow-card`, etc.) and component classes (`.paper-card`, `.meter`, `.meter-fill`, `.tag`, `.tag-sage|gold|slate|neutral`, `.pill`, `.pill-ok`, `.pill-over`, `.field`, `.bottom-nav`, `.fab`, `.toast`).

- [ ] **Step 1: Install Tailwind as a dev dependency**

Run:
```bash
npm install -D tailwindcss@^3.4.0
```
Expected: `tailwindcss` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        paper: '#fbf9f4',
        card: '#ffffff',
        ink: '#1b1c19',
        'ink-mut': '#424844',
        line: '#e4e2dd',
        sage: '#4c6455',
        'sage-soft': '#8fa998',
        gold: '#735c00',
        'gold-accent': '#d4af37',
        clay: '#8a4f35',
        'clay-soft': '#c27d60',
        slate: '#5c7c84',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '16px', DEFAULT: '8px' },
      boxShadow: { card: '0 4px 20px rgba(143,169,152,0.10)' },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `public/css/tailwind.src.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply bg-paper text-ink font-sans antialiased; }
}

@layer components {
  .paper-card { @apply bg-card border border-line rounded-lg shadow-card p-5; }
  .meter { @apply h-2 rounded-full bg-line overflow-hidden; }
  .meter-fill { @apply h-full rounded-full bg-sage transition-all; }
  .meter-fill.over { @apply bg-clay-soft; }
  .tag { @apply inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded; }
  .tag-sage { @apply bg-sage-soft/20 text-sage; }
  .tag-gold { @apply bg-gold-accent/20 text-gold; }
  .tag-slate { @apply bg-slate/20 text-slate; }
  .tag-neutral { @apply bg-line text-ink-mut; }
  .pill { @apply inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full; }
  .pill-ok { @apply bg-sage-soft/20 text-sage; }
  .pill-over { @apply bg-clay-soft/20 text-clay; }
  .field { @apply flex flex-col gap-1 text-sm; }
  .field > span { @apply text-xs font-semibold uppercase tracking-wide text-ink-mut; }
  .field input, .field select { @apply rounded border border-line bg-card px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-sage; }
  .btn-primary { @apply bg-sage text-white font-semibold rounded px-4 py-2 hover:bg-sage/90; }
  .btn-ghost { @apply border border-sage text-sage font-semibold rounded px-4 py-2 hover:bg-sage-soft/10; }
  .bottom-nav { @apply fixed bottom-0 inset-x-0 z-40 flex md:hidden bg-card border-t border-line; }
  .bottom-nav a { @apply flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] text-ink-mut; }
  .bottom-nav a.active { @apply text-sage; }
  .fab { @apply fixed bottom-20 right-5 z-40 md:hidden w-14 h-14 rounded-full bg-sage text-white text-2xl shadow-card flex items-center justify-center; }
  .toast { @apply fixed bottom-5 right-5 z-50 hidden bg-clay-soft/20 text-clay px-4 py-3 rounded-lg; }
  .toast.show { @apply block; }
}
```

- [ ] **Step 4: Add build scripts to `package.json`**

In the `"scripts"` block add:
```json
"build:css": "tailwindcss -i public/css/tailwind.src.css -o public/css/app.css --minify",
"watch:css": "tailwindcss -i public/css/tailwind.src.css -o public/css/app.css --watch"
```

- [ ] **Step 5: Stop tracking the generated CSS**

Run:
```bash
git rm --cached public/css/app.css
printf 'public/css/app.css\n' >> .gitignore
```
Expected: `public/css/app.css` staged for deletion; `.gitignore` now lists it.

- [ ] **Step 6: Add the build step to `Dockerfile`**

Change the tail of `Dockerfile` so it builds CSS before start. Replace:
```dockerfile
RUN mkdir -p /app/data
ENV PORT=3000
```
with:
```dockerfile
RUN npm run build:css
RUN mkdir -p /app/data
ENV PORT=3000
```
Note: `npm ci --omit=dev` must include Tailwind. Change both `npm ci --omit=dev` lines to `npm ci` so the Tailwind devDependency is available at build time.

- [ ] **Step 7: Build the CSS and verify output**

Run:
```bash
npm run build:css && test -s public/css/app.css && echo OK
```
Expected: prints `OK` (file exists and is non-empty).

- [ ] **Step 8: Verify backend tests still pass**

Run: `npm test`
Expected: all existing tests pass (no frontend changes yet).

- [ ] **Step 9: Commit**

```bash
git add tailwind.config.js public/css/tailwind.src.css package.json package-lock.json .gitignore Dockerfile
git commit -m "build: add Tailwind CLI pipeline and Serene Ledger design tokens"
```

---

## Task 2: Shared render helpers (`public/js/ui.js`)

**Files:**
- Create: `public/js/ui.js`
- Test: `test/ui.test.js`

**Interfaces:**
- Consumes: `formatBRL` from `public/js/format.js`.
- Produces (all pure, return HTML strings unless noted):
  - `currency(cents)` → `<span class="font-mono">R$ …</span>`
  - `meterBar(spentCents, limitCents, status)` → `<div class="meter"><div class="meter-fill[ over]" style="width:N%"></div></div>` (width clamped 0–100; `over` class when `status === 'over'` or spent>limit)
  - `statusPill(status)` → `<span class="pill pill-ok|pill-over">…</span>` (`ok` → "OK", `over` → "Over")
  - `groupTag(groupName)` → `<span class="tag tag-…">name</span>` (maps Essenciais→sage, Estilo→gold, Fundos→slate, else neutral; matching is case-insensitive substring on `essenc`, `estilo`, `fundo`)

- [ ] **Step 1: Write the failing test**

Create `test/ui.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

test('ui helpers', async () => {
  const ui = await import('../public/js/ui.js');

  // currency
  assert.match(ui.currency(85000), /R\$ 850,00/);
  assert.match(ui.currency(85000), /font-mono/);

  // meterBar: under limit → sage (no 'over'), width proportional
  const under = ui.meterBar(50000, 100000, 'ok');
  assert.match(under, /class="meter"/);
  assert.doesNotMatch(under, /over/);
  assert.match(under, /width:50%/);

  // meterBar: over limit → 'over' class, width clamped to 100
  const over = ui.meterBar(120000, 100000, 'over');
  assert.match(over, /meter-fill over/);
  assert.match(over, /width:100%/);

  // meterBar: zero limit → 0% width, no crash
  assert.match(ui.meterBar(0, 0, 'ok'), /width:0%/);

  // statusPill
  assert.match(ui.statusPill('ok'), /pill-ok/);
  assert.match(ui.statusPill('over'), /pill-over/);

  // groupTag
  assert.match(ui.groupTag('Essenciais / semi-fixos'), /tag-sage/);
  assert.match(ui.groupTag('Estilo de vida'), /tag-gold/);
  assert.match(ui.groupTag('Fundos'), /tag-slate/);
  assert.match(ui.groupTag('Folga'), /tag-neutral/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ui.test.js`
Expected: FAIL — cannot find module `../public/js/ui.js`.

- [ ] **Step 3: Write `public/js/ui.js`**

```js
import { formatBRL } from './format.js';

export function currency(cents) {
  return `<span class="font-mono">${formatBRL(cents)}</span>`;
}

export function meterBar(spentCents, limitCents, status) {
  const pct = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  const over = status === 'over' || (limitCents > 0 && spentCents > limitCents);
  return `<div class="meter"><div class="meter-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>`;
}

export function statusPill(status) {
  return status === 'over'
    ? `<span class="pill pill-over">Over</span>`
    : `<span class="pill pill-ok">OK</span>`;
}

export function groupTag(groupName) {
  const n = (groupName || '').toLowerCase();
  let cls = 'tag-neutral';
  if (n.includes('essenc')) cls = 'tag-sage';
  else if (n.includes('estilo')) cls = 'tag-gold';
  else if (n.includes('fundo')) cls = 'tag-slate';
  return `<span class="tag ${cls}">${groupName}</span>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ui.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui.js test/ui.test.js
git commit -m "feat: shared Serene Ledger render helpers (ui.js)"
```

---

## Task 3: Responsive chrome (`public/js/chrome.js`)

**Files:**
- Create: `public/js/chrome.js`
- Test: `test/chrome.test.js`

**Interfaces:**
- Produces:
  - `NAV_ITEMS` → array of `{ href, label, route }` for the 5 pages in order: Dashboard `/`, Transactions `/transactions.html`, Settings `/settings.html`, BI `/bi.html`, Simulate `/simulate.html`.
  - `renderNav(active)` → HTML string: a desktop top bar (`<header>` hidden below `md`) with the "Gastando" wordmark + links + a `<div id="nav-actions">` slot, and a `.bottom-nav` for mobile. The link whose `route === active` gets `class="active"` in both bars.
  - `mountChrome(active)` (DOM) → injects `renderNav(active)` into `#nav`; no-op if `#nav` missing.

- [ ] **Step 1: Write the failing test**

Create `test/chrome.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

test('renderNav', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  assert.equal(NAV_ITEMS.length, 5);

  const html = renderNav('/transactions.html');
  // all five labels present
  for (const item of NAV_ITEMS) assert.ok(html.includes(item.label), `missing ${item.label}`);
  // wordmark present
  assert.match(html, /Gastando/);
  // both a desktop header and a mobile bottom-nav exist
  assert.match(html, /<header/);
  assert.match(html, /bottom-nav/);
  // active route marked
  assert.match(html, /href="\/transactions.html"[^>]*class="[^"]*active/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chrome.test.js`
Expected: FAIL — cannot find module `../public/js/chrome.js`.

- [ ] **Step 3: Write `public/js/chrome.js`**

```js
export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', route: '/' },
  { href: '/transactions.html', label: 'Transactions', route: '/transactions.html' },
  { href: '/settings.html', label: 'Settings', route: '/settings.html' },
  { href: '/bi.html', label: 'BI', route: '/bi.html' },
  { href: '/simulate.html', label: 'Simulate', route: '/simulate.html' },
];

export function renderNav(active) {
  const topLinks = NAV_ITEMS.map(i =>
    `<a href="${i.href}" class="px-1 ${i.route === active ? 'text-sage active font-semibold' : 'text-ink-mut'}">${i.label}</a>`
  ).join('');
  const bottomLinks = NAV_ITEMS.map(i =>
    `<a href="${i.href}" class="${i.route === active ? 'active' : ''}">${i.label}</a>`
  ).join('');
  return `
    <header class="hidden md:flex items-center gap-6 max-w-5xl mx-auto px-6 py-5">
      <a href="/" class="font-display text-2xl text-ink">Gastando</a>
      <nav class="flex items-center gap-5 text-sm">${topLinks}</nav>
      <div id="nav-actions" class="ml-auto"></div>
    </header>
    <nav class="bottom-nav">${bottomLinks}</nav>`;
}

export function mountChrome(active) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(active);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/chrome.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/chrome.js test/chrome.test.js
git commit -m "feat: responsive nav chrome (chrome.js)"
```

---

## Task 4: Dashboard page

**Files:**
- Modify: `public/index.html`, `public/js/dashboard.js`
- Test: `test/dashboardRender.test.js`

**Interfaces:**
- Consumes: `ui.js` (`currency`, `meterBar`, `groupTag`, `statusPill`), `chrome.js` (`mountChrome`), `formatBRL`, `currentMonth`.
- Dashboard API response (unchanged): `{ month, categories:[{category_id,name,examples,group_id,group_name,group_color,limit_cents,spent_cents,remaining_cents,status}], groups:[{group_id,name,color,limit_cents,spent_cents}], totals:{spent_cents,teto_cents,savings_goal_cents,projected_savings_cents,vs_goal_cents} }`.
- Produces: `renderHero(totals)` → string; `renderGroups(data)` → string.

- [ ] **Step 1: Write the failing test**

Create `test/dashboardRender.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

const data = {
  categories: [
    { category_id: 1, name: 'Supermercado', examples: 'Pão de Açúcar, Assaí', group_id: 1,
      group_name: 'Essenciais / semi-fixos', limit_cents: 85000, spent_cents: 82100, status: 'ok' },
    { category_id: 2, name: 'Transporte', examples: 'Uber, Metrô', group_id: 1,
      group_name: 'Essenciais / semi-fixos', limit_cents: 52000, spent_cents: 53800, status: 'over' },
  ],
  groups: [{ group_id: 1, name: 'Essenciais / semi-fixos', limit_cents: 137000, spent_cents: 135900 }],
  totals: { spent_cents: 135900, teto_cents: 814000, savings_goal_cents: 244000,
    projected_savings_cents: 361000, vs_goal_cents: 117000 },
};

test('renderHero shows projected savings and ok state', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(data.totals);
  assert.match(html, /Projected savings/);
  assert.match(html, /R\$ 3\.610,00/);
  assert.match(html, /pill-ok/); // projected >= goal
});

test('renderGroups shows examples, group tag, and over meter', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const html = renderGroups(data);
  assert.match(html, /Supermercado/);
  assert.match(html, /Pão de Açúcar/);     // examples line
  assert.match(html, /tag-sage/);          // group chip
  assert.match(html, /meter-fill over/);   // Transporte over limit
  assert.match(html, /Essenciais/);        // group header
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dashboardRender.test.js`
Expected: FAIL — `renderHero`/`renderGroups` not exported.

- [ ] **Step 3: Rewrite `public/js/dashboard.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';
import { currency, meterBar, groupTag, statusPill } from './ui.js';

export function renderHero(t) {
  const ok = t.projected_savings_cents >= t.savings_goal_cents;
  const pct = t.teto_cents > 0 ? Math.min(100, Math.round((t.spent_cents / t.teto_cents) * 100)) : 0;
  const vs = t.vs_goal_cents >= 0
    ? `+${formatBRL(t.vs_goal_cents)} above goal`
    : `${formatBRL(t.vs_goal_cents)} vs goal`;
  return `
    <section class="paper-card grid md:grid-cols-2 gap-6 items-center">
      <div>
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-mut">Projected savings</div>
        <div class="font-display text-5xl ${ok ? 'text-sage' : 'text-clay'} leading-none mt-1">${formatBRL(t.projected_savings_cents)}</div>
        <div class="mt-3 flex items-center gap-3 text-sm text-ink-mut">
          <span>Ceiling ${formatBRL(t.teto_cents)}</span>
          <span class="pill ${ok ? 'pill-ok' : 'pill-over'}">${vs}</span>
        </div>
      </div>
      <div class="md:border-l md:border-line md:pl-6">
        <div class="flex justify-between text-sm text-ink-mut mb-2"><span>Spent</span><b class="text-ink">${formatBRL(t.spent_cents)}</b></div>
        ${meterBar(t.spent_cents, t.teto_cents, t.spent_cents > t.teto_cents ? 'over' : 'ok')}
        <div class="mt-2 text-xs text-ink-mut">of ceiling ${formatBRL(t.teto_cents)}</div>
      </div>
    </section>`;
}

export function renderGroups(d) {
  const byGroup = new Map(d.groups.map(g => [g.group_id, { ...g, cats: [] }]));
  for (const c of d.categories) byGroup.get(c.group_id).cats.push(c);
  return [...byGroup.values()].map(g => `
    <section class="mt-8">
      <div class="flex items-center gap-3 mb-3">
        <h2 class="text-xs font-bold uppercase tracking-wider text-ink-mut">${g.name}</h2>
        <span class="flex-1 h-px bg-line"></span>
        <span class="font-mono text-sm text-ink-mut">${formatBRL(g.spent_cents)} / ${formatBRL(g.limit_cents)}</span>
      </div>
      <div class="space-y-3">
        ${g.cats.map(c => `
          <div class="paper-card">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-semibold flex items-center gap-2">${c.name} ${groupTag(g.name)}</div>
                ${c.examples ? `<div class="text-xs text-ink-mut mt-0.5">${c.examples}</div>` : ''}
              </div>
              <div class="text-right">
                <div class="font-display text-xl">${formatBRL(c.limit_cents)}</div>
                <div class="font-mono text-xs text-ink-mut mt-0.5">spent ${formatBRL(c.spent_cents)}</div>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <div class="flex-1">${meterBar(c.spent_cents, c.limit_cents, c.status)}</div>
              ${statusPill(c.status)}
            </div>
          </div>`).join('')}
      </div>
    </section>`).join('');
}

async function load(month) {
  try {
    const d = await api.get(`/api/dashboard?month=${month}`);
    document.getElementById('hero').innerHTML = renderHero(d.totals);
    document.getElementById('groups').innerHTML = renderGroups(d);
  } catch (e) { showError(e.message); }
}

// Bootstrap (browser only)
if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => load(monthEl.value));
  load(monthEl.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dashboardRender.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `public/index.html` shell**

A single `#month` input lives at the top of the content (visible and usable on both desktop and mobile); the desktop nav bar keeps its `#nav-actions` slot empty for this page.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2">
    <div class="flex justify-end mb-4">
      <input type="month" id="month" class="rounded border border-line bg-card px-3 py-2" />
    </div>
    <div id="hero"></div>
    <div id="groups"></div>
  </main>
  <script type="module" src="/js/dashboard.js"></script>
</body>
</html>
```
The `dashboard.js` bootstrap from Step 3 already references only `#month` — no further wiring needed.

- [ ] **Step 6: Build CSS and verify the page renders in the app**

Run:
```bash
npm run build:css
DB_PATH=:memory: node src/server.js &
sleep 1; curl -s localhost:3000/ | grep -q 'id="hero"' && echo PAGE_OK; kill %1
```
Expected: prints `PAGE_OK` (shell served). Then load `http://localhost:3000/` against a seeded DB (`docker compose up` or local `data/gastando.db`) and visually confirm the hero + grouped category cards with chips, examples, and meters render, with over-limit categories in terracotta.

- [ ] **Step 7: Run full backend + render tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/js/dashboard.js test/dashboardRender.test.js
git commit -m "feat: Serene Ledger dashboard page"
```

---

## Task 5: Transactions page

**Files:**
- Modify: `public/transactions.html`, `public/js/transactions.js`
- Test: `test/transactionsRender.test.js`

**Interfaces:**
- Consumes: `ui.js` (`currency`, `groupTag`), `chrome.js` (`mountChrome`), `getPage`, `formatBRL`, `centsToReais`, `reaisToCents`, `currentMonth`.
- Transactions row shape (unchanged): `{ id, date, description, amount_cents, installment_no, installment_total, installment_group_id, category_id, card_id }`.
- Produces: `renderRows(rows)` → table-body string used on desktop and as cards on mobile via CSS; event wiring stays in bootstrap.

- [ ] **Step 1: Write the failing test**

Create `test/transactionsRender.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  { id: 10, date: '2026-06-12', description: 'iFood almoço', amount_cents: 4890,
    installment_no: null, installment_total: null, installment_group_id: null },
  { id: 11, date: '2026-06-08', description: 'Avianca', amount_cents: 59900,
    installment_no: 3, installment_total: 6, installment_group_id: 7 },
];

test('renderRows formats amount and installment chip', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows(rows);
  assert.match(html, /iFood almoço/);
  assert.match(html, /R\$ 48,90/);
  assert.match(html, /R\$ 599,00/);
  assert.match(html, /3\/6/);                 // installment chip
  assert.match(html, /data-edit="10"/);       // edit affordance
  assert.match(html, /data-del="11"/);        // delete affordance
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transactionsRender.test.js`
Expected: FAIL — `renderRows` not exported.

- [ ] **Step 3: Rewrite `public/js/transactions.js`**

```js
import { api, getPage, showError } from './api.js';
import { formatBRL, reaisToCents, centsToReais, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

const $ = id => document.getElementById(id);
let editingId = null;
let page = 1;

export function renderRows(rows) {
  return rows.map(r => `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${r.date}</td>
      <td class="py-3">${r.description}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Edit</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Delete</button>
      </td>
    </tr>`).join('');
}

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadList() {
  try {
    const perPage = Number($('perPage').value);
    const offset = (page - 1) * perPage;
    const { items: rows, total } = await getPage(
      `/api/transactions?month=${$('month').value}&limit=${perPage}&offset=${offset}`);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page > totalPages) { page = totalPages; return loadList(); }
    updatePager(total, perPage, totalPages);
    $('list').innerHTML = renderRows(rows);
    $('list').querySelectorAll('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => startEdit(rows.find(r => r.id === Number(b.dataset.edit)))));
    $('list').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => onDelete(Number(b.dataset.del), Number(b.dataset.group) || null)));
  } catch (e) { showError(e.message); }
}

function updatePager(total, perPage, totalPages) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  $('pageInfo').textContent = `${from}–${to} of ${total} · page ${page}/${totalPages}`;
  $('prevPage').disabled = page <= 1;
  $('nextPage').disabled = page >= totalPages;
}

function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  $('isInstallment').checked = false;
  $('installmentFields').style.display = 'none';
  $('isInstallment').disabled = true;
  $('amount').disabled = false;
  $('date').value = r.date;
  $('category').value = String(r.category_id);
  $('card').value = String(r.card_id);
  $('amount').value = centsToReais(r.amount_cents);
  $('description').value = r.description;
  $('submitBtn').textContent = 'Save';
  $('cancelEdit').style.display = 'inline';
  $('formCard').scrollIntoView({ block: 'center' });
}

function resetForm() {
  editingId = null;
  $('form').reset();
  $('installmentFields').style.display = 'none';
  $('isInstallment').disabled = false;
  $('amount').disabled = false;
  $('submitBtn').textContent = 'Add';
  $('cancelEdit').style.display = 'none';
}

async function onDelete(id, groupId) {
  try {
    if (groupId) {
      if (!confirm('Delete the entire installment group (all parcelas)?')) return;
      await api.del(`/api/installment-groups/${groupId}`);
    } else {
      await api.del(`/api/transactions/${id}`);
    }
    if (editingId === id) resetForm();
    loadList();
  } catch (e) { showError(e.message); }
}

async function onSubmit(e) {
  e.preventDefault();
  try {
    const base = { category_id: Number($('category').value), card_id: Number($('card').value),
      description: $('description').value };
    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
    } else if ($('isInstallment').checked) {
      await api.post('/api/transactions', { ...base,
        installment_total_cents: reaisToCents($('amount').value),
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value });
    } else {
      await api.post('/api/transactions', { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
    }
    resetForm();
    loadList();
  } catch (err) { showError(err.message); }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/transactions.html');
  $('month').value = currentMonth();
  $('isInstallment').addEventListener('change', e => {
    $('installmentFields').style.display = e.target.checked ? 'flex' : 'none';
    $('amount').disabled = e.target.checked;
  });
  $('month').addEventListener('change', () => { page = 1; loadList(); });
  $('perPage').addEventListener('change', () => { page = 1; loadList(); });
  $('prevPage').addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
  $('nextPage').addEventListener('click', () => { page++; loadList(); });
  $('form').addEventListener('submit', onSubmit);
  $('cancelEdit').addEventListener('click', resetForm);
  const fab = document.getElementById('fab');
  if (fab) fab.addEventListener('click', () => $('formCard').scrollIntoView({ block: 'start' }));
  loadSelectors().then(loadList);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transactionsRender.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `public/transactions.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Transactions</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2">
    <div class="flex items-center gap-3 mb-4">
      <h1 class="font-display text-2xl">Transactions</h1>
      <input type="month" id="month" class="ml-auto rounded border border-line bg-card px-3 py-2" />
    </div>
    <div id="formCard">
      <form id="form" class="paper-card grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <label class="field"><span>Date</span><input type="date" id="date" required /></label>
        <label class="field"><span>Category</span><select id="category"></select></label>
        <label class="field"><span>Card</span><select id="card"></select></label>
        <label class="field"><span>Amount (R$)</span><input type="number" id="amount" step="0.01" min="0" /></label>
        <label class="field"><span>Description</span><input type="text" id="description" /></label>
        <label class="flex items-center gap-2 text-sm self-end"><input type="checkbox" id="isInstallment" /> Installment</label>
        <span id="installmentFields" class="contents" style="display:none">
          <label class="field"><span># parcelas</span><input type="number" id="count" min="1" /></label>
          <label class="field"><span>First month</span><input type="month" id="firstMonth" /></label>
        </span>
        <div class="flex gap-2 self-end">
          <button type="submit" id="submitBtn" class="btn-primary">Add</button>
          <button type="button" id="cancelEdit" class="btn-ghost" style="display:none">Cancel</button>
        </div>
      </form>
    </div>
    <div class="paper-card overflow-x-auto">
      <table class="w-full text-left"><tbody id="list"></tbody></table>
      <div id="pager" class="flex items-center gap-3 mt-4 text-sm text-ink-mut">
        <button type="button" id="prevPage" class="btn-ghost py-1.5">‹ Prev</button>
        <span id="pageInfo"></span>
        <button type="button" id="nextPage" class="btn-ghost py-1.5">Next ›</button>
        <label class="ml-auto">Per page
          <select id="perPage" class="rounded border border-line bg-card px-2 py-1">
            <option value="10">10</option><option value="20" selected>20</option>
            <option value="50">50</option><option value="100">100</option>
          </select>
        </label>
      </div>
    </div>
  </main>
  <button id="fab" class="fab" aria-label="Add transaction">+</button>
  <script type="module" src="/js/transactions.js"></script>
</body>
</html>
```
The `<form id="form">` is wrapped in `<div id="formCard">`; `startEdit` and the FAB scroll to `#formCard`.

- [ ] **Step 6: Verify the page renders in the app**

Run:
```bash
npm run build:css
DB_PATH=:memory: node src/server.js &
sleep 1; curl -s localhost:3000/transactions.html | grep -q 'id="list"' && echo PAGE_OK; kill %1
```
Expected: prints `PAGE_OK`. Then load against a seeded DB and confirm: form adds a transaction, installment toggle reveals the extra fields, the table shows chips + mono amounts, edit/delete work, pager works, and the FAB scrolls to the form on mobile width.

- [ ] **Step 7: Run full tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/transactions.html public/js/transactions.js test/transactionsRender.test.js
git commit -m "feat: Serene Ledger transactions page"
```

---

## Task 6: Settings page

**Files:**
- Modify: `public/settings.html`, `public/js/settings.js`
- Test: `test/settingsRender.test.js`

**Interfaces:**
- Consumes: `chrome.js` (`mountChrome`), `formatBRL`, `reaisToCents`, `currentMonth`.
- API (unchanged): `/api/settings` → `{ monthly_income, fixed_costs, savings_goal }` (cents); `/api/limits?month` → `[{ category_id, limit_cents }]`; `/api/categories`; `/api/cards`.
- Produces: `renderLimitRows(cats, byCat)` → string (table rows with editable inputs and sum footer data); `ceilingText(income, fixed, goal)` → `"Healthy ceiling R$ …"`.

- [ ] **Step 1: Write the failing test**

Create `test/settingsRender.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

test('ceilingText derives ceiling', async () => {
  const { ceilingText } = await import('../public/js/settings.js');
  assert.match(ceilingText(1435000, 377000, 244000), /R\$ 8\.140,00/);
});

test('renderLimitRows builds editable rows with values', async () => {
  const { renderLimitRows } = await import('../public/js/settings.js');
  const cats = [{ id: 1, name: 'Supermercado', active: 1 }, { id: 2, name: 'Transporte', active: 1 }];
  const byCat = new Map([[1, 85000], [2, 52000]]);
  const html = renderLimitRows(cats, byCat);
  assert.match(html, /Supermercado/);
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);   // 85000 cents → 850 reais
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/settingsRender.test.js`
Expected: FAIL — exports missing.

- [ ] **Step 3: Rewrite `public/js/settings.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

const $ = id => document.getElementById(id);

export function ceilingText(income, fixed, goal) {
  return `Healthy ceiling ${formatBRL(income - fixed - goal)}`;
}

export function renderLimitRows(cats, byCat) {
  return cats.filter(c => c.active).map(c => `
    <tr class="border-b border-line">
      <td class="py-2">${c.name}</td>
      <td class="py-2 text-right">
        <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
          class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
      </td>
    </tr>`).join('');
}

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
    updateCeiling();
  } catch (e) { showError(e.message); }
}

function updateCeiling() {
  $('ceiling').textContent = ceilingText(
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
}

async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'), api.get(`/api/limits?month=${$('month').value}`)]);
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderLimitRows(cats, byCat);
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
    $('cards').innerHTML = cards.filter(c => c.active).map(c => `
      <div class="flex items-center justify-between border-b border-line py-2">
        <span>${c.name}</span>
        <button data-del="${c.id}" class="text-clay text-sm">Remove</button>
      </div>`).join('');
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('limits')) {
  mountChrome('/settings.html');
  $('month').value = currentMonth();
  $('monthLabel').textContent = $('month').value;
  $('month').addEventListener('change', () => { $('monthLabel').textContent = $('month').value; loadLimits(); });
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateCeiling));
  $('saveSettings').addEventListener('click', async () => {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      showError('Saved');
    } catch (e) { showError(e.message); }
  });
  $('addCard').addEventListener('click', async () => {
    try { await api.post('/api/cards', { name: $('newCard').value }); $('newCard').value = ''; loadCards(); }
    catch (e) { showError(e.message); }
  });
  loadSettings(); loadLimits(); loadCards();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/settingsRender.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `public/settings.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Settings</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2 space-y-6">
    <div class="flex items-center gap-3">
      <h1 class="font-display text-2xl">Settings</h1>
      <input type="month" id="month" class="ml-auto rounded border border-line bg-card px-3 py-2" />
    </div>
    <section class="paper-card">
      <h2 class="font-display text-xl mb-4">Savings model</h2>
      <div class="grid sm:grid-cols-3 gap-3">
        <label class="field"><span>Monthly income (R$)</span><input type="number" id="monthly_income" step="0.01" /></label>
        <label class="field"><span>Fixed costs (R$)</span><input type="number" id="fixed_costs" step="0.01" /></label>
        <label class="field"><span>Savings goal (R$)</span><input type="number" id="savings_goal" step="0.01" /></label>
      </div>
      <div class="flex items-center gap-3 mt-4">
        <span id="ceiling" class="pill pill-ok"></span>
        <button id="saveSettings" class="btn-primary ml-auto">Save</button>
      </div>
    </section>
    <section class="paper-card">
      <h2 class="font-display text-xl mb-4">Limits for <span id="monthLabel" class="font-mono text-base"></span></h2>
      <table class="w-full text-left"><tbody id="limits"></tbody></table>
    </section>
    <section class="paper-card">
      <h2 class="font-display text-xl mb-4">Cards</h2>
      <div id="cards"></div>
      <div class="flex gap-2 mt-4">
        <input id="newCard" placeholder="New card name" class="flex-1 rounded border border-line bg-card px-3 py-2" />
        <button id="addCard" class="btn-primary">Add</button>
      </div>
    </section>
  </main>
  <script type="module" src="/js/settings.js"></script>
</body>
</html>
```

- [ ] **Step 6: Verify the page renders in the app**

Run:
```bash
npm run build:css
DB_PATH=:memory: node src/server.js &
sleep 1; curl -s localhost:3000/settings.html | grep -q 'id="limits"' && echo PAGE_OK; kill %1
```
Expected: prints `PAGE_OK`. Then load against a seeded DB: confirm savings inputs load and the ceiling pill updates live, limit edits persist, and cards add/remove.

- [ ] **Step 7: Run full tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/settings.html public/js/settings.js test/settingsRender.test.js
git commit -m "feat: Serene Ledger settings page"
```

---

## Task 7: BI page

**Files:**
- Modify: `public/bi.html`, `public/js/bi.js`
- Test: `test/biChart.test.js`

**Interfaces:**
- Consumes: `chrome.js` (`mountChrome`), `currentMonth`, Chart.js (global `Chart` from CDN, browser only).
- API (unchanged): `/api/bi/trends|by-card|by-group|budget-vs-actual|installment-forecast?from&to` → `{ months:[labels], series:[{ name, spent_cents:[] }] }`.
- Produces: `PALETTE` (array of hex strings from the design tokens); `datasetsFor(series, onlyNonZero)` → Chart.js dataset array with palette colors applied (pure, testable).

- [ ] **Step 1: Write the failing test**

Create `test/biChart.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

test('datasetsFor maps series to palette datasets and filters zeros', async () => {
  const { datasetsFor, PALETTE } = await import('../public/js/bi.js');
  assert.ok(PALETTE.length >= 4);
  const series = [
    { name: 'Supermercado', spent_cents: [85000, 82100] },
    { name: 'Flat', spent_cents: [0, 0] },
  ];
  const all = datasetsFor(series, false);
  assert.equal(all.length, 2);
  assert.equal(all[0].label, 'Supermercado');
  assert.deepEqual(all[0].data, [850, 821]);          // cents → reais
  assert.equal(all[0].borderColor, PALETTE[0]);

  const nz = datasetsFor(series, true);
  assert.equal(nz.length, 1);                          // flat-zero dropped
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/biChart.test.js`
Expected: FAIL — exports missing.

- [ ] **Step 3: Rewrite `public/js/bi.js`**

```js
import { api, showError } from './api.js';
import { currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

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
function lineChart(canvasId, labels, series, onlyNonZero) {
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

async function run() {
  try {
    const qs = `from=${document.getElementById('from').value}&to=${document.getElementById('to').value}`;
    const [trends, byCard, byGroup, bva, forecast] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`), api.get(`/api/bi/by-card?${qs}`), api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`), api.get(`/api/bi/installment-forecast?${qs}`),
    ]);
    lineChart('chart', trends.months, trends.series, true);
    lineChart('byCard', byCard.months, byCard.series, false);
    lineChart('byGroup', byGroup.months, byGroup.series, false);
    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('chart')) {
  mountChrome('/bi.html');
  document.getElementById('to').value = currentMonth();
  document.getElementById('from').value = currentMonth().slice(0, 5) + '01';
  document.getElementById('run').addEventListener('click', run);
  run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/biChart.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `public/bi.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — BI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2 space-y-6">
    <h1 class="font-display text-2xl">BI</h1>
    <div class="paper-card flex flex-wrap items-end gap-3">
      <label class="field"><span>From</span><input type="month" id="from" /></label>
      <label class="field"><span>To</span><input type="month" id="to" /></label>
      <button id="run" class="btn-primary">Update</button>
    </div>
    <div class="grid lg:grid-cols-2 gap-6">
      <div class="paper-card lg:col-span-2"><h2 class="font-display text-lg mb-2">Spending by category</h2><canvas id="chart" height="120"></canvas></div>
      <div class="paper-card"><h2 class="font-display text-lg mb-2">Spending by card</h2><canvas id="byCard" height="140"></canvas></div>
      <div class="paper-card"><h2 class="font-display text-lg mb-2">Spending by group</h2><canvas id="byGroup" height="140"></canvas></div>
      <div class="paper-card"><h2 class="font-display text-lg mb-2">Budget vs actual</h2><canvas id="budgetVsActual" height="140"></canvas></div>
      <div class="paper-card"><h2 class="font-display text-lg mb-2">Committed installment forecast</h2><canvas id="installmentForecast" height="140"></canvas></div>
    </div>
  </main>
  <script type="module" src="/js/bi.js"></script>
</body>
</html>
```

- [ ] **Step 6: Verify the page renders in the app**

Run:
```bash
npm run build:css
DB_PATH=:memory: node src/server.js &
sleep 1; curl -s localhost:3000/bi.html | grep -q 'id="chart"' && echo PAGE_OK; kill %1
```
Expected: prints `PAGE_OK`. Then load against a seeded DB with some transactions and confirm all five charts render in the muted palette with readable legends/axes.

- [ ] **Step 7: Run full tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/bi.html public/js/bi.js test/biChart.test.js
git commit -m "feat: Serene Ledger BI page with palette charts"
```

---

## Task 8: Simulate page

**Files:**
- Modify: `public/simulate.html`, `public/js/simulate.js`
- Test: `test/simulateRender.test.js`

**Interfaces:**
- Consumes: `ui.js` (`meterBar`, `statusPill`), `chrome.js` (`mountChrome`), `formatBRL`, `reaisToCents`, `currentMonth`.
- API (unchanged): `GET /api/simulate?category_id&total_cents&count&first_month` → `{ months:[{ month, installment_cents, limit_cents, remaining_before_cents, remaining_after_cents, status }] }`.
- Produces: `renderResult(d)` → string (per-month rows/cards with meter, pills, and an "over in N of M months" summary).

- [ ] **Step 1: Write the failing test**

Create `test/simulateRender.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');

const d = { months: [
  { month: '2026-07', installment_cents: 10000, limit_cents: 100000,
    remaining_before_cents: 15000, remaining_after_cents: 5000, status: 'ok' },
  { month: '2026-08', installment_cents: 10000, limit_cents: 100000,
    remaining_before_cents: 5000, remaining_after_cents: -5000, status: 'over' },
] };

test('renderResult summarizes over months and renders meters', async () => {
  const { renderResult } = await import('../public/js/simulate.js');
  const html = renderResult(d);
  assert.match(html, /2026-07/);
  assert.match(html, /1 of 2 months/);   // one over
  assert.match(html, /pill-over/);
  assert.match(html, /meter-fill over/);  // August over
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/simulateRender.test.js`
Expected: FAIL — `renderResult` not exported.

- [ ] **Step 3: Rewrite `public/js/simulate.js`**

```js
import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';
import { meterBar, statusPill } from './ui.js';

const $ = id => document.getElementById(id);

export function renderResult(d) {
  const overCount = d.months.filter(m => m.status === 'over').length;
  const summary = `<div class="pill ${overCount ? 'pill-over' : 'pill-ok'} mb-4">Over limit in ${overCount} of ${d.months.length} months</div>`;
  const cards = d.months.map(m => {
    const spent = m.limit_cents - m.remaining_after_cents; // projected new total
    return `
      <div class="paper-card">
        <div class="flex items-center justify-between">
          <span class="font-display text-lg">${m.month}</span>
          ${statusPill(m.status)}
        </div>
        <div class="font-mono text-xs text-ink-mut mt-1">
          Limit ${formatBRL(m.limit_cents)} · +Parcela ${formatBRL(m.installment_cents)} · New total ${formatBRL(spent)}
        </div>
        <div class="mt-3">${meterBar(spent, m.limit_cents, m.status)}</div>
      </div>`;
  }).join('');
  return `${summary}<div class="space-y-3">${cards}</div>`;
}

async function run() {
  try {
    const total_cents = reaisToCents($('amount').value);
    if (!Number.isInteger(total_cents) || total_cents <= 0) { showError('Enter a total amount'); return; }
    const params = new URLSearchParams({
      category_id: $('category').value, total_cents,
      count: Number($('count').value) || 1, first_month: $('firstMonth').value,
    });
    const d = await api.get('/api/simulate?' + params.toString());
    $('result').innerHTML = renderResult(d);
  } catch (e) { showError(e.message); }
}

async function loadCategories() {
  try {
    const cats = await api.get('/api/categories');
    $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('result')) {
  mountChrome('/simulate.html');
  $('firstMonth').value = currentMonth();
  $('run').addEventListener('click', run);
  loadCategories();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/simulateRender.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite `public/simulate.html` shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Simulate</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2 space-y-6">
    <section class="paper-card">
      <h1 class="font-display text-2xl mb-1">Simulate a purchase</h1>
      <p class="text-sm text-ink-mut mb-4">See how a purchase (or installment plan) would affect a category over the coming months. Nothing is saved.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label class="field"><span>Category</span><select id="category"></select></label>
        <label class="field"><span>Total (R$)</span><input type="number" id="amount" step="0.01" min="0" /></label>
        <label class="field"><span># parcelas</span><input type="number" id="count" min="1" value="1" /></label>
        <label class="field"><span>First month</span><input type="month" id="firstMonth" /></label>
      </div>
      <button id="run" class="btn-primary mt-4">Simulate</button>
    </section>
    <div id="result"></div>
  </main>
  <script type="module" src="/js/simulate.js"></script>
</body>
</html>
```

- [ ] **Step 6: Verify the page renders in the app**

Run:
```bash
npm run build:css
DB_PATH=:memory: node src/server.js &
sleep 1; curl -s localhost:3000/simulate.html | grep -q 'id="result"' && echo PAGE_OK; kill %1
```
Expected: prints `PAGE_OK`. Then load against a seeded DB: run a 6-parcela simulation and confirm the summary banner + month cards with meters and ok/over pills render.

- [ ] **Step 7: Run full tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add public/simulate.html public/js/simulate.js test/simulateRender.test.js
git commit -m "feat: Serene Ledger simulate page"
```

---

## Task 9: Docs update and full verification

**Files:**
- Modify: `docs/spec.md`

- [ ] **Step 1: Update `docs/spec.md` §3 and §7**

In §3 (Architecture), replace the line describing the frontend as "vanilla HTML/CSS/JS reusing the `card.html` design system; no build step" with: "vanilla HTML/JS rendering DOM, styled with Tailwind CSS compiled to a single static `public/css/app.css` via the Tailwind CLI (`npm run build:css`). Visual system: 'Serene Ledger' (warm-paper sage/gold/terracotta; Playfair Display + Inter + JetBrains Mono)." In §7 (Frontend), note that each page is one responsive HTML (desktop top-nav → mobile bottom tab bar + FAB) and that shared nav/render helpers live in `public/js/chrome.js` and `public/js/ui.js`. Add a pointer to the Stitch project `projects/12854342184843741473` as the visual source of truth.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (backend + the five render test files + ui/chrome tests).

- [ ] **Step 3: Verify coverage gate**

Run: `npm run coverage`
Expected: ≥80% across metrics (logic untouched; frontend render helpers add covered lines).

- [ ] **Step 4: Verify a clean CSS build**

Run: `npm run build:css && test -s public/css/app.css && echo BUILD_OK`
Expected: prints `BUILD_OK`.

- [ ] **Step 5: Smoke-test all five pages served**

Run:
```bash
DB_PATH=:memory: node src/server.js &
sleep 1
for p in / transactions.html settings.html bi.html simulate.html; do
  curl -s "localhost:3000/$p" | grep -q 'id="nav"' && echo "$p OK" || echo "$p FAIL"
done
kill %1
```
Expected: all five print `OK`.

- [ ] **Step 6: Commit**

```bash
git add docs/spec.md
git commit -m "docs: update spec for Tailwind build and responsive Serene Ledger frontend"
```

---

## Self-Review Notes

- **Spec coverage:** Build pipeline (Task 1), tokens/components (Task 1), shared chrome + helpers (Tasks 2–3), all five pages desktop+mobile (Tasks 4–8), Chart.js restyle (Task 7), error handling preserved via existing `showError` (all page tasks), testing + coverage + build verification (Task 9), docs update (Task 9). No backend changes — matches the spec's verified finding.
- **Mobile:** bottom tab bar (`.bottom-nav`, hidden `md+`) and FAB (`.fab`, Dashboard/Transactions) provide the mobile treatment within one responsive page per route.
- **Type consistency:** API field names verified against the current services/routes (`installment_cents`, `remaining_after_cents`, `series[].spent_cents`, `group_name`, etc.). Pure render functions are exported per page and guarded by a `typeof document` bootstrap check so they import cleanly in Node tests.
