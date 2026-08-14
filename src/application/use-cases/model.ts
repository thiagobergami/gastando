import type { ResolvedModel } from '../../domain/entities';
import type {
  ModelItemRepository,
  MonthlyModelRepository,
  SettingsRepository,
} from '../../domain/ports';

export interface ModelUseCaseDeps {
  monthlyModel: MonthlyModelRepository;
  settings: SettingsRepository;
  modelItems: ModelItemRepository;
}

export interface ModelInput {
  savings_goal_cents: number;
}

// Contrato estreito consumido por `use-cases/bi.ts`: a poupança realizada precisa
// resolver o modelo de cada mês, e não deve reimplementar a cadeia de fallback.
export interface ModelResolver {
  resolve(month: string): ResolvedModel;
}

// As três chaves globais de `settings` continuam sendo o modelo CORRENTE. A
// tabela é o histórico. O passo 3 da revisão grava nos dois (§B.1 do design).
const KEYS = {
  income_cents: 'monthly_income',
  fixed_costs_cents: 'fixed_costs',
  savings_goal_cents: 'savings_goal',
} as const;

export function makeModelUseCases(deps: ModelUseCaseDeps) {
  const { monthlyModel, settings, modelItems } = deps;

  function num(key: string): number {
    const v = settings.get(key);
    return v !== undefined ? Number(v) : 0;
  }

  return {
    // Cadeia de resolução, do mais específico ao mais genérico:
    //   1. a linha exata do mês
    //   2. a linha mais recente anterior a ele
    //   3. os valores atuais de `settings`
    //   4. zeros
    resolve(month: string): ResolvedModel {
      const row = monthlyModel.findAtOrBefore(month);
      if (row) {
        return { ...row, month, source: row.month === month ? 'month' : 'carry' };
      }
      if (settings.get(KEYS.income_cents) !== undefined) {
        return {
          month,
          income_cents: num(KEYS.income_cents),
          fixed_costs_cents: num(KEYS.fixed_costs_cents),
          savings_goal_cents: num(KEYS.savings_goal_cents),
          source: 'settings',
        };
      }
      return {
        month,
        income_cents: 0,
        fixed_costs_cents: 0,
        savings_goal_cents: 0,
        source: 'none',
      };
    },

    // `income_cents`/`fixed_costs_cents` nunca vêm do cliente: são sempre a
    // soma de `model_items` no instante da gravação. Isso garante que o total
    // congelado no histórico nunca diverge da lista de itens que o gerou —
    // não existe um segundo caminho pelo qual esses dois campos possam ser
    // gravados com um valor que a lista de itens não sustenta.
    set(month: string, input: ModelInput): ResolvedModel {
      const income_cents = modelItems.sumByKind('income');
      const fixed_costs_cents = modelItems.sumByKind('fixed_cost');
      const full = {
        income_cents,
        fixed_costs_cents,
        savings_goal_cents: input.savings_goal_cents,
      };
      monthlyModel.upsert({ month, ...full });
      settings.setMany([
        [KEYS.income_cents, String(income_cents)],
        [KEYS.fixed_costs_cents, String(fixed_costs_cents)],
        [KEYS.savings_goal_cents, String(input.savings_goal_cents)],
      ]);
      return { month, ...full, source: 'month' };
    },
  };
}
