import type { InstallmentGroup, InstallmentPurchaseInput } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { InstallmentRepository } from '../../domain/ports';
import { addMonths } from '../../domain/services/dates';
import { validateInstallmentAmounts } from '../../domain/services/installmentSplit';
import { splitCents } from '../../domain/services/installments';
import type { Db } from '../db';

export function makeInstallmentRepository(db: Db): InstallmentRepository {
  function expand(id: number, p: InstallmentPurchaseInput): void {
    const insert =
      db.prepare(`INSERT INTO transactions (date,category_id,card_id,amount_cents,description,
      installment_group_id,installment_no,installment_total) VALUES (?,?,?,?,?,?,?,?)`);
    splitCents(p.total_cents, p.count).forEach((amount, i) => {
      insert.run(
        `${addMonths(p.first_month, i)}-01`,
        p.category_id,
        p.card_id,
        amount,
        p.description ?? '',
        id,
        i + 1,
        p.count,
      );
    });
  }
  return {
    createPurchase(p): number {
      validateInstallmentAmounts(p.total_cents, p.count);
      return db.transaction(() => {
        const result = db
          .prepare(`INSERT INTO installment_groups
          (description,total_cents,total_count,first_month,category_id,card_id,split_person_id,split_percent)
          VALUES (?,?,?,?,?,?,?,?)`)
          .run(
            p.description ?? '',
            p.total_cents,
            p.count,
            p.first_month,
            p.category_id,
            p.card_id,
            p.split_person_id ?? null,
            p.split_percent ?? null,
          );
        const id = Number(result.lastInsertRowid);
        expand(id, p);
        return id;
      })();
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
      validateInstallmentAmounts(p.total_cents, p.count);
      db.transaction(() => {
        const old = db.prepare('SELECT * FROM installment_groups WHERE id=?').get(id) as
          | InstallmentGroup
          | undefined;
        if (!old) throw new AppError(404, 'installment group not found');
        const person = p.split_person_id === undefined ? old.split_person_id : p.split_person_id;
        const percent = p.split_percent === undefined ? old.split_percent : p.split_percent;
        const financial =
          old.total_cents !== p.total_cents ||
          old.total_count !== p.count ||
          old.first_month !== p.first_month ||
          old.split_person_id !== person ||
          old.split_percent !== percent;
        if (financial) {
          const flags = db
            .prepare(`SELECT MAX(split_received) AS received,
            MAX(split_person_id IS NOT NULL) AS individual FROM transactions WHERE installment_group_id=?`)
            .get(id) as { received: number; individual: number };
          if (flags.received)
            throw new AppError(
              409,
              'Desmarque os recebimentos antes de alterar os valores ou a divisão da compra.',
            );
          if (flags.individual)
            throw new AppError(
              409,
              'Remova as divisões individuais das parcelas antes de alterar a compra.',
            );
        }
        db.prepare(`UPDATE installment_groups SET description=?,total_cents=?,total_count=?,first_month=?,
          category_id=?,card_id=?,split_person_id=?,split_percent=? WHERE id=?`).run(
          p.description ?? '',
          p.total_cents,
          p.count,
          p.first_month,
          p.category_id,
          p.card_id,
          person,
          percent,
          id,
        );
        if (financial) {
          db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(id);
          expand(id, p);
        } else {
          db.prepare(
            'UPDATE transactions SET description=?,category_id=?,card_id=? WHERE installment_group_id=?',
          ).run(p.description ?? '', p.category_id, p.card_id, id);
        }
      })();
    },
    payOffEarly(id, asOfMonth): void {
      const tx = db.transaction(() => {
        const exists = db.prepare('SELECT id FROM installment_groups WHERE id=?').get(id);
        if (!exists) throw new AppError(404, 'installment group not found');
        const r = db
          .prepare(
            `UPDATE transactions SET date=@date
           WHERE installment_group_id=@id AND strftime('%Y-%m', date) > @asOf`,
          )
          .run({ date: `${asOfMonth}-01`, id, asOf: asOfMonth });
        if (r.changes === 0) throw new AppError(400, 'no future parcelas to pay off');
      });
      tx();
    },
    listWithProgress(asOfMonth: string) {
      return db
        .prepare(
          `SELECT g.id, g.description, g.category_id, g.card_id,
                cat.name AS category_name, crd.name AS card_name,
                g.total_cents, g.total_count, g.first_month,
                g.split_person_id, g.split_percent, person.name AS split_person_name,
                COALESCE(MAX(t.split_person_id IS NOT NULL),0) AS has_individual_splits,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN 1 ELSE 0 END), 0) AS paid_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN 1 ELSE 0 END), 0) AS remaining_count,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) <= @asOf THEN t.amount_cents ELSE 0 END), 0) AS paid_cents,
                COALESCE(SUM(CASE WHEN strftime('%Y-%m', t.date) >  @asOf THEN t.amount_cents ELSE 0 END), 0) AS remaining_cents,
                COALESCE(MAX(t.amount_cents), 0) AS monthly_cents,
                MIN(CASE WHEN strftime('%Y-%m', t.date) > @asOf THEN strftime('%Y-%m', t.date) END) AS next_month
         FROM installment_groups g
         JOIN categories cat ON cat.id = g.category_id
         JOIN cards crd ON crd.id = g.card_id
         LEFT JOIN people person ON person.id = g.split_person_id
         LEFT JOIN transactions t ON t.installment_group_id = g.id
         GROUP BY g.id
         ORDER BY g.first_month, g.id`,
        )
        .all({ asOf: asOfMonth })
        .map((row: any) => ({
          ...row,
          has_individual_splits: !!row.has_individual_splits,
        })) as import('../../domain/entities').InstallmentProgress[];
    },
  };
}
