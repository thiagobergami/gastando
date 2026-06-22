import type { Card } from '../../domain/entities';
import type { CardRepository } from '../../domain/ports';
import { AppError } from '../../domain/errors';

export interface CardUseCaseDeps { cards: CardRepository; }

export interface CreateCardInput { name: string; }
export interface UpdateCardInput { name: string; active?: number; }

export function makeCardUseCases(deps: CardUseCaseDeps) {
  const { cards } = deps;
  return {
    list(): Card[] {
      return cards.listAll();
    },
    create(input: CreateCardInput): Card {
      return cards.insert({ name: input.name });
    },
    update(id: number, input: UpdateCardInput): Card {
      const active = (input.active ?? 1) ? 1 : 0;
      if (cards.update(id, { name: input.name, active }) === 0) throw new AppError(404, 'card not found');
      return cards.findById(id) as Card;
    },
    remove(id: number): void {
      if (cards.deactivate(id) === 0) throw new AppError(404, 'card not found');
    },
  };
}
