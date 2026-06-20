# Reconcile category limits with the savings ceiling

**Date:** 2026-06-20
**Status:** Approved (brainstorming complete)

## Problem

On the Settings page the "Savings model" (monthly income, fixed costs, savings goal)
and the per-category "Limits" are edited side by side but never reconciled. The app
already derives a **Healthy ceiling** = `income − fixed − goal` (`ceilingText` in
`budget.js`; `teto_cents` in the dashboard service), yet it is shown only as passive
text. Nothing compares it against the *sum* of the category limits, so a user can
allocate limits totaling more than the ceiling and silently miss their savings goal.

The two values should "talk to each other."

## Decisions (from brainstorming)

1. **Cap = the Healthy ceiling**, `income − fixed − goal` — not the savings-goal figure
   on its own. This is the money actually left for discretionary spending after savings
   are set aside, so honoring it is what makes the savings goal achievable.
2. **Enforcement = warn, never block.** A live readout shows how much of the ceiling is
   allocated and how much is left; when limits exceed the ceiling it turns red and shows
   the overage. Save always works — the user stays in control (some months they
   intentionally dip into savings).
3. **Scope = both edit surfaces.** The Settings page (primary ask) and the setup
   wizard's "Limits" step, which share the same `budget.js` helper and already show the
   ceiling pill.

## Approach

**Pure client-side live readout.** The reconciliation is presentation-only and must
update on every keystroke, so it lives in the browser. No API, schema, or migration
changes. (Rejected: a server-authoritative endpoint — it can't update as you type
without duplicating the math client-side, and adds round-trips for a warn-only readout.
Rejected: surfacing it only on the dashboard — it misses the ask of seeing the signal
*while editing limits*.)

## Design

### Pure helpers — `public/js/budget.js`

Add three side-effect-free helpers next to the existing `ceilingText` (which stays, with
its passing unit test):

```js
export function allocationStatus(limitCentsList, income, fixed, goal) {
  const ceiling = income - fixed - goal;
  const allocated = limitCentsList.reduce((s, n) => s + (n || 0), 0);
  const remaining = ceiling - allocated;
  return { ceiling, allocated, remaining, over: remaining < 0 };
}

export function allocationText(s) {
  return s.over
    ? `Allocated ${formatBRL(s.allocated)} of ${formatBRL(s.ceiling)} · ${formatBRL(-s.remaining)} over ceiling`
    : `Allocated ${formatBRL(s.allocated)} of ${formatBRL(s.ceiling)} · ${formatBRL(s.remaining)} left`;
}

export function allocationPillClass(s) {
  return s.over ? 'pill pill-over' : 'pill pill-ok';
}
```

All inputs are integer cents (`reaisToCents` already rounds), so the sum is exact — no
float drift. The "over" branch passes `-remaining` (a positive magnitude) to `formatBRL`
and labels it "over ceiling".

### The readout (UX + copy)

The existing `#ceiling` `<span class="pill pill-ok">` in both `settings.html` and
`setup.html` is reused unchanged in markup. JS now sets both its text and its class:

- **Within ceiling** → `pill pill-ok` (sage): `Allocated R$ 6.970,00 of R$ 8.140,00 · R$ 1.170,00 left`
- **Over ceiling** → `pill pill-over` (clay/red): `Allocated R$ 9.200,00 of R$ 8.140,00 · R$ 1.060,00 over ceiling`

Both `pill-ok` and `pill-over` already exist in `app.css` — no new CSS.

### Wiring — `public/js/settings.js` and `public/js/setup.js`

Both files already have a `updateCeiling()` bound to the three savings-model inputs.
Replace it with `updateAllocation()` that:

1. reads the three settings inputs (income, fixed, goal) via `reaisToCents`,
2. sums every visible limit field — `#limits input[data-cat]` — via `reaisToCents`,
3. calls `allocationStatus`, then writes `allocationText(...)` to `#ceiling.textContent`
   and `allocationPillClass(...)` to `#ceiling.className`.

Trigger points:

- the three savings-model inputs' `input` event (already wired to `updateCeiling`),
- **new:** each limit field's `input` event, for live-as-you-type feedback,
- once immediately after the limit rows are rendered (`loadLimits` on Settings; `load`
  in the wizard).

On Settings, the limit fields keep their existing `change` → `PUT /api/limits` handler
untouched; the new `input` listener only recomputes the client-side readout. In the
wizard the limit fields are persisted on finish, so only the `input` listener is added.

`settings.js` re-exports `ceilingText`/`renderLimitRows` today "so existing importers and
tests can reach them here"; it will also re-export the new helpers for the same reason.

### Edge cases

- **Fresh/all-zero state** (e.g., before income is entered): `ceiling = 0`,
  `allocated = 0`, `remaining = 0`, `over = false` → green "R$ 0,00 left". Acceptable.
- **Negative ceiling** (fixed+goal entered before income — only transiently possible in
  the wizard, whose step order is Income → Fixed → Savings → Limits): rendered honestly
  as "over". No special-casing.
- **Exactly at ceiling**: `remaining = 0`, `over = false` → green "R$ 0,00 left".

## Testing

- New unit tests for `allocationStatus` + `allocationText`: under, exactly-at-ceiling,
  over, and empty/all-zero. Mirror the style of the existing `ceilingText` test in
  `test/settingsRender.test.js`.
- Extend `test/settingsRender.test.js` / `test/setupRender.test.js` to assert
  `allocationPillClass` flips `pill-ok` ↔ `pill-over` across the boundary.

## Non-goals (YAGNI)

- No hard blocking or Save-gating (decision: warn-only).
- No schema, API, or migration changes.
- No dashboard changes (it already exposes `teto_cents` / `vs_goal_cents`).
- No per-group caps; the reconciliation is against the single total ceiling.
- No auto-rebalancing/scaling of limits to fit.

## Files touched

- `public/js/budget.js` — add `allocationStatus`, `allocationText`, `allocationPillClass`.
- `public/js/settings.js` — `updateCeiling` → `updateAllocation`; limit-field `input`
  listeners; re-export new helpers.
- `public/js/setup.js` — `updateCeiling` → `updateAllocation`; limit-field `input` listeners.
- `test/settingsRender.test.js`, `test/setupRender.test.js` — new + extended assertions.
