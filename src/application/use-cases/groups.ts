import type { Group } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { GroupRepository } from '../../domain/ports';

export interface GroupUseCaseDeps {
  groups: GroupRepository;
}

export interface CreateGroupInput {
  name: string;
  color?: string;
  sort_order?: number;
}
export interface UpdateGroupInput {
  name: string;
  color?: string;
  sort_order?: number;
}

export function makeGroupUseCases(deps: GroupUseCaseDeps) {
  const { groups } = deps;
  return {
    list(): Group[] {
      return groups.listActive();
    },
    create(input: CreateGroupInput): Group {
      const sort_order = input.sort_order ?? groups.nextSortOrder();
      return groups.insert({ name: input.name, color: input.color ?? 'neutral', sort_order });
    },
    update(id: number, input: UpdateGroupInput): Group {
      const changes = groups.update(id, {
        name: input.name,
        color: input.color ?? 'neutral',
        sort_order: input.sort_order ?? 0,
      });
      if (changes === 0) throw new AppError(404, 'group not found');
      return groups.findById(id) as Group;
    },
    remove(id: number): void {
      if (groups.countActiveCategories(id) > 0)
        throw new AppError(409, 'group has categories; remove them first');
      if (groups.deactivate(id) === 0) throw new AppError(404, 'group not found');
    },
  };
}
