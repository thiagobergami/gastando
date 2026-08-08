import type { MonthlyModel } from '../../domain/entities';
import type { MonthlyModelRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeMonthlyModelRepository(db: Db): MonthlyModelRepository {
  return {
    findExact(month: string): MonthlyModel | undefined {
      return db.prepare('SELECT * FROM monthly_model WHERE month=?').get(month) as
        | MonthlyModel
        | undefined;
    },
    // Mesma regra de `limits.resolve`: a linha mais recente que não é do futuro.
    findAtOrBefore(month: string): MonthlyModel | undefined {
      return db
        .prepare('SELECT * FROM monthly_model WHERE month<=? ORDER BY month DESC LIMIT 1')
        .get(month) as MonthlyModel | undefined;
    },
    upsert(m: MonthlyModel): void {
      db.prepare(
        `INSERT INTO monthly_model (month, income_cents, fixed_costs_cents, savings_goal_cents)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           income_cents=excluded.income_cents,
           fixed_costs_cents=excluded.fixed_costs_cents,
           savings_goal_cents=excluded.savings_goal_cents`,
      ).run(m.month, m.income_cents, m.fixed_costs_cents, m.savings_goal_cents);
    },
  };
}
