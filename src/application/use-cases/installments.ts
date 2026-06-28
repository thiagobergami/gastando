import type {
  InstallmentRepository, CategoryRepository, CardRepository,
} from '../../domain/ports';
import type { InstallmentProgress } from '../../domain/entities';
import { AppError } from '../../domain/errors';

export interface InstallmentUseCaseDeps {
  installments: InstallmentRepository;
  categories: CategoryRepository;
  cards: CardRepository;
}

export interface UpdateInstallmentInput {
  category_id: number; card_id: number; description?: string;
  total_cents: number; count: number; first_month: string;
}

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
    update(id: number, input: UpdateInstallmentInput): void {
      assertRefs(input.category_id, input.card_id);
      installments.update(id, input);
    },
    // Throws AppError(404) from the repository if the group does not exist.
    remove(id: number): void {
      installments.remove(id);
    },
  };
}
