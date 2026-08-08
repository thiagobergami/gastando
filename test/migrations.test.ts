const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIGRATIONS = path.join(__dirname, '..', 'migrations');

// Roda as migrações, na ordem, num banco em memória — como o runner real.
// `002_seed.sql` fica de fora pelo mesmo motivo que em test/helpers.ts: ele
// semeia dados, e um teste de schema não deve depender de quantos.
function migrate(seedFn?: (db: InstanceType<typeof Database>) => void) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith('.sql') && f !== '002_seed.sql')
    .sort();
  for (const f of files) {
    if (f === '006_category_essential.sql' && seedFn) seedFn(db);
    db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  return db;
}

test('006 adds essential defaulting to 0', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(categories)').all();
  const essential = cols.find((c: { name: string }) => c.name === 'essential');
  assert.ok(essential, 'categories.essential should exist');
  assert.equal(essential.notnull, 1);
  assert.equal(essential.dflt_value, '0');
});

test('006 backfills essential from the legacy "Essenciais" group', () => {
  const db = migrate((d) => {
    d.prepare(
      "INSERT INTO groups (id, name, color, sort_order) VALUES (7, 'Essenciais / semi-fixos', 'sage', 1)",
    ).run();
    d.prepare(
      "INSERT INTO groups (id, name, color, sort_order) VALUES (8, 'Estilo de vida', 'gold', 2)",
    ).run();
    d.prepare(
      "INSERT INTO categories (group_id, name, sort_order) VALUES (7, 'Supermercado', 1)",
    ).run();
    d.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (8, 'Jogos', 2)").run();
  });
  const rows = db.prepare('SELECT name, essential FROM categories ORDER BY name').all();
  assert.deepEqual(rows, [
    { name: 'Jogos', essential: 0 },
    { name: 'Supermercado', essential: 1 },
  ]);
});

test('006 creates the invisible sentinel group with id 0', () => {
  const db = migrate();
  const g = db.prepare('SELECT id, name, active FROM groups WHERE id = 0').get();
  assert.deepEqual(g, { id: 0, name: 'Sem grupo', active: 0 });
});
