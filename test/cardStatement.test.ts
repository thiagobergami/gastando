const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeCardRepository } = require('../src/infra/repositories/cards');
const request = require('supertest');
const { createApp } = require('../src/app');

test('setStatementConfig persists closing/due day', () => {
  const ctx = makeTestDb();
  const repo = makeCardRepository(ctx.db);
  assert.equal(repo.setStatementConfig(ctx.cardId, 20, 27), 1);
  const card = repo.findById(ctx.cardId);
  assert.equal(card.closing_day, 20);
  assert.equal(card.due_day, 27);
});

test('card statement sums the closing-day cycle', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put(`/api/cards/${ctx.cardId}/statement-config`)
    .send({ closing_day: 20, due_day: 27 })
    .expect(200);
  const add = (date) =>
    request(app)
      .post('/api/transactions')
      .send({
        date,
        category_id: ctx.categoryId,
        card_id: ctx.cardId,
        amount_cents: 10000,
        description: 'x',
      })
      .expect(201);
  await add('2026-05-25'); // after May 20 close -> belongs to June statement
  await add('2026-06-10'); // before June 20 close -> June statement
  await add('2026-06-25'); // after June 20 close -> July statement, excluded
  const res = await request(app)
    .get(`/api/cards/${ctx.cardId}/statement?month=2026-06`)
    .expect(200);
  assert.equal(res.body.amount_cents, 20000);
  assert.equal(res.body.closing_date, '2026-06-20');
  assert.equal(res.body.due_date, '2026-06-27');
});
