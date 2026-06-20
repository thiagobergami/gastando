# Limits ↔ Savings Ceiling Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the category limits "talk to" the savings model — a live readout shows how much of the Healthy ceiling (`income − fixed − goal`) the limits consume, turning red when they exceed it, on both the Settings page and the setup wizard.

**Architecture:** Add three pure, side-effect-free helpers to `public/js/budget.js` (the existing shared budget-model module). `settings.js` and `setup.js` call them on every keystroke to repaint the existing `#ceiling` pill. Presentation-only and client-side: no API, schema, migration, or CSS changes.

**Tech Stack:** Vanilla ES-module browser JS, `node:test` + `node:assert` for unit tests, Tailwind-compiled CSS (`pill-ok`/`pill-over` already exist).

## Global Constraints

- **Warn-only, never block.** No Save-gating, no input rejection. (Spec decision.)
- **Cap = the Healthy ceiling** = `income − fixed − goal`, not the savings-goal figure alone.
- **No schema / API / migration / CSS changes.** Reuse the existing `pill pill-ok` (sage) and `pill pill-over` (clay) classes from `public/css/app.css`.
- **Money is integer cents.** Convert UI values with `reaisToCents` (already rounds); format with `formatBRL`. No floats.
- **Copy strings, exact:**
  - Within/at ceiling: `Allocated <allocated> of <ceiling> · <remaining> left`
  - Over ceiling: `Allocated <allocated> of <ceiling> · <overage> over ceiling`
- **Match existing module style** in `budget.js` / `settings.js` / `setup.js` (ESM `export function`, 2-space indent, `$ = id => document.getElementById(id)`).
- **`over` is strictly `remaining < 0`** — exactly-at-ceiling reads as "0,00 left" (green), not over.

> **Note (deviation from spec):** the spec mentioned re-exporting the new helpers through `settings.js` "for tests." This plan instead unit-tests them directly against their home module `budget.js` (cleaner, DRY) and adds no extra re-export. Same intent — helpers fully tested.

---

### Task 1: Pure allocation helpers in `budget.js`

**Files:**
- Create: `test/budget.test.js`
- Modify: `public/js/budget.js` (append after `renderLimitRows`)

**Interfaces:**
- Consumes: `formatBRL(cents) → string` (already imported at top of `budget.js`).
- Produces (all in `public/js/budget.js`):
  - `allocationStatus(limitCentsList: number[], income: number, fixed: number, goal: number) → { ceiling: number, allocated: number, remaining: number, over: boolean }`
  - `allocationText(status) → string`
  - `allocationPillClass(status) → string` (`'pill pill-ok'` | `'pill pill-over'`)

- [ ] **Step 1: Write the failing tests**

Create `test/budget.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('allocationStatus reports money left when limits fit under the ceiling', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([85000, 52000], 1435000, 377000, 244000);
  assert.equal(s.ceiling, 814000);
  assert.equal(s.allocated, 137000);
  assert.equal(s.remaining, 677000);
  assert.equal(s.over, false);
});

test('allocationStatus flags over-allocation past the ceiling', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([900000], 1435000, 377000, 244000);
  assert.equal(s.allocated, 900000);
  assert.equal(s.remaining, -86000);
  assert.equal(s.over, true);
});

test('allocationStatus treats exactly-at-ceiling as not over', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([814000], 1435000, 377000, 244000);
  assert.equal(s.remaining, 0);
  assert.equal(s.over, false);
});

test('allocationStatus on a fresh all-zero budget is all zeros', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  assert.deepEqual(allocationStatus([], 0, 0, 0),
    { ceiling: 0, allocated: 0, remaining: 0, over: false });
});

test('allocationText shows remaining when within the ceiling', async () => {
  const { allocationStatus, allocationText } = await import('../public/js/budget.js');
  const txt = allocationText(allocationStatus([137000], 1435000, 377000, 244000));
  assert.match(txt, /Allocated R\$ 1\.370,00 of R\$ 8\.140,00/);
  assert.match(txt, /R\$ 6\.770,00 left/);
});

test('allocationText shows the overage when past the ceiling', async () => {
  const { allocationStatus, allocationText } = await import('../public/js/budget.js');
  const txt = allocationText(allocationStatus([900000], 1435000, 377000, 244000));
  assert.match(txt, /R\$ 860,00 over ceiling/);
});

test('allocationPillClass flips between ok and over across the boundary', async () => {
  const { allocationStatus, allocationPillClass } = await import('../public/js/budget.js');
  const within = allocationStatus([100000], 1435000, 377000, 244000);
  const over = allocationStatus([900000], 1435000, 377000, 244000);
  assert.equal(allocationPillClass(within), 'pill pill-ok');
  assert.equal(allocationPillClass(over), 'pill pill-over');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/budget.test.js`
Expected: FAIL — `allocationStatus`/`allocationText`/`allocationPillClass` are `undefined` (not exported).

- [ ] **Step 3: Implement the helpers**

Append to `public/js/budget.js` (after the `renderLimitRows` function):

```js

// --- Allocation reconciliation: do the category limits fit under the ceiling? ---

export function allocationStatus(limitCentsList, income, fixed, goal) {
  const ceiling = income - fixed - goal;
  const allocated = limitCentsList.reduce((sum, n) => sum + (n || 0), 0);
  const remaining = ceiling - allocated;
  return { ceiling, allocated, remaining, over: remaining < 0 };
}

export function allocationText(status) {
  const head = `Allocated ${formatBRL(status.allocated)} of ${formatBRL(status.ceiling)}`;
  return status.over
    ? `${head} · ${formatBRL(-status.remaining)} over ceiling`
    : `${head} · ${formatBRL(status.remaining)} left`;
}

export function allocationPillClass(status) {
  return status.over ? 'pill pill-over' : 'pill pill-ok';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/budget.test.js`
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — all existing tests plus the 7 new ones. The existing `ceilingText derives ceiling` test still passes (`ceilingText` is untouched).

- [ ] **Step 6: Commit**

```bash
git add public/js/budget.js test/budget.test.js
git commit -m "feat: add allocation-vs-ceiling budget helpers" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire the live readout into the Settings page

**Files:**
- Modify: `public/js/settings.js` (import line 4; `updateCeiling` → `updateAllocation` at lines 21-26; `loadSettings` line 17; `loadLimits` lines 28-42; bootstrap listener line 64)

**Interfaces:**
- Consumes: `allocationStatus`, `allocationText`, `allocationPillClass` from `./budget.js` (Task 1); existing `reaisToCents`.
- Produces: live DOM behavior only (no new exports). The `#ceiling` span's `textContent` and `className` update on every income/fixed/goal **and** every category-limit keystroke.

- [ ] **Step 1: Import the new helpers**

In `public/js/settings.js`, replace the budget import (line 4). Keep `ceilingText` in the import — line 7 still re-exports it for the existing `ceilingText` test.

Old:
```js
import { ceilingText, renderLimitRows } from './budget.js';
```
New:
```js
import { ceilingText, renderLimitRows, allocationStatus, allocationText, allocationPillClass } from './budget.js';
```

- [ ] **Step 2: Replace `updateCeiling` with `updateAllocation` + `readLimitCents`**

Old (lines 21-26):
```js
function updateCeiling() {
  $('ceiling').textContent = ceilingText(
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
}
```
New:
```js
function readLimitCents() {
  return [...document.querySelectorAll('#limits input[data-cat]')]
    .map(inp => reaisToCents(inp.value || 0));
}

function updateAllocation() {
  const status = allocationStatus(
    readLimitCents(),
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
  const el = $('ceiling');
  el.textContent = allocationText(status);
  el.className = allocationPillClass(status);
}
```

- [ ] **Step 3: Repaint after settings load**

In `loadSettings` (line 17), change the trailing call:

Old:
```js
    updateCeiling();
```
New:
```js
    updateAllocation();
```

- [ ] **Step 4: Add live `input` listeners on limit fields + repaint after limits load**

Replace `loadLimits` (lines 28-42):

Old:
```js
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
```
New:
```js
async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'), api.get(`/api/limits?month=${$('month').value}`)]);
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderLimitRows(cats, byCat);
    $('limits').querySelectorAll('input[data-cat]').forEach(inp => {
      inp.addEventListener('input', updateAllocation);
      inp.addEventListener('change', async () => {
        try {
          await api.put('/api/limits', { category_id: Number(inp.dataset.cat),
            month: $('month').value, limit_cents: reaisToCents(inp.value) });
        } catch (e) { showError(e.message); }
      });
    });
    updateAllocation();
  } catch (e) { showError(e.message); }
}
```

- [ ] **Step 5: Point the settings-input listeners at `updateAllocation`**

In the bootstrap block (line 64):

Old:
```js
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateCeiling));
```
New:
```js
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateAllocation));
```

- [ ] **Step 6: Run the full suite (catches broken imports / syntax)**

Run: `npm test`
Expected: PASS. `settingsRender.test.js` imports `settings.js`, so a bad import or syntax error here fails the suite. (The DOM wiring itself has no unit test — that is the repo-wide convention for page bootstrap.)

- [ ] **Step 7: Manual smoke (if a browser is available; use the `run`/`verify` skill)**

1. `npm start` and open the **Settings** page (`/settings.html`).
2. Confirm the pill reads `Allocated R$ … of R$ 8.140,00 · R$ … left` and is green (`pill-ok`).
3. Raise one category limit until the running total passes R$ 8.140,00 → the pill turns clay/red (`pill-over`) and reads `… · R$ … over ceiling`, updating as you type.
4. Lower it back → returns to green "left". Confirm **Save still works** while over.

- [ ] **Step 8: Commit**

```bash
git add public/js/settings.js
git commit -m "feat: live budget-allocation readout on the settings page" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the live readout into the setup wizard

**Files:**
- Modify: `public/js/setup.js` (import line 3; `updateCeiling` → `updateAllocation` at lines 40-45; `load` lines 86-90; bootstrap listener lines 94-95)

**Interfaces:**
- Consumes: `allocationStatus`, `allocationText`, `allocationPillClass` from `./budget.js` (Task 1); existing `reaisToCents`.
- Produces: live DOM behavior only on the wizard's "Limits" step — identical readout to the Settings page.

- [ ] **Step 1: Swap the budget import**

`setup.js` no longer uses `ceilingText` (and never re-exported it). Replace line 3:

Old:
```js
import { ceilingText, renderLimitRows } from './budget.js';
```
New:
```js
import { renderLimitRows, allocationStatus, allocationText, allocationPillClass } from './budget.js';
```

- [ ] **Step 2: Replace `updateCeiling` with `updateAllocation` + `readLimitCents`**

These live inside the `if (typeof document !== 'undefined' && document.getElementById('setup'))` block. Replace lines 40-45:

Old:
```js
  function updateCeiling() {
    $('ceiling').textContent = ceilingText(
      reaisToCents($('monthly_income').value || 0),
      reaisToCents($('fixed_costs').value || 0),
      reaisToCents($('savings_goal').value || 0));
  }
```
New:
```js
  function readLimitCents() {
    return [...document.querySelectorAll('#limits input[data-cat]')]
      .map(inp => reaisToCents(inp.value || 0));
  }

  function updateAllocation() {
    const status = allocationStatus(
      readLimitCents(),
      reaisToCents($('monthly_income').value || 0),
      reaisToCents($('fixed_costs').value || 0),
      reaisToCents($('savings_goal').value || 0));
    const el = $('ceiling');
    el.textContent = allocationText(status);
    el.className = allocationPillClass(status);
  }
```

- [ ] **Step 3: Wire limit-field listeners + repaint in `load`**

Replace lines 86-90 inside `load`:

Old:
```js
      const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
      $('limits').innerHTML = renderLimitRows(cats, byCat);
      $('limitsMonth').textContent = month;
      updateCeiling();
      render();
```
New:
```js
      const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
      $('limits').innerHTML = renderLimitRows(cats, byCat);
      $('limits').querySelectorAll('input[data-cat]').forEach(inp =>
        inp.addEventListener('input', updateAllocation));
      $('limitsMonth').textContent = month;
      updateAllocation();
      render();
```

- [ ] **Step 4: Point the settings-input listeners at `updateAllocation`**

Replace lines 94-95:

Old:
```js
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id =>
    $(id).addEventListener('input', updateCeiling));
```
New:
```js
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id =>
    $(id).addEventListener('input', updateAllocation));
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. `setupRender.test.js` imports `setup.js` (exercising `SETUP_STEPS`, `progressPct`, etc.), so a broken import or syntax error here fails the suite.

- [ ] **Step 6: Manual smoke (if a browser is available)**

The wizard only shows when onboarding is incomplete. Reset it, then walk the wizard:

```bash
# reset onboarding so /setup.html is served
sqlite3 data/gastando.db "DELETE FROM settings WHERE key='onboarding_complete';"
```
(If the key name differs, check `src/routes/onboarding.js`.) Then `npm start`, advance to the **Limits** step, and confirm the same green→red readout behaves as on Settings. Re-complete onboarding when done (finish the wizard).

- [ ] **Step 7: Commit**

```bash
git add public/js/setup.js
git commit -m "feat: live budget-allocation readout in the setup wizard" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Cap = Healthy ceiling (`income − fixed − goal`) → `allocationStatus.ceiling` (Task 1). ✓
- Warn, never block → no Save-gating anywhere; `change`→PUT handler untouched (Task 2). ✓
- Live as-you-type → `input` listeners on limit fields + settings inputs (Tasks 2-3). ✓
- Green→red on crossing → `allocationPillClass` toggles `pill-ok`/`pill-over` (all tasks). ✓
- Settings page + setup wizard → Task 2 + Task 3. ✓
- Copy strings → `allocationText` matches spec exactly, tested (Task 1). ✓
- Edge cases (all-zero, exactly-at-ceiling, over) → covered by Task 1 tests. ✓
- Non-goals (no schema/API/CSS/dashboard/per-group/auto-rebalance) → none introduced. ✓

**Placeholder scan:** none — every step shows the exact code or command.

**Type consistency:** `allocationStatus` returns `{ ceiling, allocated, remaining, over }`; `allocationText`/`allocationPillClass` consume that exact shape; `updateAllocation` in both pages builds it via `allocationStatus(readLimitCents(), …)`. `readLimitCents` returns `number[]`, matching `allocationStatus`'s first parameter. Consistent across Tasks 1-3.
