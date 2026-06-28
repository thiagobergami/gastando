const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('GET /api/limits/suggestions returns last-month and 3-month average', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const tx = (date, cents) => request(app).post('/api/transactions')
    .send({ date, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: cents, description: 'x' })
    .expect(201);
  await tx('2026-03-10', 30000); // 3 months before June
  await tx('2026-04-10', 60000);
  await tx('2026-05-10', 90000); // last month before June
  const res = await request(app).get('/api/limits/suggestions?month=2026-06').expect(200);
  const row = res.body.find(r => r.category_id === ctx.categoryId);
  assert.equal(row.last_month_cents, 90000);
  assert.equal(row.avg3_cents, 60000); // (30000+60000+90000)/3
});
