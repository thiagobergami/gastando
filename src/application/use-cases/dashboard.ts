import type { LimitRepository, ReportRepository, SettingsRepository } from '../../domain/ports';
import { budgetStatus } from '../../domain/services/budget';
import { carryIntoMonth } from '../../domain/services/limitCarry';

export interface DashboardUseCaseDeps {
  reports: ReportRepository;
  limits: LimitRepository;
  settings: SettingsRepository;
}

export function makeDashboardUseCases(deps: DashboardUseCaseDeps) {
  const { reports, limits, settings } = deps;

  function num(key: string): number {
    const v = settings.get(key);
    return v !== undefined ? Number(v) : 0;
  }

  return {
    build(month: string) {
      const categories = reports.dashboardCategories().map((c) => {
        const limit_cents = limits.resolve(c.id, month);
        const spent_cents = limits.sumSpend(c.id, month);
        const carry_in_cents = carryIntoMonth(limits, c.id, month);
        const effective_spent_cents = spent_cents + carry_in_cents;
        return {
          category_id: c.id,
          name: c.name,
          examples: c.examples,
          essential: c.essential,
          limit_cents,
          spent_cents,
          carry_in_cents,
          effective_spent_cents,
          remaining_cents: limit_cents - effective_spent_cents,
          status: budgetStatus(effective_spent_cents, limit_cents),
        };
      });

      const sumWhere = (essential: number) =>
        categories.reduce((s, c) => (c.essential === essential ? s + c.spent_cents : s), 0);

      const income = num('monthly_income');
      const fixed = num('fixed_costs');
      const goal = num('savings_goal');
      const spent_cents = categories.reduce((s, c) => s + c.spent_cents, 0);
      const can_spend_cents = income - fixed - goal;
      const projected_savings_cents = income - fixed - spent_cents;

      return {
        month,
        // A ausência de renda é o que separa o estado inicial do completo (§10).
        configured: settings.get('monthly_income') !== undefined,
        entry_count: reports.countTransactions(month),
        categories,
        by_essential: {
          essential_cents: sumWhere(1),
          non_essential_cents: sumWhere(0),
        },
        totals: {
          limit_cents: categories.reduce((s, c) => s + c.limit_cents, 0),
          spent_cents,
          monthly_income_cents: income,
          fixed_costs_cents: fixed,
          savings_goal_cents: goal,
          can_spend_cents,
          left_to_spend_cents: can_spend_cents - spent_cents,
          projected_savings_cents,
          vs_goal_cents: projected_savings_cents - goal,
        },
      };
    },
  };
}
