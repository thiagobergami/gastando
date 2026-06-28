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
          `INSERT INTO transactions (date, category_id, card_id, amount_cents, description)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(t.date, t.category_id, t.card_id, t.amount_cents, t.description);
      return db
        .prepare('SELECT * FROM transactions WHERE id=?')
        .get(r.lastInsertRowid) as Transaction;
    },
    update(id, t) {
      return db
        .prepare(
          `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=? WHERE id=?`,
        )
        .run(t.date, t.category_id, t.card_id, t.amount_cents, t.description, id).changes;
    },
    remove(id: number): number {
      return db.prepare('DELETE FROM transactions WHERE id=?').run(id).changes;
    },
    firstByGroup(groupId: number): Transaction | undefined {
      return db
        .prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1')
        .get(groupId) as Transaction | undefined;
    },
  };
}
