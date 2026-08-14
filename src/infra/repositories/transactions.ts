import type { Transaction } from '../../domain/entities';
import type { TransactionFilter, TransactionPage, TransactionRepository } from '../../domain/ports';
import type { Db } from '../db';

function buildWhere(f: TransactionFilter): { clause: string; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.month !== undefined) {
    where.push("strftime('%Y-%m', date) = ?");
    args.push(f.month);
  }
  if (f.categoryId !== undefined) {
    where.push('category_id = ?');
    args.push(f.categoryId);
  }
  if (f.cardId !== undefined) {
    where.push('card_id = ?');
    args.push(f.cardId);
  }
  if (f.q !== undefined && f.q !== '') {
    where.push('description LIKE ?');
    args.push(`%${f.q}%`);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

export function makeTransactionRepository(db: Db): TransactionRepository {
  return {
    list(p: TransactionPage): Transaction[] {
      const { clause, args } = buildWhere(p);
      let sql = `SELECT * FROM transactions ${clause} ORDER BY date DESC, id DESC`;
      const a = [...args];
      if (p.limit !== null && p.limit !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        a.push(p.limit, p.offset ?? 0);
      }
      return db.prepare(sql).all(...a) as Transaction[];
    },
    count(f: TransactionFilter): number {
      const { clause, args } = buildWhere(f);
      return (
        db.prepare(`SELECT COUNT(*) AS n FROM transactions ${clause}`).get(...args) as { n: number }
      ).n;
    },
    findById(id: number): Transaction | undefined {
      return db.prepare('SELECT * FROM transactions WHERE id=?').get(id) as Transaction | undefined;
    },
    insert(t) {
      const r = db
        .prepare(
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, split_person_id, split_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          t.date,
          t.category_id,
          t.card_id,
          t.amount_cents,
          t.description,
          t.split_person_id ?? null,
          t.split_percent ?? null,
        );
      return db
        .prepare('SELECT * FROM transactions WHERE id=?')
        .get(r.lastInsertRowid) as Transaction;
    },
    update(id, t) {
      // split_received is unconditionally reset to 0: any edit to a transaction
      // invalidates a prior "received" confirmation, since the debt it was
      // confirmed against may no longer match (amount/percent/person changed).
      // Harmless for transactions with no split — the field is irrelevant there.
      return db
        .prepare(
          `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=?, split_person_id=?, split_percent=?, split_received=0 WHERE id=?`,
        )
        .run(
          t.date,
          t.category_id,
          t.card_id,
          t.amount_cents,
          t.description,
          t.split_person_id ?? null,
          t.split_percent ?? null,
          id,
        ).changes;
    },
    remove(id: number): number {
      return db.prepare('DELETE FROM transactions WHERE id=?').run(id).changes;
    },
    firstByGroup(groupId: number): Transaction | undefined {
      return db
        .prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1')
        .get(groupId) as Transaction | undefined;
    },
    setSplitReceived(id, received) {
      db.prepare('UPDATE transactions SET split_received=? WHERE id=?').run(received ? 1 : 0, id);
    },
    listReceivables() {
      return db
        .prepare(
          `SELECT
             t.id AS transaction_id,
             t.split_person_id AS person_id,
             p.name AS person_name,
             t.description,
             strftime('%Y-%m', t.date) AS month,
             CAST(ROUND(t.amount_cents * t.split_percent / 100.0) AS INTEGER) AS amount_cents,
             t.split_received AS received
           FROM transactions t
           JOIN people p ON p.id = t.split_person_id
           ORDER BY t.date DESC, t.id DESC`,
        )
        .all() as Array<{
        transaction_id: number;
        person_id: number;
        person_name: string;
        description: string;
        month: string;
        amount_cents: number;
        received: number;
      }>;
    },
  };
}
