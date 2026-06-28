import type { LimitRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeLimitRepository(db: Db): LimitRepository {
  return {
    resolve(categoryId: number, month: string): number {
      const row = db
        .prepare(
          `SELECT limit_cents FROM category_limits
         WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`,
        )
        .get(categoryId, month) as { limit_cents: number } | undefined;
      return row ? row.limit_cents : 0;
    },
    upsert(categoryId: number, month: string, limitCents: number): void {
      db.prepare(
        `INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, ?, ?)
         ON CONFLICT(category_id, month) DO UPDATE SET limit_cents=excluded.limit_cents`,
      ).run(categoryId, month, limitCents);
    },
    sumSpend(categoryId: number, month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE category_id=? AND strftime('%Y-%m', date)=?`,
          )
          .get(categoryId, month) as { s: number }
      ).s;
    },
    firstTxMonth(categoryId: number): string | null {
      return (
        db
          .prepare(`SELECT MIN(strftime('%Y-%m', date)) AS m FROM transactions WHERE category_id=?`)
          .get(categoryId) as { m: string | null }
      ).m;
    },
  };
}
