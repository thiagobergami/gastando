const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('bi trends returns per-category spend across a month range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({
    date: '2026-06-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 10000 }).expect(201);
  await request(app).post('/api/transactions').send({
    date: '2026-07-05', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 30000 }).expect(201);

  const r = await request(app).get('/api/bi/trends?from=2026-06&to=2026-08').expect(200);
  assert.deepEqual(r.body.months, ['2026-06', '2026-07', '2026-08']);
  const series = r.body.series.find(s => s.category_id === ctx.categoryId);
  assert.deepEqual(series.spent_cents, [10000, 30000, 0]);

  await request(app).get('/api/bi/trends?from=bad&to=2026-08').expect(400);
});

test('bi trends: from > to returns 400, single month range works', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/trends?from=2026-08&to=2026-06').expect(400);
  const r = await request(app).get('/api/bi/trends?from=2026-06&to=2026-06').expect(200);
  assert.deepEqual(r.body.months, ['2026-06']);
  assert.equal(r.body.series.find(s => s.category_id === ctx.categoryId).spent_cents[0], 0);
});
