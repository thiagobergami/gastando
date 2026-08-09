const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('an unconfigured database resolves to zeros', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.deepEqual(r.body, {
    month: '2026-08',
    income_cents: 0,
    fixed_costs_cents: 0,
    savings_goal_cents: 0,
    source: 'none',
  });
});

test('settings answer for months with no row of their own', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1200000, fixed_costs: 386000, savings_goal: 250000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1200000);
  assert.equal(r.body.source, 'settings');
});

test('the month row wins, and the nearest earlier row carries forward', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-06',
      income_cents: 1000000,
      fixed_costs_cents: 300000,
      savings_goal_cents: 200000,
    })
    .expect(200);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1200000,
      fixed_costs_cents: 386000,
      savings_goal_cents: 250000,
    })
    .expect(200);

  const june = await request(app).get('/api/monthly-model?month=2026-06').expect(200);
  assert.equal(june.body.income_cents, 1000000);
  assert.equal(june.body.source, 'month');

  const july = await request(app).get('/api/monthly-model?month=2026-07').expect(200);
  assert.equal(july.body.income_cents, 1000000); // carries June forward
  assert.equal(july.body.month, '2026-07');
  assert.equal(july.body.source, 'carry');

  // Maio é anterior a qualquer linha gravada, então não há degrau `carry` — mas
  // também não é `none`: os dois PUTs acima gravaram `settings` junto (é o que o
  // teste seguinte prova), e `settings` é o terceiro degrau da cadeia. O degrau
  // `none` só existe num banco onde o modelo nunca foi configurado, que é o
  // primeiro teste deste arquivo.
  const may = await request(app).get('/api/monthly-model?month=2026-05').expect(200);
  assert.equal(may.body.income_cents, 1200000);
  assert.equal(may.body.source, 'settings');
});

test('writing a month also updates the current model in settings', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1200000,
      fixed_costs_cents: 386000,
      savings_goal_cents: 250000,
    })
    .expect(200);
  const s = await request(app).get('/api/settings').expect(200);
  assert.deepEqual(s.body, {
    monthly_income: 1200000,
    fixed_costs: 386000,
    savings_goal: 250000,
  });
});

test('writing the same month twice overwrites instead of duplicating', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const body = {
    month: '2026-08',
    income_cents: 1000000,
    fixed_costs_cents: 300000,
    savings_goal_cents: 200000,
  };
  await request(app).put('/api/monthly-model').send(body).expect(200);
  await request(app)
    .put('/api/monthly-model')
    .send({ ...body, income_cents: 1500000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1500000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_model').get().n, 1);
});

test('monthly-model validates its inputs', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/monthly-model').expect(400); // no month
  await request(app).get('/api/monthly-model?month=2026').expect(400); // malformed
  await request(app).put('/api/monthly-model').send({ month: '2026-08' }).expect(400); // no values
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: -1,
      fixed_costs_cents: 0,
      savings_goal_cents: 0,
    })
    .expect(400); // negative
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1.5,
      fixed_costs_cents: 0,
      savings_goal_cents: 0,
    })
    .expect(400); // not an integer
});
