import type { InstallmentProgress, InstallmentPurchaseInput } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type {
  CardRepository,
  CategoryRepository,
  InstallmentRepository,
  PersonRepository,
} from '../../domain/ports';
import { previewInstallmentSplit } from '../../domain/services/installmentSplit';

export interface InstallmentUseCaseDeps {
  installments: InstallmentRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  people: PersonRepository;
}

export type UpdateInstallmentInput = InstallmentPurchaseInput;

export function makeInstallmentUseCases(deps: InstallmentUseCaseDeps) {
  const { installments, categories, cards } = deps;

  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  return {
    list(asOfMonth: string): InstallmentProgress[] {
      return installments.listWithProgress(asOfMonth);
    },
    preview(input: { total_cents: number; count: number; split_percent: number }) {
      return previewInstallmentSplit(input.total_cents, input.count, input.split_percent);
    },
    update(id: number, input: UpdateInstallmentInput): void {
      assertRefs(input.category_id, input.card_id);
      if (input.split_person_id != null && !deps.people.findById(input.split_person_id)) {
        throw new AppError(400, 'split_person_id does not exist');
      }
      installments.update(id, input);
    },
    // Throws AppError(404) from the repository if the group does not exist.
    remove(id: number): void {
      installments.remove(id);
    },
    payOff(id: number, asOfMonth: string): void {
      installments.payOffEarly(id, asOfMonth);
    },
  };
}
