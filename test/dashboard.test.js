const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function seedSettings(db) {
  const set = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  set.run('monthly_income', '1435000');
  set.run('fixed_costs', '377000');
  set.run('savings_goal', '244000');
}

test('settings round-trip', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/settings')
    .send({ monthly_income: 1435000, fixed_costs: 377000, savings_goal: 244000 }).expect(200);
  const s = await request(app).get('/api/settings').expect(200);
  assert.equal(s.body.monthly_income, 1435000);
  assert.equal(s.body.savings_goal, 244000);
});

test('dashboard computes spend, status, teto and projected savings', async () => {
  const ctx = makeTestDb();
  seedSettings(ctx.db);
  const app = createApp(ctx.db);

  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 85000 }).expect(200);
  // Two transactions in June totalling 90000 (> 85000 -> over).
  for (const amt of [50000, 40000]) {
    await request(app).post('/api/transactions').send({
      date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: amt }).expect(201);
  }

  const d = await request(app).get('/api/dashboard?month=2026-06').expect(200);
  const cat = d.body.categories.find(c => c.category_id === ctx.categoryId);
  assert.equal(cat.spent_cents, 90000);
  assert.equal(cat.limit_cents, 85000);
  assert.equal(cat.remaining_cents, -5000);
  assert.equal(cat.status, 'over');

  assert.equal(d.body.totals.teto_cents, 1435000 - 377000 - 244000); // 814000
  assert.equal(d.body.totals.spent_cents, 90000);
  assert.equal(d.body.totals.projected_savings_cents, 1435000 - 377000 - 90000); // 968000
  assert.ok(Array.isArray(d.body.groups));
});

test('dashboard: invalid month returns 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/dashboard?month=bad').expect(400);
});

test('settings: get returns 0 for unset keys', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const s = await request(app).get('/api/settings').expect(200);
  assert.equal(s.body.monthly_income, 0);
  assert.equal(s.body.fixed_costs, 0);
  assert.equal(s.body.savings_goal, 0);
});
