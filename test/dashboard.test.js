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

test('dashboard carries overage forward and self-corrects', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);

  // Limit R$100,00 set in January; it applies to all later months.
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-01', limit_cents: 10000 }).expect(200);

  const spend = async (month, cents) => {
    await request(app).post('/api/transactions').send({
      date: `${month}-10`, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: cents,
    }).expect(201);
  };
  await spend('2026-01', 13000); // 130 vs 100 -> over by 30
  await spend('2026-02', 8000);  // 30 + 80 = 110 -> over by 10
  await spend('2026-03', 5000);  // 10 + 50 = 60  -> under, clears
  await spend('2026-04', 5000);  // 0 + 50 = 50   -> under

  const catFor = async (month) => {
    const d = await request(app).get(`/api/dashboard?month=${month}`).expect(200);
    return { cat: d.body.categories.find(c => c.category_id === ctx.categoryId), totals: d.body.totals };
  };

  const jan = await catFor('2026-01');
  assert.equal(jan.cat.carry_in_cents, 0);
  assert.equal(jan.cat.effective_spent_cents, 13000);
  assert.equal(jan.cat.spent_cents, 13000);
  assert.equal(jan.cat.remaining_cents, -3000);
  assert.equal(jan.cat.status, 'over');

  const feb = await catFor('2026-02');
  assert.equal(feb.cat.carry_in_cents, 3000);
  assert.equal(feb.cat.spent_cents, 8000);            // actual, not effective
  assert.equal(feb.cat.effective_spent_cents, 11000);
  assert.equal(feb.cat.remaining_cents, -1000);
  assert.equal(feb.cat.status, 'over');
  assert.equal(feb.totals.spent_cents, 8000);         // real-money total unaffected by carry

  const mar = await catFor('2026-03');
  assert.equal(mar.cat.carry_in_cents, 1000);
  assert.equal(mar.cat.effective_spent_cents, 6000);
  assert.equal(mar.cat.status, 'ok');

  const apr = await catFor('2026-04');
  assert.equal(apr.cat.carry_in_cents, 0);            // debt cleared in March, no snowball
  assert.equal(apr.cat.effective_spent_cents, 5000);
  assert.equal(apr.cat.status, 'ok');
});

test('dashboard: carry keeps accumulating when debt never clears', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-01', limit_cents: 10000 }).expect(200);
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    await request(app).post('/api/transactions').send({
      date: `${month}-10`, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 13000,
    }).expect(201); // 130 vs 100 -> +30 carry each month
  }
  const d = await request(app).get('/api/dashboard?month=2026-03').expect(200);
  const cat = d.body.categories.find(c => c.category_id === ctx.categoryId);
  assert.equal(cat.carry_in_cents, 6000);          // 3000 (Jan) + 3000 (Feb)
  assert.equal(cat.effective_spent_cents, 19000);  // 13000 actual + 6000 carry
  assert.equal(cat.status, 'over');
});

test('dashboard: no carry for a category without a limit', async () => {
  const ctx = makeTestDb(); // default category has no limit row
  const app = createApp(ctx.db);
  for (const month of ['2026-01', '2026-02']) {
    await request(app).post('/api/transactions').send({
      date: `${month}-10`, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 5000,
    }).expect(201);
  }
  const d = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  const cat = d.body.categories.find(c => c.category_id === ctx.categoryId);
  assert.equal(cat.carry_in_cents, 0);
  assert.equal(cat.effective_spent_cents, 5000);
});

test('dashboard: group rollup reflects carry via effective_spent_cents', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-01', limit_cents: 10000 }).expect(200);
  await request(app).post('/api/transactions').send({
    date: '2026-01-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 13000,
  }).expect(201);
  await request(app).post('/api/transactions').send({
    date: '2026-02-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 8000,
  }).expect(201);

  const d = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  const g = d.body.groups.find(x => x.group_id === ctx.groupId);
  assert.equal(g.spent_cents, 8000);            // actual
  assert.equal(g.effective_spent_cents, 11000); // actual + 3000 carry
});
