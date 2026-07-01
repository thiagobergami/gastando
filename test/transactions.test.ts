const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

function appWith() {
  const ctx = makeTestDb();
  return { app: createApp(ctx.db), ctx };
}

test('transactions: create, filter by month, update, delete', async () => {
  const { app, ctx } = appWith();
  const body = {
    date: '2026-06-10',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 5200,
    description: 'Pão de Açúcar',
  };
  const t = await request(app).post('/api/transactions').send(body).expect(201);
  assert.equal(t.body.amount_cents, 5200);
  assert.equal(t.body.installment_group_id, null);

  const june = await request(app).get('/api/transactions?month=2026-06').expect(200);
  assert.equal(june.body.length, 1);
  const july = await request(app).get('/api/transactions?month=2026-07').expect(200);
  assert.equal(july.body.length, 0);

  await request(app)
    .put(`/api/transactions/${t.body.id}`)
    .send({ ...body, amount_cents: 6000 })
    .expect(200);
  await request(app).delete(`/api/transactions/${t.body.id}`).expect(204);
});

test('transactions: validation', async () => {
  const { app, ctx } = appWith();
  await request(app)
    .post('/api/transactions')
    .send({ date: 'bad', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 100 })
    .expect(400);
  await request(app)
    .post('/api/transactions')
    .send({ date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 0 })
    .expect(400);
  await request(app)
    .post('/api/transactions')
    .send({ date: '2026-06-10', category_id: 99999, card_id: ctx.cardId, amount_cents: 100 })
    .expect(400);
});

test('transactions: pagination with limit/offset and X-Total-Count', async () => {
  const { app, ctx } = appWith();
  for (let i = 1; i <= 5; i++) {
    await request(app)
      .post('/api/transactions')
      .send({
        date: `2026-06-0${i}`,
        category_id: ctx.categoryId,
        card_id: ctx.cardId,
        amount_cents: i * 100,
      })
      .expect(201);
  }
  const p1 = await request(app).get('/api/transactions?month=2026-06&limit=2&offset=0').expect(200);
  assert.equal(p1.body.length, 2);
  assert.equal(p1.headers['x-total-count'], '5');

  const last = await request(app)
    .get('/api/transactions?month=2026-06&limit=2&offset=4')
    .expect(200);
  assert.equal(last.body.length, 1);
  assert.equal(last.headers['x-total-count'], '5');

  // Total count reflects filters, not the page size.
  const all = await request(app).get('/api/transactions?month=2026-06').expect(200);
  assert.equal(all.body.length, 5);
  assert.equal(all.headers['x-total-count'], '5');
});

test('transactions: pagination validation', async () => {
  const { app } = appWith();
  await request(app).get('/api/transactions?limit=0').expect(400);
  await request(app).get('/api/transactions?limit=bad').expect(400);
  await request(app).get('/api/transactions?offset=-1').expect(400);
});

test('transactions: get filters and delete 404', async () => {
  const { app, ctx } = appWith();
  await request(app).get('/api/transactions?month=bad').expect(400);
  await request(app).delete('/api/transactions/99999').expect(404);
  // Filtered GET by category_id
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 100,
    })
    .expect(201);
  const r = await request(app).get(`/api/transactions?category_id=${ctx.categoryId}`).expect(200);
  assert.equal(r.body.length, 1);
});

test('GET /api/transactions filters by description q', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const add = (d) =>
    request(app)
      .post('/api/transactions')
      .send({
        date: '2026-06-01',
        category_id: ctx.categoryId,
        card_id: ctx.cardId,
        amount_cents: 100,
        description: d,
      })
      .expect(201);
  await add('Coffee at Starbucks');
  await add('Groceries');
  const res = await request(app).get('/api/transactions?q=coffee').expect(200);
  assert.equal(res.body.length, 1);
  assert.match(res.body[0].description, /Coffee/);
});

test('GET /api/transactions/export.csv returns a CSV with a header and rows', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).post('/api/transactions').send({ date: '2026-06-01', category_id: ctx.categoryId,
    card_id: ctx.cardId, amount_cents: 1234, description: 'Coffee, hot' }).expect(201);
  const res = await request(app).get('/api/transactions/export.csv').expect(200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.text, /date,category,card,amount_cents,description/);
  assert.match(res.text, /Supermercado/);
  assert.match(res.text, /"Coffee, hot"/); // comma-containing field is quoted
});
