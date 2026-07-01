import type { Category } from '../../domain/entities';
import type { ReportRepository } from '../../domain/ports';
import type { Db } from '../db';

type DashboardCategoryRow = Category & {
  group_name: string;
  group_color: string;
  group_sort: number;
};

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
    spendByGroupMonth(groupId: number, month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(t.amount_cents),0) AS s FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE c.group_id=? AND strftime('%Y-%m', t.date)=?`,
          )
          .get(groupId, month) as { s: number }
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
    dashboardCategories(): DashboardCategoryRow[] {
      return db
        .prepare(
          `SELECT c.id, c.name, c.group_id, c.examples, g.name AS group_name, g.color AS group_color, g.sort_order AS group_sort
         FROM categories c JOIN groups g ON g.id = c.group_id
         WHERE c.active = 1 ORDER BY g.sort_order, c.sort_order, c.id`,
        )
        .all() as DashboardCategoryRow[];
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
