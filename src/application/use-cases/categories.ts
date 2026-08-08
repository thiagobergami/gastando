import type { Category } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { CategoryRepository } from '../../domain/ports';

export interface CategoryUseCaseDeps {
  categories: CategoryRepository;
}

export interface CreateCategoryInput {
  name: string;
  essential?: number;
  examples?: string;
  sort_order?: number;
}
export interface UpdateCategoryInput extends CreateCategoryInput {
  active?: number;
}

const flag = (v: number | undefined): number => (v ? 1 : 0);

export function makeCategoryUseCases(deps: CategoryUseCaseDeps) {
  const { categories } = deps;

  return {
    list(): Category[] {
      return categories.listAll();
    },
    create(input: CreateCategoryInput): Category {
      return categories.insert({
        name: input.name,
        examples: input.examples ?? '',
        sort_order: input.sort_order ?? categories.nextSortOrder(),
        essential: flag(input.essential),
      });
    },
    update(id: number, input: UpdateCategoryInput): Category {
      const changes = categories.update(id, {
        name: input.name,
        examples: input.examples ?? '',
        sort_order: input.sort_order ?? 0,
        active: (input.active ?? 1) ? 1 : 0,
        essential: flag(input.essential),
      });
      if (changes === 0) throw new AppError(404, 'category not found');
      return categories.findById(id) as Category;
    },
    remove(id: number): void {
      if (categories.deactivate(id) === 0) throw new AppError(404, 'category not found');
    },
  };
}
