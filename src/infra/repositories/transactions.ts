import type { Receivable, SplitConfig, Transaction } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { TransactionFilter, TransactionPage, TransactionRepository } from '../../domain/ports';
import { allocateInstallmentSplit } from '../../domain/services/installmentSplit';
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
  function groupSplit(id: number): SplitConfig | undefined {
    return db
      .prepare('SELECT split_person_id,split_percent FROM installment_groups WHERE id=?')
      .get(id) as SplitConfig | undefined;
  }
  function resolve(row: Transaction | undefined): Transaction | undefined {
    if (!row?.installment_group_id) return row;
    const config = groupSplit(row.installment_group_id);
    return config?.split_person_id ? { ...row, ...config, shared_installment: true } : row;
  }
  function assertChildWritable(id: number): Transaction | undefined {
    const row = db.prepare('SELECT * FROM transactions WHERE id=?').get(id) as
      | Transaction
      | undefined;
    if (row?.installment_group_id) {
      const config = groupSplit(row.installment_group_id);
      if (config?.split_person_id)
        throw new AppError(409, 'Edite ou exclua a compra inteira, não uma parcela compartilhada.');
    }
    return row;
  }
  return {
    list(p: TransactionPage): Transaction[] {
      const { clause, args } = buildWhere(p);
      let sql = `SELECT * FROM transactions ${clause} ORDER BY date DESC, id DESC`;
      const a = [...args];
      if (p.limit !== null && p.limit !== undefined) {
        sql += ' LIMIT ? OFFSET ?';
        a.push(p.limit, p.offset ?? 0);
      }
      return (db.prepare(sql).all(...a) as Transaction[]).map((row) => resolve(row) as Transaction);
    },
    count(f: TransactionFilter): number {
      const { clause, args } = buildWhere(f);
      return (
        db.prepare(`SELECT COUNT(*) AS n FROM transactions ${clause}`).get(...args) as { n: number }
      ).n;
    },
    findById(id: number): Transaction | undefined {
      return resolve(
        db.prepare('SELECT * FROM transactions WHERE id=?').get(id) as Transaction | undefined,
      );
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
      return db.transaction(() => {
        const old = assertChildWritable(id);
        let received = 0;
        if (old?.installment_group_id && old.split_received) {
          const financial =
            old.amount_cents !== t.amount_cents ||
            old.date !== t.date ||
            old.split_person_id !== (t.split_person_id ?? null) ||
            old.split_percent !== (t.split_percent ?? null);
          if (financial)
            throw new AppError(409, 'Desmarque o recebimento antes de alterar esta parcela.');
          received = old.split_received;
        }
        return db
          .prepare(`UPDATE transactions SET date=?,category_id=?,card_id=?,amount_cents=?,
          description=?,split_person_id=?,split_percent=?,split_received=? WHERE id=?`)
          .run(
            t.date,
            t.category_id,
            t.card_id,
            t.amount_cents,
            t.description,
            t.split_person_id ?? null,
            t.split_percent ?? null,
            received,
            id,
          ).changes;
      })();
    },
    remove(id: number): number {
      return db.transaction(() => {
        const row = assertChildWritable(id);
        if (row?.installment_group_id && row.split_received && row.split_person_id) {
          throw new AppError(409, 'Desmarque o recebimento antes de excluir esta parcela.');
        }
        return db.prepare('DELETE FROM transactions WHERE id=?').run(id).changes;
      })();
    },
    firstByGroup(groupId: number): Transaction | undefined {
      return resolve(
        db
          .prepare(
            'SELECT * FROM transactions WHERE installment_group_id=? ORDER BY installment_no LIMIT 1',
          )
          .get(groupId) as Transaction | undefined,
      );
    },
    setSplitReceived(id, received) {
      db.prepare('UPDATE transactions SET split_received=? WHERE id=?').run(received ? 1 : 0, id);
    },
    listReceivables() {
      const rows = db
        .prepare(`SELECT t.*,g.split_person_id AS group_person_id,
        g.split_percent AS group_percent,p.name AS person_name
        FROM transactions t LEFT JOIN installment_groups g ON g.id=t.installment_group_id
        JOIN people p ON p.id=COALESCE(g.split_person_id,t.split_person_id)
        ORDER BY t.installment_group_id,t.installment_no,t.id`)
        .all() as Array<
        Transaction & {
          group_person_id: number | null;
          group_percent: number | null;
          person_name: string;
        }
      >;
      const shared = new Map<number, typeof rows>();
      for (const row of rows) {
        if (row.group_person_id && row.installment_group_id) {
          const group = shared.get(row.installment_group_id) ?? [];
          group.push(row);
          shared.set(row.installment_group_id, group);
        }
      }
      const allocated = new Map<number, number>();
      for (const group of shared.values()) {
        const amounts = allocateInstallmentSplit(
          group.map((r) => r.amount_cents),
          group[0].group_percent as number,
        );
        group.forEach((r, i) => {
          allocated.set(r.id, amounts[i]);
        });
      }
      return rows
        .map(
          (r): Receivable => ({
            transaction_id: r.id,
            person_id: (r.group_person_id ?? r.split_person_id) as number,
            person_name: r.person_name,
            description: r.description,
            month: r.date.slice(0, 7),
            amount_cents:
              allocated.get(r.id) ??
              Math.round((r.amount_cents * (r.split_percent as number)) / 100),
            received: r.split_received,
            installment_group_id: r.installment_group_id,
            installment_no: r.installment_no,
            installment_total: r.installment_total,
          }),
        )
        .filter((r) => r.amount_cents > 0);
    },
  };
}
