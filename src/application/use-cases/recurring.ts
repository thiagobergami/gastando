import type { RecurringTemplate } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { CardRepository, CategoryRepository, RecurringRepository } from '../../domain/ports';
import { chargeDate } from '../../domain/services/dates';

export interface RecurringUseCaseDeps {
  recurring: RecurringRepository;
  categories: CategoryRepository;
  cards: CardRepository;
}
export interface RecurringInput {
  description?: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  day_of_month: number;
}
export interface MaterializeResult {
  created: number[];
  skipped: number[];
  changed: { template_id: number; from_cents: number; to_cents: number }[];
}

export function makeRecurringUseCases(deps: RecurringUseCaseDeps) {
  const { recurring, categories, cards } = deps;
  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  return {
    list(): RecurringTemplate[] {
      return recurring.list();
    },

    create(input: RecurringInput): RecurringTemplate {
      assertRefs(input.category_id, input.card_id);
      return recurring.insert({
        description: input.description ?? '',
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents,
        day_of_month: input.day_of_month,
      });
    },

    update(id: number, input: RecurringInput): RecurringTemplate {
      assertRefs(input.category_id, input.card_id);
      const changes = recurring.update(id, {
        description: input.description ?? '',
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents,
        day_of_month: input.day_of_month,
        active: 1,
      });
      if (changes === 0) throw new AppError(404, 'recurring template not found');
      return recurring.findById(id) as RecurringTemplate;
    },

    remove(id: number): void {
      if (recurring.deactivate(id) === 0) throw new AppError(404, 'recurring template not found');
    },

    materialize(month: string): MaterializeResult {
      const result: MaterializeResult = { created: [], skipped: [], changed: [] };
      for (const t of recurring.listActive()) {
        if (recurring.findChargeForMonth(t.id, month)) {
          result.skipped.push(t.id);
          continue;
        }
        const last = recurring.lastChargeAmountBefore(t.id, month);
        recurring.insertCharge({
          template_id: t.id,
          date: chargeDate(month, t.day_of_month),
          category_id: t.category_id,
          card_id: t.card_id,
          amount_cents: t.amount_cents,
          description: t.description,
        });
        if (last !== null && last !== t.amount_cents) {
          result.changed.push({ template_id: t.id, from_cents: last, to_cents: t.amount_cents });
        }
        result.created.push(t.id);
      }
      return result;
    },
  };
}
