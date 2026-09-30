const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIGRATIONS = path.join(__dirname, '..', 'migrations');

// Roda as migrações, na ordem, num banco em memória — como o runner real.
// `002_seed.sql` fica de fora pelo mesmo motivo que em test/helpers.ts: ele
// semeia dados, e um teste de schema não deve depender de quantos.
// `seedBefore` diz em que ponto da fila o `seedFn` roda, para que cada teste
// possa montar o estado que a sua migração encontra.
function migrate(
  seedFn?: (db: InstanceType<typeof Database>) => void,
  seedBefore = '006_category_essential.sql',
) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith('.sql') && f !== '002_seed.sql')
    .sort();
  for (const f of files) {
    if (f === seedBefore && seedFn) seedFn(db);
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

const DEFAULTS = [
  { name: 'Mercado', essential: 1 },
  { name: 'Transporte', essential: 1 },
  { name: 'Moradia & Contas', essential: 1 },
  { name: 'Saúde', essential: 1 },
  { name: 'Assinaturas', essential: 1 },
  { name: 'Restaurantes & Delivery', essential: 0 },
  { name: 'Lazer', essential: 0 },
  { name: 'Outros', essential: 0 },
];

test('a fresh database gets exactly the eight default categories', () => {
  const db = migrate();
  const rows = db
    .prepare('SELECT name, essential FROM categories WHERE active = 1 ORDER BY sort_order')
    .all();
  assert.deepEqual(rows, DEFAULTS);
});

test('the seed ships no personal data: no cards, no limits, no income', () => {
  const db = migrate();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_limits').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categories WHERE examples <> ''").get().n, 0);
});

test('the default seed never touches a database that already has categories', () => {
  const db = migrate((d) => {
    d.prepare(
      "INSERT INTO groups (id, name, color, sort_order) VALUES (7, 'Meu grupo', 'sage', 1)",
    ).run();
    d.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (7, 'Pet', 1)").run();
  });
  const rows = db.prepare('SELECT name FROM categories').all();
  assert.deepEqual(rows, [{ name: 'Pet' }]);
});

test('008 creates monthly_model keyed by month', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(monthly_model)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['month', 'income_cents', 'fixed_costs_cents', 'savings_goal_cents'],
  );
  assert.equal(cols.find((c: { name: string }) => c.name === 'month').pk, 1);
});

const CONFIGURED = (d: InstanceType<typeof Database>) => {
  d.prepare("INSERT INTO settings (key, value) VALUES ('monthly_income', '1200000')").run();
  d.prepare("INSERT INTO settings (key, value) VALUES ('fixed_costs', '386000')").run();
  d.prepare("INSERT INTO settings (key, value) VALUES ('savings_goal', '250000')").run();
};

test('008 seeds the current model for whoever already configured one', () => {
  const db = migrate(CONFIGURED, '008_monthly_model.sql');
  const rows = db.prepare('SELECT * FROM monthly_model').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].income_cents, 1200000);
  assert.equal(rows[0].fixed_costs_cents, 386000);
  assert.equal(rows[0].savings_goal_cents, 250000);
  // Sem lançamentos, o primeiro mês registrado é o mês corrente.
  assert.equal(rows[0].month, new Date().toISOString().slice(0, 7));
});

// O teste que justifica a âncora. Sem ele, todo mês anterior ao upgrade
// continuaria resolvendo por `settings`, e mudar a renda hoje seguiria
// reescrevendo o histórico — o bug do §A.2, vivo para quem já usa o app.
test('008 anchors the seeded row at the first month the user ever recorded', () => {
  const db = migrate((d) => {
    CONFIGURED(d);
    d.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
    for (const date of ['2026-01-10', '2026-04-02', '2026-07-30']) {
      d.prepare(
        'INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?, 1, 1, 5000)',
      ).run(date);
    }
  }, '008_monthly_model.sql');
  assert.equal(db.prepare('SELECT month FROM monthly_model').get().month, '2026-01');
});

test('008 never anchors in the future, even with a future-dated transaction', () => {
  const db = migrate((d) => {
    CONFIGURED(d);
    d.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
    d.prepare(
      "INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES ('2099-01-10', 1, 1, 5000)",
    ).run();
  }, '008_monthly_model.sql');
  assert.equal(
    db.prepare('SELECT month FROM monthly_model').get().month,
    new Date().toISOString().slice(0, 7),
  );
});

test('008 seeds nothing when the model was never configured', () => {
  const db = migrate();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_model').get().n, 0);
});

test('009 creates model_items with a kind check constraint', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(model_items)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['id', 'kind', 'name', 'amount_cents', 'sort_order'],
  );
  assert.throws(() => {
    db.prepare("INSERT INTO model_items (kind, name, amount_cents) VALUES ('bogus', 'x', 0)").run();
  }, /CHECK constraint failed/);
});

test('009 accepts income and fixed_cost rows', () => {
  const db = migrate();
  db.prepare(
    "INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES ('income', 'Salário', 500000, 0)",
  ).run();
  db.prepare(
    "INSERT INTO model_items (kind, name, amount_cents, sort_order) VALUES ('fixed_cost', 'Aluguel', 200000, 0)",
  ).run();
  const rows = db.prepare('SELECT kind, name FROM model_items ORDER BY kind').all();
  assert.deepEqual(rows, [
    { kind: 'fixed_cost', name: 'Aluguel' },
    { kind: 'income', name: 'Salário' },
  ]);
});

test('009 starts empty, even for a database that already had a configured model', () => {
  const db = migrate(CONFIGURED, '008_monthly_model.sql');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM model_items').get().n, 0);
});

test('010 creates people with active defaulting to 1', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(people)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['id', 'name', 'active'],
  );
  const active = cols.find((c: { name: string }) => c.name === 'active');
  assert.equal(active.notnull, 1);
  assert.equal(active.dflt_value, '1');
});

test('010 adds split columns to transactions, split_received defaulting to 0', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(transactions)').all();
  const names = cols.map((c: { name: string }) => c.name);
  assert.ok(names.includes('split_person_id'));
  assert.ok(names.includes('split_percent'));
  assert.ok(names.includes('split_received'));
  const received = cols.find((c: { name: string }) => c.name === 'split_received');
  assert.equal(received.notnull, 1);
  assert.equal(received.dflt_value, '0');
});

test('010 a transaction can reference a person as its split', () => {
  const db = migrate();
  db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  db.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (1, 'Mercado', 0)").run();
  db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  const p = db.prepare("INSERT INTO people (name) VALUES ('Fulano')").run();
  db.prepare(
    `INSERT INTO transactions (date, category_id, card_id, amount_cents, description, split_person_id, split_percent)
     VALUES ('2026-06-10', 1, 1, 10000, 'Jantar', ?, 50)`,
  ).run(p.lastInsertRowid);
  const row = db
    .prepare('SELECT split_person_id, split_percent, split_received FROM transactions WHERE id=1')
    .get();
  assert.deepEqual(row, {
    split_person_id: Number(p.lastInsertRowid),
    split_percent: 50,
    split_received: 0,
  });
});

test('012 adds a constrained group split and preserves existing transactions', () => {
  const { db, categoryId, cardId, personId } = require('./helpers').makeTestDb();
  const cols = db.prepare('PRAGMA table_info(installment_groups)').all();
  assert.ok(cols.some((c) => c.name === 'split_person_id'));
  const id = db
    .prepare(
      'INSERT INTO installment_groups (description,total_cents,total_count,first_month,category_id,card_id) VALUES (?,?,?,?,?,?)',
    )
    .run('TV', 100, 3, '2026-09', categoryId, cardId).lastInsertRowid;
  assert.equal(
    db.prepare('SELECT split_percent FROM installment_groups WHERE id=?').get(id).split_percent,
    null,
  );
  assert.throws(() =>
    db.prepare('UPDATE installment_groups SET split_percent=50 WHERE id=?').run(id),
  );
  assert.throws(() =>
    db
      .prepare('UPDATE installment_groups SET split_person_id=?,split_percent=100 WHERE id=?')
      .run(personId, id),
  );
  assert.throws(() =>
    db
      .prepare('UPDATE installment_groups SET split_person_id=?,split_percent=50.5 WHERE id=?')
      .run(personId, id),
  );
  assert.throws(() =>
    db
      .prepare('UPDATE installment_groups SET split_person_id=999,split_percent=50 WHERE id=?')
      .run(id),
  );
  db.prepare('UPDATE installment_groups SET split_person_id=?,split_percent=50 WHERE id=?').run(
    personId,
    id,
  );
});
