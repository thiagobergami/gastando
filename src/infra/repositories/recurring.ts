import type { RecurringTemplate } from '../../domain/entities';
import type { RecurringRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeRecurringRepository(db: Db): RecurringRepository {
  return {
    list() {
      return db
        .prepare('SELECT * FROM recurring_templates ORDER BY id')
        .all() as RecurringTemplate[];
    },
    listActive() {
      return db
        .prepare('SELECT * FROM recurring_templates WHERE active=1 ORDER BY id')
        .all() as RecurringTemplate[];
    },
    findById(id) {
      return db.prepare('SELECT * FROM recurring_templates WHERE id=?').get(id) as
        | RecurringTemplate
        | undefined;
    },
    insert(t) {
      const r = db
        .prepare(
          `INSERT INTO recurring_templates (description, category_id, card_id, amount_cents, day_of_month)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(t.description, t.category_id, t.card_id, t.amount_cents, t.day_of_month);
      return db
        .prepare('SELECT * FROM recurring_templates WHERE id=?')
        .get(r.lastInsertRowid) as RecurringTemplate;
    },
    update(id, t) {
      return db
        .prepare(
          `UPDATE recurring_templates SET description=?, category_id=?, card_id=?, amount_cents=?, day_of_month=?, active=? WHERE id=?`,
        )
        .run(t.description, t.category_id, t.card_id, t.amount_cents, t.day_of_month, t.active, id)
        .changes;
    },
    deactivate(id) {
      return db.prepare('UPDATE recurring_templates SET active=0 WHERE id=?').run(id).changes;
    },
    findChargeForMonth(templateId, month) {
      const row = db
        .prepare(
          `SELECT 1 FROM transactions WHERE recurring_template_id=? AND strftime('%Y-%m', date)=? LIMIT 1`,
        )
        .get(templateId, month);
      return row !== undefined;
    },
    insertCharge(c) {
      const r = db
        .prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, recurring_template_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(c.date, c.category_id, c.card_id, c.amount_cents, c.description, c.template_id);
      return r.lastInsertRowid as number;
    },
    lastChargeAmountBefore(templateId, month) {
      const row = db
        .prepare(
          `SELECT amount_cents FROM transactions
         WHERE recurring_template_id=? AND strftime('%Y-%m', date) < ?
         ORDER BY date DESC LIMIT 1`,
        )
        .get(templateId, month) as { amount_cents: number } | undefined;
      return row ? row.amount_cents : null;
    },
  };
}
