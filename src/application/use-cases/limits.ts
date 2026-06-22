import type { LimitRepository, CategoryRepository } from '../../domain/ports';
import { AppError } from '../../domain/errors';

export interface LimitUseCaseDeps { limits: LimitRepository; categories: CategoryRepository; }

export interface ResolvedLimit { category_id: number; month: string; limit_cents: number; }
export interface UpsertLimitInput { category_id: number; month: string; limit_cents: number; }

export function makeLimitUseCases(deps: LimitUseCaseDeps) {
  const { limits, categories } = deps;
  return {
    // Resolved limit per active category for the month (carry-forward).
    // Uses listActiveIds() (no ORDER BY) to preserve the legacy array ordering.
    listForMonth(month: string): ResolvedLimit[] {
      return categories.listActiveIds().map(id => ({
        category_id: id, month, limit_cents: limits.resolve(id, month),
      }));
    },
    upsert(input: UpsertLimitInput): ResolvedLimit {
      if (!categories.findById(input.category_id)) throw new AppError(400, 'category_id does not exist');
      limits.upsert(input.category_id, input.month, input.limit_cents);
      return { category_id: input.category_id, month: input.month, limit_cents: input.limit_cents };
    },
  };
}
