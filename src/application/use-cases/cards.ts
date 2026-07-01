import type { Card } from '../../domain/entities';
import type { CardRepository, ReportRepository } from '../../domain/ports';
import { AppError } from '../../domain/errors';
import { addMonths, chargeDate } from '../../domain/services/dates';

export interface CardUseCaseDeps { cards: CardRepository; reports: ReportRepository; }

export interface CreateCardInput {
  name: string;
}
export interface UpdateCardInput {
  name: string;
  active?: number;
}

export function makeCardUseCases(deps: CardUseCaseDeps) {
  const { cards, reports } = deps;
  return {
    list(): Card[] {
      return cards.listAll();
    },
    create(input: CreateCardInput): Card {
      return cards.insert({ name: input.name });
    },
    update(id: number, input: UpdateCardInput): Card {
      const active = (input.active ?? 1) ? 1 : 0;
      if (cards.update(id, { name: input.name, active }) === 0)
        throw new AppError(404, 'card not found');
      return cards.findById(id) as Card;
    },
    remove(id: number): void {
      if (cards.deactivate(id) === 0) throw new AppError(404, 'card not found');
    },
    setConfig(id: number, body: { closing_day: number | null; due_day: number | null }): Card {
      if (cards.setStatementConfig(id, body.closing_day, body.due_day) === 0) {
        throw new AppError(404, 'card not found');
      }
      return cards.findById(id) as Card;
    },

    statement(id: number, month: string) {
      const card = cards.findById(id);
      if (!card) throw new AppError(404, 'card not found');
      if (card.closing_day == null) {
        // No cycle configured: fall back to the calendar month window.
        const start = chargeDate(addMonths(month, -1), 31); // last day of prev month, exclusive
        const end = chargeDate(month, 31);                  // last day of this month, inclusive
        return { card_id: id, month, closing_date: null, due_date: null,
          amount_cents: reports.spendByCardDateRange(id, start, end) };
      }
      const closing_date = chargeDate(month, card.closing_day);
      const start = chargeDate(addMonths(month, -1), card.closing_day);
      const due_date = card.due_day != null ? chargeDate(month, card.due_day) : null;
      return { card_id: id, month, closing_date, due_date,
        amount_cents: reports.spendByCardDateRange(id, start, closing_date) };
    },
  };
}
