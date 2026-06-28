import { AppError } from '../../domain/errors';
import type { InstallmentRepository } from '../../domain/ports';
import { addMonths } from '../../domain/services/dates';
import { splitCents } from '../../domain/services/installments';
import type { Db } from '../db';

export function makeInstallmentRepository(db: Db): InstallmentRepository {
  return {
    createPurchase(p): number {
      const { category_id, card_id, description = '', total_cents, count, first_month } = p;
      const tx = db.transaction(() => {
        const g = db
          .prepare(
            `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(description, total_cents, count, first_month, category_id, card_id);
        const groupId = g.lastInsertRowid as number;
        const amounts = splitCents(total_cents, count);
        const insert = db.prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
            installment_group_id, installment_no, installment_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        amounts.forEach((amt, i) => {
          const month = addMonths(first_month, i);
          insert.run(`${month}-01`, category_id, card_id, amt, description, groupId, i + 1, count);
        });
        return groupId;
      });
      return tx();
    },
    remove(id: number): void {
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
        const r = db.prepare('DELETE FROM installment_groups WHERE id=?').run(id);
        if (r.changes === 0) throw new AppError(404, 'installment group not found');
      });
      tx();
    },
    update(id, p): void {
      const { category_id, card_id, description = '', total_cents, count, first_month } = p;
      const tx = db.transaction(() => {
        const exists = db.prepare('SELECT id FROM installment_groups WHERE id=?').get(id);
        if (!exists) throw new AppError(404, 'installment group not found');
        db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
        db.prepare(
          `UPDATE installment_groups
           SET description=?, total_cents=?, total_count=?, first_month=?, category_id=?, card_id=?
           WHERE id=?`,
        ).run(description, total_cents, count, first_month, category_id, card_id, id);
        const amounts = splitCents(total_cents, count);
        const insert = db.prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
            installment_group_id, installment_no, installment_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        amounts.forEach((amt, i) => {
          const month = addMonths(first_month, i);
          insert.run(`${month}-01`, category_id, card_id, amt, description, id, i + 1, count);
        });
      });
      tx();
    },
    listWithProgress(asOfMonth: string) {
      return db
        .prepare(
          `SELECT g.id, g.description, g.category_id, g.card_id,
                cat.name AS category_name, crd.name AS card_name,
                g.total_cents, g.total_count, g.first_month,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN 1 ELSE 0 END), 0) AS paid_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN 1 ELSE 0 END), 0) AS remaining_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN t.amount_cents ELSE 0 END), 0) AS paid_cents,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN t.amount_cents ELSE 0 END), 0) AS remaining_cents,
                COALESCE(MAX(t.amount_cents), 0) AS monthly_cents,
                MIN(CASE WHEN strftime('%Y-%m', t.date) > @asOf THEN strftime('%Y-%m', t.date) END) AS next_month
         FROM installment_groups g
         JOIN categories cat ON cat.id = g.category_id
         JOIN cards crd ON crd.id = g.card_id
         LEFT JOIN transactions t ON t.installment_group_id = g.id
         GROUP BY g.id
         ORDER BY g.first_month, g.id`,
        )
        .all({ asOf: asOfMonth }) as import('../../domain/entities').InstallmentProgress[];
    },
  };
}
