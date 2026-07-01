import type { Transaction } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type {
  CardRepository,
  CategoryRepository,
  InstallmentRepository,
  TransactionPage,
  TransactionRepository,
} from '../../domain/ports';

export interface TransactionUseCaseDeps {
  transactions: TransactionRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  installments: InstallmentRepository;
}

// Input has already passed HTTP-edge format validation; the use-case enforces
// existence rules and orchestrates persistence.
export interface CreateTransactionInput {
  date?: string;
  category_id: number;
  card_id: number;
  amount_cents?: number;
  description?: string;
  installment_total_cents?: number;
  installment_count?: number;
  first_month?: string;
}

export interface UpdateTransactionInput {
  date: string;
  category_id: number;
  card_id: number;
  amount_cents: number;
  description?: string;
}

export function makeTransactionUseCases(deps: TransactionUseCaseDeps) {
  const { transactions, categories, cards, installments } = deps;

  function assertRefs(categoryId: number, cardId: number): void {
    if (!categories.findById(categoryId)) throw new AppError(400, 'category_id does not exist');
    if (!cards.findById(cardId)) throw new AppError(400, 'card_id does not exist');
  }

  return {
    list(page: TransactionPage): { total: number; items: Transaction[] } {
      const filter = {
        month: page.month,
        categoryId: page.categoryId,
        cardId: page.cardId,
        q: page.q,
      };
      return { total: transactions.count(filter), items: transactions.list(page) };
    },

    create(input: CreateTransactionInput): Transaction {
      const description = input.description ?? '';
      const isInstallment =
        input.installment_count !== undefined || input.installment_total_cents !== undefined;
      assertRefs(input.category_id, input.card_id);

      if (isInstallment) {
        const groupId = installments.createPurchase({
          category_id: input.category_id,
          card_id: input.card_id,
          description,
          total_cents: input.installment_total_cents as number,
          count: input.installment_count as number,
          first_month: input.first_month as string,
        });
        const first = transactions.firstByGroup(groupId) as Transaction;
        return { ...first, installment_group_id: groupId };
      }

      return transactions.insert({
        date: input.date as string,
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents as number,
        description,
      });
    },

    update(id: number, input: UpdateTransactionInput): Transaction {
      assertRefs(input.category_id, input.card_id);
      const changes = transactions.update(id, {
        date: input.date,
        category_id: input.category_id,
        card_id: input.card_id,
        amount_cents: input.amount_cents,
        description: input.description ?? '',
      });
      if (changes === 0) throw new AppError(404, 'transaction not found');
      return transactions.findById(id) as Transaction;
    },

    remove(id: number): void {
      if (transactions.remove(id) === 0) throw new AppError(404, 'transaction not found');
    },

    exportCsv(filter: {
      month?: string;
      categoryId?: number;
      cardId?: number;
      q?: string;
    }): string {
      const items = transactions.list({ ...filter, limit: null, offset: 0 });
      const catName = new Map(categories.listAll().map((c) => [c.id, c.name]));
      const cardName = new Map(cards.listAll().map((c) => [c.id, c.name]));
      const cell = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        'date',
        'category',
        'card',
        'amount_cents',
        'description',
        'installment_no',
        'installment_total',
      ];
      const rows = items.map((t) =>
        [
          t.date,
          catName.get(t.category_id) ?? '',
          cardName.get(t.card_id) ?? '',
          t.amount_cents,
          t.description,
          t.installment_no ?? '',
          t.installment_total ?? '',
        ]
          .map(cell)
          .join(','),
      );
      return [header.join(','), ...rows].join('\n');
    },
  };
}
