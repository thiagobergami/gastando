import type {
  CardRepository,
  CategoryRepository,
  LimitRepository,
  ReportRepository,
  SettingsRepository,
} from '../../domain/ports';
import { monthRange } from '../../domain/services/dates';
// A poupança realizada precisa do modelo de cada mês. Consumir o contrato
// estreito `ModelResolver` — em vez de reimplementar a cadeia de fallback aqui —
// é o que garante que o histórico e a revisão nunca discordem.
import type { ModelResolver } from './model';

export interface BiUseCaseDeps {
  reports: ReportRepository;
  limits: LimitRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  settings: SettingsRepository;
  model: ModelResolver;
}

export function makeBiUseCases(deps: BiUseCaseDeps) {
  const { reports, limits, categories, cards, settings, model } = deps;

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
          { name: 'Limite', spent_cents: limit_cents },
          { name: 'Gasto', spent_cents },
        ],
      };
    },

    installmentForecast(from: string, to: string) {
      const months = monthRange(from, to);
      return {
        months,
        series: [
          {
            name: 'Parcelas comprometidas',
            spent_cents: months.map((m) => reports.installmentSpendMonth(m)),
          },
        ],
      };
    },

    // A ordem das séries é contratual: o card da Análise lê por índice, não por
    // nome, para não quebrar se a tradução mudar.
    committedVsDiscretionary(from: string, to: string) {
      const months = monthRange(from, to);
      const committed = months.map((m) => reports.committedSpendMonth(m));
      return {
        months,
        series: [
          { name: 'Comprometido', spent_cents: committed },
          {
            name: 'Discricionário',
            spent_cents: months.map((m, i) => reports.spendAllMonth(m) - committed[i]),
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
            name: 'Gasto',
            spent_cents: months.map((m) => reports.spendByCategoryMonth(categoryId, m)),
          },
          { name: 'Limite', spent_cents: months.map((m) => limits.resolve(categoryId, m)) },
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
          { name: 'Poupança projetada', spent_cents: projected },
          { name: 'Meta', spent_cents: months.map(() => goal) },
        ],
      };
    },

    // A diferença para `savingsTrend` é inteira `model.resolve(m)` no lugar de
    // `settings.get()`: cada mês usa o modelo que valia naquele mês, e mudar a
    // renda de hoje não reescreve o passado (§A.2 do design).
    savingsRealized(from: string, to: string) {
      const months = monthRange(from, to);
      const resolved = months.map((m) => model.resolve(m));
      return {
        months,
        series: [
          {
            name: 'Poupança realizada',
            spent_cents: months.map(
              (m, i) =>
                resolved[i].income_cents - resolved[i].fixed_costs_cents - reports.spendAllMonth(m),
            ),
          },
          { name: 'Meta', spent_cents: resolved.map((r) => r.savings_goal_cents) },
        ],
      };
    },
  };
}
