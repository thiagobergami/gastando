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

test('bi budget-vs-actual returns Limite and Gasto series', async () => {
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
  assert.equal(r.body.series.find((s) => s.name === 'Limite').spent_cents[0], 80000);
  assert.equal(r.body.series.find((s) => s.name === 'Gasto').spent_cents[0], 30000);
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

test('bi category-trend returns Gasto and Limite series for one category', async () => {
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
  const spent = r.body.series.find((s) => s.name === 'Gasto');
  const limit = r.body.series.find((s) => s.name === 'Limite');
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
  const projected = res.body.series.find((s) => s.name === 'Poupança projetada');
  const goal = res.body.series.find((s) => s.name === 'Meta');
  assert.equal(projected.spent_cents[0], 600000); // 1,000,000 - 300,000 - 100,000
  assert.equal(goal.spent_cents[0], 200000);
});

test('committed is installments and recurring charges — not essential categories', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  // A categoria de `makeTestDb` é `essential = 1`. Um gasto avulso nela é
  // discricionário: a decisão C.1 é que "comprometido" é o que já foi assinado.
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 50000,
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
    .get('/api/bi/committed-vs-discretionary?from=2026-06&to=2026-06')
    .expect(200);
  assert.deepEqual(
    r.body.series.map((s) => s.name),
    ['Comprometido', 'Discricionário'],
  );
  assert.equal(r.body.series[0].spent_cents[0], 10000); // só a parcela
  assert.equal(r.body.series[1].spent_cents[0], 50000); // o gasto essencial avulso
});

test('committed counts a transaction that is both an installment and recurring once', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const tpl = ctx.db
    .prepare(
      `INSERT INTO recurring_templates (description, category_id, card_id, amount_cents, day_of_month)
       VALUES ('Seguro', ?, ?, 9000, 5)`,
    )
    .run(ctx.categoryId, ctx.cardId);
  const grp = ctx.db
    .prepare(
      `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
       VALUES ('Seguro parcelado', 9000, 1, '2026-06', ?, ?)`,
    )
    .run(ctx.categoryId, ctx.cardId);
  ctx.db
    .prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
                                 installment_group_id, recurring_template_id)
       VALUES ('2026-06-05', ?, ?, 9000, 'Seguro', ?, ?)`,
    )
    .run(ctx.categoryId, ctx.cardId, grp.lastInsertRowid, tpl.lastInsertRowid);

  const r = await request(app)
    .get('/api/bi/committed-vs-discretionary?from=2026-06&to=2026-06')
    .expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 9000); // não 18000
  assert.equal(r.body.series[1].spent_cents[0], 0);
});

test('committed-vs-discretionary validates its range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/committed-vs-discretionary?from=2026-08&to=2026-06').expect(400);
  await request(app).get('/api/bi/committed-vs-discretionary?from=bad&to=2026-06').expect(400);
});

test('savings-realized uses the model that was in force each month', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const income = (
    await request(app)
      .post('/api/model-items')
      .send({ kind: 'income', name: 'Salário', amount_cents: 1000000 })
      .expect(201)
  ).body;
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 300000 })
    .expect(201);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  // Renda sobe para julho — o custo fixo fica como está, como na revisão real.
  await request(app)
    .put(`/api/model-items/${income.id}`)
    .send({ name: 'Salário', amount_cents: 1400000 })
    .expect(204);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-07', savings_goal_cents: 250000 })
    .expect(200);

  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 100000,
    })
    .expect(201);

  const r = await request(app).get('/api/bi/savings-realized?from=2026-06&to=2026-07').expect(200);
  const realized = r.body.series[0];
  const goal = r.body.series[1];
  assert.equal(realized.name, 'Poupança realizada');
  assert.equal(goal.name, 'Meta');
  assert.deepEqual(realized.spent_cents, [600000, 1100000]); // 1.000−300−100 · 1.400−300−0
  assert.deepEqual(goal.spent_cents, [200000, 250000]);
});

// A razão de ser da fatia inteira do lado dos dados (§A.2 do design).
test('changing income today does not rewrite a month that already has a model', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'income', name: 'Salário', amount_cents: 1000000 })
    .expect(201);
  await request(app)
    .post('/api/model-items')
    .send({ kind: 'fixed_cost', name: 'Aluguel', amount_cents: 300000 })
    .expect(201);
  await request(app)
    .put('/api/monthly-model')
    .send({ month: '2026-06', savings_goal_cents: 200000 })
    .expect(200);

  const before = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);

  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 9900000, fixed_costs: 100, savings_goal: 100 })
    .expect(200);

  const after = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);
  assert.deepEqual(after.body.series[0].spent_cents, before.body.series[0].spent_cents);

  // O contraste: `savings-trend` continua sendo projeção com os números de hoje.
  const trend = await request(app).get('/api/bi/savings-trend?from=2026-06&to=2026-06').expect(200);
  assert.equal(trend.body.series[0].spent_cents[0], 9900000 - 100);
});

test('savings-realized falls back to settings for months with no model row', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1000000, fixed_costs: 300000, savings_goal: 200000 })
    .expect(200);
  const r = await request(app).get('/api/bi/savings-realized?from=2026-06&to=2026-06').expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 700000);
  assert.equal(r.body.series[1].spent_cents[0], 200000);
});

test('savings-realized validates its range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/savings-realized?from=2026-08&to=2026-06').expect(400);
  await request(app).get('/api/bi/savings-realized?from=2026-06&to=bad').expect(400);
});

test('every BI series name ships in pt-BR', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const qs = 'from=2026-06&to=2026-06';
  const paths = [
    'budget-vs-actual',
    'installment-forecast',
    'savings-trend',
    'savings-realized',
    'committed-vs-discretionary',
  ];
  const expected = new Set([
    'Limite',
    'Gasto',
    'Parcelas comprometidas',
    'Poupança projetada',
    'Poupança realizada',
    'Meta',
    'Comprometido',
    'Discricionário',
  ]);
  for (const p of paths) {
    const r = await request(app).get(`/api/bi/${p}?${qs}`).expect(200);
    for (const s of r.body.series) {
      assert.ok(expected.has(s.name), `${p} still ships "${s.name}"`);
    }
  }
});
