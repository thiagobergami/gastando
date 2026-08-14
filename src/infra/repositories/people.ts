import type { Person } from '../../domain/entities';
import type { PersonRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makePersonRepository(db: Db): PersonRepository {
  return {
    listAll(): Person[] {
      return db.prepare('SELECT * FROM people ORDER BY id').all() as Person[];
    },
    findById(id: number): Person | undefined {
      return db.prepare('SELECT * FROM people WHERE id=?').get(id) as Person | undefined;
    },
    insert(p) {
      const r = db.prepare('INSERT INTO people (name) VALUES (?)').run(p.name);
      return db.prepare('SELECT * FROM people WHERE id=?').get(r.lastInsertRowid) as Person;
    },
    update(id, p) {
      return db.prepare('UPDATE people SET name=?, active=? WHERE id=?').run(p.name, p.active, id)
        .changes;
    },
  };
}
