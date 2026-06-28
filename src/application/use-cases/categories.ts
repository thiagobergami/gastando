import type { Category } from '../../domain/entities';
import type { CategoryRepository, GroupRepository } from '../../domain/ports';
import { AppError } from '../../domain/errors';

export interface CategoryUseCaseDeps {
  categories: CategoryRepository;
  groups: GroupRepository;
}

export interface CreateCategoryInput {
  group_id: number;
  name: string;
  examples?: string;
  sort_order?: number;
}
export interface UpdateCategoryInput {
  group_id: number;
  name: string;
  examples?: string;
  sort_order?: number;
  active?: number;
}

export function makeCategoryUseCases(deps: CategoryUseCaseDeps) {
  const { categories, groups } = deps;

  function assertGroup(groupId: number): void {
    if (!groups.findActiveById(groupId)) throw new AppError(400, 'group_id does not exist');
  }

  return {
    list(): Category[] {
      return categories.listAll();
    },
    create(input: CreateCategoryInput): Category {
      assertGroup(input.group_id);
      const sort_order = input.sort_order ?? categories.nextSortOrder();
      return categories.insert({
        group_id: input.group_id,
        name: input.name,
        examples: input.examples ?? '',
        sort_order,
      });
    },
    update(id: number, input: UpdateCategoryInput): Category {
      assertGroup(input.group_id);
      const active = (input.active ?? 1) ? 1 : 0;
      const changes = categories.update(id, {
        group_id: input.group_id,
        name: input.name,
        examples: input.examples ?? '',
        sort_order: input.sort_order ?? 0,
        active,
      });
      if (changes === 0) throw new AppError(404, 'category not found');
      return categories.findById(id) as Category;
    },
    remove(id: number): void {
      if (categories.deactivate(id) === 0) throw new AppError(404, 'category not found');
    },
  };
}
