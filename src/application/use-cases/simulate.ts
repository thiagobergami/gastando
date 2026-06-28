import type { CategoryRepository, LimitRepository } from '../../domain/ports';
import { addMonths } from '../../domain/services/dates';
import { splitCents } from '../../domain/services/installments';

export interface SimulateUseCaseDeps {
  categories: CategoryRepository;
  limits: LimitRepository;
}

export interface SimulateInput {
  category_id: number;
  total_cents: number;
  count: number;
  first_month: string;
}

export function makeSimulateUseCases(deps: SimulateUseCaseDeps) {
  const { categories, limits } = deps;

  return {
    // Read-only what-if. Returns null if the category is unknown/inactive.
    simulate({ category_id, total_cents, count, first_month }: SimulateInput) {
      const cat = categories.findById(category_id);
      if (!cat?.active) return null;

      const amounts = splitCents(total_cents, count);
      const months = amounts.map((installment_cents, i) => {
        const month = addMonths(first_month, i);
        const limit_cents = limits.resolve(category_id, month);
        const spent_before_cents = limits.sumSpend(category_id, month);
        const spent_after_cents = spent_before_cents + installment_cents;
        return {
          month,
          installment_cents,
          limit_cents,
          spent_before_cents,
          spent_after_cents,
          remaining_before_cents: limit_cents - spent_before_cents,
          remaining_after_cents: limit_cents - spent_after_cents,
          status: spent_after_cents > limit_cents ? 'over' : 'ok',
        };
      });

      return { category_id: cat.id, name: cat.name, months };
    },
  };
}
