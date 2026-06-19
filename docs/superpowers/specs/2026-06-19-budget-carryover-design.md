# Budget Carryover (Rollover) — Design

**Date:** 2026-06-19
**Status:** Approved

## Summary

When a category overspends its monthly limit, the overage carries forward and is
added on top of the next month's spending for budget-tracking purposes. The limit
itself never changes. The carry is self-correcting: any month that ends at or under
the limit resets the chain to zero, so there is no snowball. This is a
spending-discipline overlay on the dashboard only — it does not touch real-money
totals (income, fixed costs, projected savings).

## Rule

For each active category with a positive limit:

```
carry_in(M) = max(0, actual_spent(M-1) + carry_in(M-1) - limit(M-1))
```

- `actual_spent(M)` — sum of transactions for the category in month M.
- `limit(M)` — the effective limit for month M (most recent `category_limits` row at
  or before M, matching existing dashboard behavior).
- Months where `limit == 0` never accrue carry (untracked categories), and carry into
  such a month is treated as 0.

### Worked example (Games, limit 100)

| Month | carry_in | actual | effective spent | over limit? | carry_out |
|-------|----------|--------|-----------------|-------------|-----------|
| Jan   | 0        | 130    | 130             | yes (+30)   | 30        |
| Feb   | 30       | 80     | 110             | yes (+10)   | 10        |
| Mar   | 10       | 50     | 60              | no          | 0         |
| Apr   | 0        | 50     | 50              | no          | 0         |

## Computation

Computed on the fly in `src/services/dashboard.js` — no schema changes, no stored
state. A helper computes `carry_in` for each category by iterating month-by-month
from the category's earliest transaction month up to the requested month, reusing the
existing limit-lookup logic and the `addMonths` helper from `src/services/dates.js`.

If a category has no transactions, `carry_in` is 0. At personal-data scale (a handful
of categories over a few years of months) the iteration cost is negligible.

Rejected alternative: a stored `carry_in_cents` column recomputed on the write path.
Adds a migration, write-path complexity, and stale-carry bugs when past transactions
are edited or backfilled. Not justified here.

## Dashboard payload changes

Per category (in `buildDashboard`):

- `carry_in_cents` — new field, 0 when there is no carry.
- `spent_cents` — unchanged, remains **actual** spending for the month.
- `effective_spent_cents` — new field = `spent_cents + carry_in_cents`.
- `remaining_cents` — now `limit_cents - effective_spent_cents`.
- `status` — `effective_spent_cents > limit_cents ? 'over' : 'ok'`.

Group totals: the per-group rollup sums `effective_spent_cents` so a group's over/under
state reflects carry.

Real-money totals untouched: the overall `spent_cents` total, `teto_cents`,
`projected_savings_cents`, and `vs_goal_cents` continue to use actual transactions only.
No phantom money leaves the projections.

## UI

On the dashboard category card, when `carry_in_cents > 0`, render a small badge such as
`+R$30 carryover`. No badge when `carry_in_cents == 0`.

## Testing

Unit tests on the carry helper / `buildDashboard`:

1. The Jan–Apr example above: carry sequence 30 → 20 → 0 → 0.
2. No-limit category (limit 0) accrues nothing even when spending is positive.
3. A single clean month (under limit) produces carry 0.
4. A multi-month debt that never clears keeps accumulating correctly.
5. Real-money totals (`projected_savings_cents`, `teto_cents`) are unaffected by carry.
