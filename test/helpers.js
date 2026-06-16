const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '001_schema.sql'), 'utf8');
  db.exec(schema);
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db.prepare(
    "INSERT INTO categories (group_id, name, sort_order) VALUES (?, 'Supermercado', 0)"
  ).run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  return { db, groupId: g.lastInsertRowid, categoryId: c.lastInsertRowid, cardId: card.lastInsertRowid };
}

module.exports = { makeTestDb };
