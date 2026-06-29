const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('bi trends returns per-category spend across a month range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
    })
    .expect(201);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-07-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 30000,
    })
    .expect(201);

  const r = await request(app).get('/api/bi/trends?from=2026-06&to=2026-08').expect(200);
  assert.deepEqual(r.body.months, ['2026-06', '2026-07', '2026-08']);
  const series = r.body.series.find((s) => s.category_id === ctx.categoryId);
  assert.deepEqual(series.spent_cents, [10000, 30000, 0]);

  await request(app).get('/api/bi/trends?from=bad&to=2026-08').expect(400);
});

test('bi trends: from > to returns 400, single month range works', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/trends?from=2026-08&to=2026-06').expect(400);
  const r = await request(app).get('/api/bi/trends?from=2026-06&to=2026-06').expect(200);
  assert.deepEqual(r.body.months, ['2026-06']);
  assert.equal(r.body.series.find((s) => s.category_id === ctx.categoryId).spent_cents[0], 0);
});

test('bi by-card sums spend per card', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 10000,
    })
    .expect(201);
  const r = await request(app).get('/api/bi/by-card?from=2026-06&to=2026-07').expect(200);
  const s = r.body.series.find((x) => x.card_id === ctx.cardId);
  assert.deepEqual(s.spent_cents, [10000, 0]);
  await request(app).get('/api/bi/by-card?from=2026-08&to=2026-06').expect(400);
});

test('bi by-group aggregates categories in a group', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 25000,
    })
    .expect(201);
  const r = await request(app).get('/api/bi/by-group?from=2026-06&to=2026-06').expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 25000);
});

test('bi budget-vs-actual returns Limit and Spent series', async () => {
  const ctx = makeTestDb();
  ctx.db
    .prepare(
      "INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 80000)",
    )
    .run(ctx.categoryId);
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 30000,
    })
    .expect(201);
  const r = await request(app).get('/api/bi/budget-vs-actual?from=2026-06&to=2026-06').expect(200);
  assert.equal(r.body.series.find((s) => s.name === 'Limit').spent_cents[0], 80000);
  assert.equal(r.body.series.find((s) => s.name === 'Spent').spent_cents[0], 30000);
});

test('bi installment-forecast counts only installment transactions', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 5000,
    })
    .expect(201);
  await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      installment_total_cents: 30000,
      installment_count: 3,
      first_month: '2026-06',
    })
    .expect(201);
  const r = await request(app)
    .get('/api/bi/installment-forecast?from=2026-06&to=2026-08')
    .expect(200);
  assert.deepEqual(r.body.series[0].spent_cents, [10000, 10000, 10000]);
});

test('bi category-trend returns Spent and Limit series for one category', async () => {
  const ctx = makeTestDb();
  ctx.db
    .prepare(
      "INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 90000)",
    )
    .run(ctx.categoryId);
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 30000,
    })
    .expect(201);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-20',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 12000,
    })
    .expect(201);

  const r = await request(app)
    .get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=2026-05&to=2026-06`)
    .expect(200);
  assert.deepEqual(r.body.months, ['2026-05', '2026-06']);
  const spent = r.body.series.find((s) => s.name === 'Spent');
  const limit = r.body.series.find((s) => s.name === 'Limit');
  assert.deepEqual(spent.spent_cents, [0, 42000]); // no spend in May; 30000+12000 in June
  assert.deepEqual(limit.spent_cents, [0, 90000]); // no limit at/before May; 90000 in June
});

test('bi category-trend validates inputs (400s)', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/category-trend?from=2026-05&to=2026-06').expect(400); // missing category_id
  await request(app)
    .get('/api/bi/category-trend?category_id=0&from=2026-05&to=2026-06')
    .expect(400); // non-positive
  await request(app)
    .get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=bad&to=2026-06`)
    .expect(400); // bad month
  await request(app)
    .get(`/api/bi/category-trend?category_id=${ctx.categoryId}&from=2026-08&to=2026-06`)
    .expect(400); // from > to
});

test('savingsTrend = income - fixed - spend, vs goal', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1000000, fixed_costs: 300000, savings_goal: 200000 })
    .expect(200);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 100000,
      description: 'x',
    })
    .expect(201);
  const res = await request(app).get('/api/bi/savings-trend?from=2026-06&to=2026-06').expect(200);
  const projected = res.body.series.find((s) => s.name === 'Projected savings');
  const goal = res.body.series.find((s) => s.name === 'Goal');
  assert.equal(projected.spent_cents[0], 600000); // 1,000,000 - 300,000 - 100,000
  assert.equal(goal.spent_cents[0], 200000);
});
