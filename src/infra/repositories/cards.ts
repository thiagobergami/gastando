import type { Card } from '../../domain/entities';
import type { CardRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeCardRepository(db: Db): CardRepository {
  return {
    listAll(): Card[] {
      return db.prepare('SELECT * FROM cards ORDER BY id').all() as Card[];
    },
    findById(id: number): Card | undefined {
      return db.prepare('SELECT * FROM cards WHERE id=?').get(id) as Card | undefined;
    },
    insert(c) {
      const r = db.prepare('INSERT INTO cards (name) VALUES (?)').run(c.name);
      return db.prepare('SELECT * FROM cards WHERE id=?').get(r.lastInsertRowid) as Card;
    },
    update(id, c) {
      return db.prepare('UPDATE cards SET name=?, active=? WHERE id=?').run(c.name, c.active, id)
        .changes;
    },
    deactivate(id: number): number {
      return db.prepare('UPDATE cards SET active=0 WHERE id=?').run(id).changes;
    },
  };
}
