# Edit & Remove Categories and Groups — Design

**Date:** 2026-06-21
**Status:** Approved (brainstorm)

## Problem

A new user finishing first-run setup is stuck with the 15 seeded categories and 4
seeded groups — there is no way to add, rename, or remove them. The backend
already exposes full CRUD for both (`src/routes/categories.js`,
`src/routes/groups.js`), but nothing in the UI surfaces it: the Settings page only
manages Cards and per-month Limits, and the setup wizard only shows limit inputs
for whatever categories happen to be seeded.

This feature builds the management experience — inline on the Settings limits
table for existing users, and a starter-template choice in the setup wizard for
new users — plus the small backend changes needed to make group removal safe.

## Scope

In scope:
- Add / rename / remove **categories** (inline, in Settings).
- Add / rename / remove / **recolor** **groups** (inline, in Settings).
- Setup wizard: choose a starter template — **Suggested** or **Blank**.
- Soft-delete (deactivate) for groups, mirroring categories.

Explicitly out of scope (YAGNI):
- Drag-and-drop reordering (new items just append via `MAX(sort_order)+1`).
- Moving an existing category between groups.
- Restoring soft-deleted categories/groups.
- Name-uniqueness constraints (duplicates remain allowed, as today).
- Cleaning up orphaned `category_limits` rows.

## Decisions (from brainstorm)

- **Existing-user location:** inline on the Settings limits table.
- **Operations:** category add/rename/remove; group add/rename/remove/recolor.
- **New-user experience:** starter-template choice in the wizard.
- **Templates:** Suggested (current seeded set) vs Blank (no categories).
- **Group removal:** soft-delete via a new `active` column (Approach A), because
  foreign keys are ON and categories keep transaction history, so hard-deleting a
  group that ever held a real category is impossible.

## Data model & migrations

New migration `003_groups_active.sql`:
- `ALTER TABLE groups ADD COLUMN active INTEGER NOT NULL DEFAULT 1;`

`INTEGER` (not a `BOOLEAN` alias) to stay consistent with the existing
`categories.active` and `cards.active` columns; SQLite stores both identically and
`better-sqlite3` returns `0`/`1` regardless.

No other schema changes. New categories/groups append using `MAX(sort_order)+1`.

Soft-delete semantics:
- Remove category → `active=0` (history preserved; hidden from limits table,
  transaction forms, BI pickers).
- Remove group → `active=0`, **blocked (409)** if it still has any *active*
  categories: "group has categories; remove them first".

## Backend API changes

`src/routes/groups.js`:
- `GET /` → add `WHERE active=1`.
- `POST /` → default `sort_order` to `MAX(sort_order)+1`.
- `PUT /:id` → unchanged (handles rename + recolor).
- `DELETE /:id` → soft delete: count **active** categories only; if any,
  `fail(409, 'group has categories; remove them first')`; else
  `UPDATE groups SET active=0`.

`src/routes/categories.js`:
- `POST /` → default `sort_order` to `MAX(sort_order)+1`; validate target group
  exists **and is active**.
- `DELETE /:id` → already soft-deletes; no change.
- Rest unchanged.

New onboarding action — `POST /api/onboarding/template`, body
`{ template: 'suggested' | 'blank' }`:
- Guard: 409 if onboarding already complete **or** any rows exist in
  `transactions` / `installment_groups` (prevents nuking real data).
- `'suggested'` → no-op (seeded data stays).
- `'blank'` → in a transaction, hard-delete all `category_limits`, then
  `categories`, then `groups`. FK-safe because the guard guarantees no
  transaction/installment references.

All write routes use the existing `fail`/`errorHandler` pattern.

## Settings UI (inline management)

The flat limits table becomes **grouped**. `renderLimitRows` in
`public/js/budget.js` is extended (new pure helper, e.g.
`renderGroupedLimitRows(groups, cats, byCat)`) to render, per active group, a
group header row followed by its active category rows.

Group header row:
- Color swatch + group name; click name → inline rename input.
- Color picker (sage / gold / slate / neutral) → `PUT /api/groups/:id`.
- "Remove" link → `DELETE /api/groups/:id` (surfaces 409 message if non-empty).

Category row (keeps the existing limit input):
- Click name → inline rename → `PUT /api/categories/:id` (preserving its
  `group_id` and `examples`).
- "Remove" link → `DELETE /api/categories/:id`.

Add controls:
- "+ Add category" under each group → name input → `POST /api/categories` with
  that `group_id`.
- "+ Add group" at the bottom → name input → `POST /api/groups`.

After any mutation, reload the table and re-run `updateAllocation()` so the
ceiling pill stays correct.

Keep rendering pure (string builders in `budget.js`, unit-tested) separate from
DOM event wiring (in `settings.js`).

## Setup wizard (new-user experience)

`SETUP_STEPS` becomes `['Start', 'Income', 'Fixed costs', 'Savings goal',
'Limits']`.

Step 0 — "Start" (template choice), two selectable cards:
- **Suggested** (default) — "Start with 15 ready-made categories you can tweak
  later."
- **Blank** — "Start from scratch and build your own in Settings."

On leaving step 0, call `POST /api/onboarding/template` with the choice, then
re-fetch categories so later steps reflect it.

Limits step (now last):
- Suggested → limit inputs for the seeded categories (as today).
- Blank → categories list empty → empty state: "No categories yet — you can add
  them anytime in Settings." Allocation pill shows the full ceiling as available.
  "Start tracking" still finishes setup.

`finish()` is unchanged except it tolerates an empty category list (the existing
`cats.filter(c => c.active)` map already handles zero rows). Pure wizard helpers
(`progressPct`, `continueLabel`, etc.) updated for the new step count.

A Blank user lands on a dashboard with no categories — expected; Settings is where
they build them.

## Error handling & edge cases

- Remove group with active categories → 409 via `showError` toast.
- Empty name on add → 400 ("name is required"), server-enforced; UI also disables
  confirm until non-empty.
- Add category to inactive/nonexistent group → 400 ("group_id does not exist");
  picker only lists active groups (safety net).
- Template reset after data exists → 409 guard.
- Rename collisions → allowed (no uniqueness constraint, matching today).
- Limits orphaned by removal → rows remain but hidden (joins filter `active=1`);
  no cleanup.

## Testing

- `crud.test.js` — group soft-delete sets `active=0`; `GET /api/groups` hides
  inactive; group-with-active-categories → 409; category add defaults
  `sort_order`; add-to-inactive-group rejected.
- New `template.test.js` (or extend `onboarding.test.js`) —
  `POST /api/onboarding/template`: blank wipes data; suggested no-op; guard 409
  when transactions exist.
- `budget.test.js` / `settingsRender.test.js` — `renderGroupedLimitRows` outputs
  group headers + category rows, swatches, add controls; empty-state rendering.
- `setupRender.test.js` — updated step count/labels, template-step rendering,
  blank empty-state.
- Run full `npm test` before finishing.
