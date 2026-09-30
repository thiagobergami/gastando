import { AppError } from '../../domain/errors';
import type { CategoryRepository, LimitRepository, ReportRepository } from '../../domain/ports';
import { addMonths } from '../../domain/services/dates';
import { carryIntoMonth, overageForMonth } from '../../domain/services/limitCarry';

export interface LimitUseCaseDeps {
  limits: LimitRepository;
  categories: CategoryRepository;
  reports: ReportRepository;
}

export interface LimitSuggestion {
  category_id: number;
  last_month_cents: number;
  avg3_cents: number;
}

export interface ResolvedLimit {
  category_id: number;
  month: string;
  limit_cents: number;
  carry_in_cents: number;
  overage_cents: number;
  carry_forward: boolean;
}
export interface UpsertLimitInput {
  category_id: number;
  month: string;
  limit_cents: number;
}

export function makeLimitUseCases(deps: LimitUseCaseDeps) {
  const { limits, categories, reports } = deps;
  return {
    // Resolved limit per active category for the month (carry-forward).
    // Uses listActiveIds() (no ORDER BY) to preserve the legacy array ordering.
    listForMonth(month: string): ResolvedLimit[] {
      return categories.listActiveIds().map((id) => {
        const carry_in_cents = carryIntoMonth(limits, id, month);
        return {
          category_id: id,
          month,
          limit_cents: limits.resolve(id, month),
          carry_in_cents,
          overage_cents: overageForMonth(limits, id, month, carry_in_cents),
          carry_forward: limits.carriesForward(id, month),
        };
      });
    },
    upsert(input: UpsertLimitInput): ResolvedLimit {
      if (!categories.findById(input.category_id))
        throw new AppError(400, 'category_id does not exist');
      limits.upsert(input.category_id, input.month, input.limit_cents);
      const carry_in_cents = carryIntoMonth(limits, input.category_id, input.month);
      return {
        ...input,
        carry_in_cents,
        overage_cents: overageForMonth(limits, input.category_id, input.month, carry_in_cents),
        carry_forward: limits.carriesForward(input.category_id, input.month),
      };
    },
    setCarryForward(input: { category_id: number; month: string; carry_forward: boolean }) {
      if (!categories.findById(input.category_id))
        throw new AppError(400, 'category_id does not exist');
      limits.setCarryForward(input.category_id, input.month, input.carry_forward);
      return input;
    },
    suggestions(month: string): LimitSuggestion[] {
      const m1 = addMonths(month, -1);
      const m2 = addMonths(month, -2);
      const m3 = addMonths(month, -3);
      return categories.listActive().map((c) => {
        const a = reports.spendByCategoryMonth(c.id, m1);
        const b = reports.spendByCategoryMonth(c.id, m2);
        const d = reports.spendByCategoryMonth(c.id, m3);
        return { category_id: c.id, last_month_cents: a, avg3_cents: Math.round((a + b + d) / 3) };
      });
    },
  };
}
