const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeRecurringRepository } = require('../src/infra/repositories/recurring');
const { makeRecurringUseCases } = require('../src/application/use-cases/recurring');
const { makeCategoryRepository } = require('../src/infra/repositories/categories');
const { makeCardRepository } = require('../src/infra/repositories/cards');

test('insert + list round-trips a template', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Claude',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    day_of_month: 5,
  });
  assert.equal(t.description, 'Claude');
  assert.equal(repo.list().length, 1);
  assert.equal(repo.listActive().length, 1);
});

test('charge dedup + last-amount lookup', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Disney',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 4000,
    day_of_month: 1,
  });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), false);
  repo.insertCharge({
    template_id: t.id,
    date: '2026-05-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 3500,
    description: 'Disney',
  });
  assert.equal(repo.lastChargeAmountBefore(t.id, '2026-06'), 3500);
  repo.insertCharge({
    template_id: t.id,
    date: '2026-06-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 4000,
    description: 'Disney',
  });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), true);
});

function ucFor(ctx) {
  return makeRecurringUseCases({
    recurring: makeRecurringRepository(ctx.db),
    categories: makeCategoryRepository(ctx.db),
    cards: makeCardRepository(ctx.db),
  });
}

test('materialize creates one charge per active template and is idempotent', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Apple',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 1990,
    day_of_month: 10,
  });
  const uc = ucFor(ctx);
  const r1 = uc.materialize('2026-06');
  assert.deepEqual(r1.created, [t.id]);
  const r2 = uc.materialize('2026-06'); // second run: nothing new
  assert.deepEqual(r2.created, []);
  assert.deepEqual(r2.skipped, [t.id]);
  const row = ctx.db
    .prepare('SELECT date FROM transactions WHERE recurring_template_id=?')
    .get(t.id);
  assert.equal(row.date, '2026-06-10');
});

test('materialize flags an amount change vs the prior month', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Seguro',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 5000,
    day_of_month: 1,
  });
  repo.insertCharge({
    template_id: t.id,
    date: '2026-05-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 4500,
    description: 'Seguro',
  });
  const r = ucFor(ctx).materialize('2026-06');
  assert.deepEqual(r.changed, [{ template_id: t.id, from_cents: 4500, to_cents: 5000 }]);
});

const request = require('supertest');
const { createApp } = require('../src/app');

test('recurring CRUD + materialize over HTTP', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app)
    .post('/api/recurring')
    .send({
      description: 'Netflix',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 4590,
      day_of_month: 15,
    })
    .expect(201);
  assert.equal((await request(app).get('/api/recurring').expect(200)).body.length, 1);
  const res = await request(app)
    .post('/api/recurring/materialize')
    .send({ month: '2026-06' })
    .expect(200);
  assert.deepEqual(res.body.created, [made.body.id]);
  await request(app).delete(`/api/recurring/${made.body.id}`).expect(204);
  assert.equal(
    (await request(app).get('/api/recurring').expect(200)).body.filter((t) => t.active).length,
    0,
  );
});

test('POST /api/recurring with unknown card -> 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/recurring')
    .send({
      description: 'X',
      category_id: ctx.categoryId,
      card_id: 99999,
      amount_cents: 100,
      day_of_month: 1,
    })
    .expect(400);
});
