const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function addItem(app, kind, name, amount_cents) {
  return request(app).post('/api/model-items').send({ kind, name, amount_cents }).expect(201);
}

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

test('PUT sums model_items instead of taking income/fixed from the body', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1000000);
  await addItem(app, 'income', 'Freelas', 200000);
  await addItem(app, 'fixed_cost', 'Aluguel', 300000);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);
  assert.equal(r.body.income_cents, 1200000);
  assert.equal(r.body.fixed_costs_cents, 300000);
  assert.equal(r.body.savings_goal_cents, 250000);
});

test('an empty item list sums to 0, same as never having configured anything', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
    .expect(200);
  assert.equal(r.body.income_cents, 0);
  assert.equal(r.body.fixed_costs_cents, 0);
});

test('income_cents/fixed_costs_cents in the body are ignored, not rejected', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1000000);
  const r = await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      savings_goal_cents: 250000,
      income_cents: 99999999,
      fixed_costs_cents: 99999999,
    })
    .expect(200);
  assert.equal(r.body.income_cents, 1000000); // veio da soma, não do body
  assert.equal(r.body.fixed_costs_cents, 0);
});

test('the month row wins, and the nearest earlier row carries forward', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const income = (await addItem(app, 'income', 'Salário', 1000000)).body;
  await addItem(app, 'fixed_cost', 'Aluguel', 300000);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  // A próxima revisão mensal reedita os itens antes de congelar julho —
  // exatamente o fluxo real do passo 3.
  await request(app)
    .put(`/api/model-items/${income.id}`)
    .send({ name: 'Salário', amount_cents: 1200000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
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
  // teste seguinte prova), e `settings` é o terceiro degrau da cadeia.
  const may = await request(app).get('/api/monthly-model?month=2026-05').expect(200);
  assert.equal(may.body.income_cents, 1200000);
  assert.equal(may.body.source, 'settings');
});

test('writing a month also updates the current model in settings', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await addItem(app, 'income', 'Salário', 1200000);
  await addItem(app, 'fixed_cost', 'Aluguel', 386000);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 250000 })
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
  const item = (await addItem(app, 'income', 'Salário', 1000000)).body;
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 200000 })
    .expect(200);
  await request(app)
    .put(`/api/model-items/${item.id}`)
    .send({ name: 'Salário', amount_cents: 1500000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 200000 })
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
  await request(app).put('/api/monthly-model').send({ month: '2026-08' }).expect(400); // no savings_goal_cents
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: -1 })
    .expect(400); // negative
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-08', savings_goal_cents: 1.5 })
    .expect(400); // not an integer
});
