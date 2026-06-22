import type { Db } from '../db';
import type { InstallmentRepository } from '../../domain/ports';
import { splitCents } from '../../domain/services/installments';
import { addMonths } from '../../domain/services/dates';
import { AppError } from '../../domain/errors';

export function makeInstallmentRepository(db: Db): InstallmentRepository {
  return {
    createPurchase(p): number {
      const { category_id, card_id, description = '', total_cents, count, first_month } = p;
      const tx = db.transaction(() => {
        const g = db.prepare(
          `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(description, total_cents, count, first_month, category_id, card_id);
        const groupId = g.lastInsertRowid as number;
        const amounts = splitCents(total_cents, count);
        const insert = db.prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
            installment_group_id, installment_no, installment_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
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
  };
}
