import type { LimitRepository, ReportRepository, SettingsRepository } from '../../domain/ports';
import { budgetStatus } from '../../domain/services/budget';
import { addMonths } from '../../domain/services/dates';

export interface DashboardUseCaseDeps {
  reports: ReportRepository;
  limits: LimitRepository;
  settings: SettingsRepository;
}

export function makeDashboardUseCases(deps: DashboardUseCaseDeps) {
  const { reports, limits, settings } = deps;

  function computeCarryIn(categoryId: number, month: string): number {
    const first = limits.firstTxMonth(categoryId);
    if (!first || first >= month) return 0;
    let carry = 0;
    for (let m = first; m < month; m = addMonths(m, 1)) {
      const limit = limits.resolve(categoryId, m);
      const actual = limits.sumSpend(categoryId, m);
      carry = limit > 0 ? Math.max(0, actual + carry - limit) : 0;
    }
    return carry;
  }

  function num(key: string): number {
    const v = settings.get(key);
    return v !== undefined ? Number(v) : 0;
  }

  return {
    build(month: string) {
      const cats = reports.dashboardCategories();

      const categories = cats.map((c) => {
        const limit_cents = limits.resolve(c.id, month);
        const spent_cents = limits.sumSpend(c.id, month);
        const carry_in_cents = computeCarryIn(c.id, month);
        const effective_spent_cents = spent_cents + carry_in_cents;
        return {
          category_id: c.id,
          name: c.name,
          examples: c.examples,
          group_id: c.group_id,
          group_name: c.group_name,
          group_color: c.group_color,
          limit_cents,
          spent_cents,
          carry_in_cents,
          effective_spent_cents,
          remaining_cents: limit_cents - effective_spent_cents,
          status: budgetStatus(effective_spent_cents, limit_cents),
        };
      });

      const groupsMap = new Map();
      for (const c of categories) {
        if (!groupsMap.has(c.group_id)) {
          groupsMap.set(c.group_id, {
            group_id: c.group_id,
            name: c.group_name,
            color: c.group_color,
            limit_cents: 0,
            spent_cents: 0,
            effective_spent_cents: 0,
          });
        }
        const g = groupsMap.get(c.group_id);
        g.limit_cents += c.limit_cents;
        g.spent_cents += c.spent_cents;
        g.effective_spent_cents += c.effective_spent_cents;
      }
      const groups = [...groupsMap.values()];

      const income = num('monthly_income');
      const fixed = num('fixed_costs');
      const goal = num('savings_goal');
      const spent_cents = categories.reduce((s, c) => s + c.spent_cents, 0);
      const limit_total = categories.reduce((s, c) => s + c.limit_cents, 0);
      const teto_cents = income - fixed - goal;
      const projected_savings_cents = income - fixed - spent_cents;

      return {
        month,
        categories,
        groups,
        totals: {
          limit_cents: limit_total,
          spent_cents,
          monthly_income_cents: income,
          fixed_costs_cents: fixed,
          savings_goal_cents: goal,
          teto_cents,
          projected_savings_cents,
          vs_goal_cents: projected_savings_cents - goal,
        },
      };
    },
  };
}
