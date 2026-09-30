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
    carriesForward(categoryId: number, month: string): boolean {
      const row = db
        .prepare(
          'SELECT carry_forward FROM category_carry_decisions WHERE category_id=? AND month=?',
        )
        .get(categoryId, month) as { carry_forward: number } | undefined;
      return row?.carry_forward === 1;
    },
    setCarryForward(categoryId: number, month: string, enabled: boolean): void {
      db.prepare(
        `INSERT INTO category_carry_decisions (category_id, month, carry_forward)
         VALUES (?, ?, ?)
         ON CONFLICT(category_id, month) DO UPDATE SET carry_forward=excluded.carry_forward`,
      ).run(categoryId, month, enabled ? 1 : 0);
    },
  };
}
