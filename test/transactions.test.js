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
  const body = { date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId,
    amount_cents: 5200, description: 'Pão de Açúcar' };
  const t = await request(app).post('/api/transactions').send(body).expect(201);
  assert.equal(t.body.amount_cents, 5200);
  assert.equal(t.body.installment_group_id, null);

  const june = await request(app).get('/api/transactions?month=2026-06').expect(200);
  assert.equal(june.body.length, 1);
  const july = await request(app).get('/api/transactions?month=2026-07').expect(200);
  assert.equal(july.body.length, 0);

  await request(app).put(`/api/transactions/${t.body.id}`)
    .send({ ...body, amount_cents: 6000 }).expect(200);
  await request(app).delete(`/api/transactions/${t.body.id}`).expect(204);
});

test('transactions: validation', async () => {
  const { app, ctx } = appWith();
  await request(app).post('/api/transactions')
    .send({ date: 'bad', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 100 }).expect(400);
  await request(app).post('/api/transactions')
    .send({ date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 0 }).expect(400);
  await request(app).post('/api/transactions')
    .send({ date: '2026-06-10', category_id: 99999, card_id: ctx.cardId, amount_cents: 100 }).expect(400);
});

test('transactions: get filters and delete 404', async () => {
  const { app, ctx } = appWith();
  await request(app).get('/api/transactions?month=bad').expect(400);
  await request(app).delete('/api/transactions/99999').expect(404);
  // Filtered GET by category_id
  await request(app).post('/api/transactions').send({
    date: '2026-06-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 100
  }).expect(201);
  const r = await request(app).get(`/api/transactions?category_id=${ctx.categoryId}`).expect(200);
  assert.equal(r.body.length, 1);
});
