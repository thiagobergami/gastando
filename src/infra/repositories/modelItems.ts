import type { ModelItem } from '../../domain/entities';
import type { ModelItemRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeModelItemRepository(db: Db): ModelItemRepository {
  return {
    listByKind(kind): ModelItem[] {
      return db
        .prepare('SELECT * FROM model_items WHERE kind=? ORDER BY sort_order, id')
        .all(kind) as ModelItem[];
    },
    create(item) {
      const r = db
        .prepare(
          'INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES (?, ?, ?, ?)',
        )
        .run(item.kind, item.name, item.amount_cents, item.sort_order);
      return db.prepare('SELECT * FROM model_items WHERE id=?').get(r.lastInsertRowid) as ModelItem;
    },
    update(id, item) {
      db.prepare('UPDATE model_items SET name=?, amount_cents=? WHERE id=?').run(
        item.name,
        item.amount_cents,
        id,
      );
    },
    delete(id) {
      db.prepare('DELETE FROM model_items WHERE id=?').run(id);
    },
    sumByKind(kind) {
      const row = db
        .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM model_items WHERE kind=?')
        .get(kind) as { total: number };
      return row.total;
    },
  };
}
