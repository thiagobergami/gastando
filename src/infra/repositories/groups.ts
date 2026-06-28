import type { Db } from '../db';
import type { Group } from '../../domain/entities';
import type { GroupRepository } from '../../domain/ports';

export function makeGroupRepository(db: Db): GroupRepository {
  return {
    listActive(): Group[] {
      return db
        .prepare('SELECT * FROM groups WHERE active=1 ORDER BY sort_order, id')
        .all() as Group[];
    },
    listAll(): Group[] {
      return db.prepare('SELECT * FROM groups ORDER BY sort_order, id').all() as Group[];
    },
    findById(id: number): Group | undefined {
      return db.prepare('SELECT * FROM groups WHERE id=?').get(id) as Group | undefined;
    },
    findActiveById(id: number): Group | undefined {
      return db.prepare('SELECT * FROM groups WHERE id=? AND active=1').get(id) as
        | Group
        | undefined;
    },
    nextSortOrder(): number {
      return (
        db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM groups WHERE active=1')
          .get() as { n: number }
      ).n;
    },
    insert(g) {
      const r = db
        .prepare('INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)')
        .run(g.name, g.color, g.sort_order);
      return db.prepare('SELECT * FROM groups WHERE id=?').get(r.lastInsertRowid) as Group;
    },
    update(id, g) {
      return db
        .prepare('UPDATE groups SET name=?, color=?, sort_order=? WHERE id=? AND active=1')
        .run(g.name, g.color, g.sort_order, id).changes;
    },
    countActiveCategories(groupId: number): number {
      return (
        db
          .prepare('SELECT COUNT(*) AS n FROM categories WHERE group_id=? AND active=1')
          .get(groupId) as { n: number }
      ).n;
    },
    deactivate(id: number): number {
      return db.prepare('UPDATE groups SET active=0 WHERE id=? AND active=1').run(id).changes;
    },
  };
}
