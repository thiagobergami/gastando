import type { ModelItem } from '../../domain/entities';
import type { ModelItemRepository } from '../../domain/ports';

export interface ModelItemUseCaseDeps {
  modelItems: ModelItemRepository;
}

export interface CreateModelItemInput {
  kind: ModelItem['kind'];
  name: string;
  amount_cents: number;
}

export interface UpdateModelItemInput {
  name: string;
  amount_cents: number;
}

export function makeModelItemUseCases(deps: ModelItemUseCaseDeps) {
  const { modelItems } = deps;

  return {
    list(kind: ModelItem['kind']): ModelItem[] {
      return modelItems.listByKind(kind);
    },
    // Sempre acrescenta ao fim da lista do `kind` — a mesma ideia de
    // `categories.nextSortOrder`, sem precisar de um método próprio no port
    // porque `listByKind` já dá tudo que é preciso para calcular o próximo.
    create(input: CreateModelItemInput): ModelItem {
      const existing = modelItems.listByKind(input.kind);
      const sort_order = existing.length
        ? Math.max(...existing.map((i) => i.sort_order)) + 1
        : 0;
      return modelItems.create({ ...input, sort_order });
    },
    update(id: number, input: UpdateModelItemInput): void {
      modelItems.update(id, input);
    },
    remove(id: number): void {
      modelItems.delete(id);
    },
  };
}
