import type { Category } from '../../domain/entities';
import type { ReportRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeReportRepository(db: Db): ReportRepository {
  return {
    spendByCategoryMonth(categoryId: number, month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE category_id=? AND strftime('%Y-%m', date)=?`,
          )
          .get(categoryId, month) as { s: number }
      ).s;
    },
    spendByCardMonth(cardId: number, month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE card_id=? AND strftime('%Y-%m', date)=?`,
          )
          .get(cardId, month) as { s: number }
      ).s;
    },
    spendAllMonth(month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE strftime('%Y-%m', date)=?`,
          )
          .get(month) as { s: number }
      ).s;
    },
    installmentSpendMonth(month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE installment_group_id IS NOT NULL AND strftime('%Y-%m', date)=?`,
          )
          .get(month) as { s: number }
      ).s;
    },
    dashboardCategories(): Category[] {
      // Essenciais primeiro — é a ordem em que a pessoa lê "o que é obrigatório".
      return db
        .prepare(
          'SELECT * FROM categories WHERE active = 1 ORDER BY essential DESC, sort_order, id',
        )
        .all() as Category[];
    },
    countTransactions(month: string): number {
      return (
        db
          .prepare("SELECT COUNT(*) AS n FROM transactions WHERE strftime('%Y-%m', date) = ?")
          .get(month) as { n: number }
      ).n;
    },
    spendByCardDateRange(cardId: number, startExclusive: string, endInclusive: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE card_id=? AND date > ? AND date <= ?`,
          )
          .get(cardId, startExclusive, endInclusive) as { s: number }
      ).s;
    },
  };
}
