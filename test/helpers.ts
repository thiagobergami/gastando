import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from '../src/infra/db';

export interface TestContext {
  db: Db;
  groupId: number;
  categoryId: number;
  cardId: number;
}

export function makeTestDb(): TestContext {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && f !== '002_seed.sql')
    .sort();
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db
    .prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (?, 'Supermercado', 0)")
    .run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  return {
    db,
    groupId: Number(g.lastInsertRowid),
    categoryId: Number(c.lastInsertRowid),
    cardId: Number(card.lastInsertRowid),
  };
}
