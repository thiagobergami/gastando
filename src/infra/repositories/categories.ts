import { type Category, NO_GROUP_ID } from '../../domain/entities';
import type { CategoryRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeCategoryRepository(db: Db): CategoryRepository {
  return {
    listAll(): Category[] {
      return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all() as Category[];
    },
    listActive(): Category[] {
      return db
        .prepare('SELECT * FROM categories WHERE active=1 ORDER BY sort_order, id')
        .all() as Category[];
    },
    listActiveIds(): number[] {
      // No ORDER BY — preserves the legacy GET /api/limits array ordering.
      return (db.prepare('SELECT id FROM categories WHERE active=1').all() as { id: number }[]).map(
        (r) => r.id,
      );
    },
    findById(id: number): Category | undefined {
      return db.prepare('SELECT * FROM categories WHERE id=?').get(id) as Category | undefined;
    },
    nextSortOrder(): number {
      return (
        db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE active=1')
          .get() as { n: number }
      ).n;
    },
    insert(c) {
      const r = db
        .prepare(
          'INSERT INTO categories (group_id, name, examples, sort_order, essential) VALUES (?, ?, ?, ?, ?)',
        )
        .run(NO_GROUP_ID, c.name, c.examples, c.sort_order, c.essential);
      return db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid) as Category;
    },
    update(id, c) {
      return db
        .prepare(
          'UPDATE categories SET name=?, examples=?, sort_order=?, active=?, essential=? WHERE id=?',
        )
        .run(c.name, c.examples, c.sort_order, c.active, c.essential, id).changes;
    },
    deactivate(id: number): number {
      return db.prepare('UPDATE categories SET active=0 WHERE id=?').run(id).changes;
    },
  };
}
