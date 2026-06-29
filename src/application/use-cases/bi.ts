import type {
  CardRepository,
  CategoryRepository,
  GroupRepository,
  LimitRepository,
  ReportRepository,
  SettingsRepository,
} from '../../domain/ports';
import { monthRange } from '../../domain/services/dates';

export interface BiUseCaseDeps {
  reports: ReportRepository;
  limits: LimitRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  groups: GroupRepository;
  settings: SettingsRepository;
}

export function makeBiUseCases(deps: BiUseCaseDeps) {
  const { reports, limits, categories, cards, groups, settings } = deps;

  return {
    trends(from: string, to: string) {
      const months = monthRange(from, to);
      const series = categories.listActive().map((c) => ({
        category_id: c.id,
        name: c.name,
        spent_cents: months.map((m) => reports.spendByCategoryMonth(c.id, m)),
      }));
      return { months, series };
    },

    byCard(from: string, to: string) {
      const months = monthRange(from, to);
      const series = cards.listAll().map((c) => ({
        card_id: c.id,
        name: c.name,
        spent_cents: months.map((m) => reports.spendByCardMonth(c.id, m)),
      }));
      return { months, series };
    },

    byGroup(from: string, to: string) {
      const months = monthRange(from, to);
      const series = groups.listAll().map((g) => ({
        group_id: g.id,
        name: g.name,
        spent_cents: months.map((m) => reports.spendByGroupMonth(g.id, m)),
      }));
      return { months, series };
    },

    budgetVsActual(from: string, to: string) {
      const months = monthRange(from, to);
      const cats = categories.listActive();
      const limit_cents = months.map((m) =>
        cats.reduce((sum, c) => sum + limits.resolve(c.id, m), 0),
      );
      const spent_cents = months.map((m) => reports.spendAllMonth(m));
      return {
        months,
        series: [
          { name: 'Limit', spent_cents: limit_cents },
          { name: 'Spent', spent_cents },
        ],
      };
    },

    installmentForecast(from: string, to: string) {
      const months = monthRange(from, to);
      return {
        months,
        series: [
          {
            name: 'Committed installments',
            spent_cents: months.map((m) => reports.installmentSpendMonth(m)),
          },
        ],
      };
    },

    categoryTrend(categoryId: number, from: string, to: string) {
      const months = monthRange(from, to);
      return {
        months,
        series: [
          {
            name: 'Spent',
            spent_cents: months.map((m) => reports.spendByCategoryMonth(categoryId, m)),
          },
          { name: 'Limit', spent_cents: months.map((m) => limits.resolve(categoryId, m)) },
        ],
      };
    },

    savingsTrend(from: string, to: string) {
      const months = monthRange(from, to);
      const num = (k: string) => {
        const v = settings.get(k);
        return v !== undefined ? Number(v) : 0;
      };
      const income = num('monthly_income');
      const fixed = num('fixed_costs');
      const goal = num('savings_goal');
      const projected = months.map((m) => income - fixed - reports.spendAllMonth(m));
      return {
        months,
        series: [
          { name: 'Projected savings', spent_cents: projected },
          { name: 'Goal', spent_cents: months.map(() => goal) },
        ],
      };
    },
  };
}
