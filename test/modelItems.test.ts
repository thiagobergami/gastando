const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeModelItemRepository } = require('../src/infra/repositories/modelItems');

test('create + listByKind round-trips items, ordered by sort_order', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  const rows = repo.listByKind('income');
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Salário', 'Freelas'],
  );
});

test('listByKind never mixes income and fixed_cost', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000, sort_order: 0 });
  assert.equal(repo.listByKind('income').length, 1);
  assert.equal(repo.listByKind('fixed_cost').length, 1);
});

test('update changes name and amount but not kind', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const item = repo.create({
    kind: 'fixed_cost',
    name: 'Aluguel',
    amount_cents: 200000,
    sort_order: 0,
  });
  repo.update(item.id, { name: 'Aluguel + condomínio', amount_cents: 250000 });
  const [row] = repo.listByKind('fixed_cost');
  assert.equal(row.name, 'Aluguel + condomínio');
  assert.equal(row.amount_cents, 250000);
  assert.equal(row.kind, 'fixed_cost');
});

test('delete removes the row', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const item = repo.create({
    kind: 'income',
    name: 'Salário',
    amount_cents: 500000,
    sort_order: 0,
  });
  repo.delete(item.id);
  assert.equal(repo.listByKind('income').length, 0);
});

test('sumByKind sums only the requested kind, and is 0 when empty', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  assert.equal(repo.sumByKind('income'), 0);
  repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  repo.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000, sort_order: 0 });
  assert.equal(repo.sumByKind('income'), 650000);
  assert.equal(repo.sumByKind('fixed_cost'), 200000);
});

test('sumByKind reflects a delete on the next call', () => {
  const ctx = makeTestDb();
  const repo = makeModelItemRepository(ctx.db);
  const a = repo.create({ kind: 'income', name: 'Salário', amount_cents: 500000, sort_order: 0 });
  repo.create({ kind: 'income', name: 'Freelas', amount_cents: 150000, sort_order: 1 });
  assert.equal(repo.sumByKind('income'), 650000);
  repo.delete(a.id);
  assert.equal(repo.sumByKind('income'), 150000);
});

const { makeModelItemUseCases } = require('../src/application/use-cases/modelItems');

function ucFor(ctx) {
  return makeModelItemUseCases({ modelItems: makeModelItemRepository(ctx.db) });
}

test('use case create appends to the end of the sort order, per kind', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const a = uc.create({ kind: 'income', name: 'Salário', amount_cents: 500000 });
  const b = uc.create({ kind: 'income', name: 'Freelas', amount_cents: 150000 });
  assert.equal(a.sort_order, 0);
  assert.equal(b.sort_order, 1);
  assert.deepEqual(
    uc.list('income').map((i) => i.name),
    ['Salário', 'Freelas'],
  );
});

test('use case update edits the item in place', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const item = uc.create({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 200000 });
  uc.update(item.id, { name: 'Aluguel', amount_cents: 210000 });
  assert.equal(uc.list('fixed_cost')[0].amount_cents, 210000);
});

test('use case remove deletes the item', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const item = uc.create({ kind: 'income', name: 'Salário', amount_cents: 500000 });
  uc.remove(item.id);
  assert.equal(uc.list('income').length, 0);
});
