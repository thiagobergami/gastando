const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');
const { splitCents } = require('../src/services/installments');

test('splitCents distributes remainder to the first parcelas', () => {
  assert.deepEqual(splitCents(1000, 4), [250, 250, 250, 250]);
  assert.deepEqual(splitCents(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  assert.equal(splitCents(599 * 100 + 0, 6).reduce((a, b) => a + b, 0), 59900);
});

test('POST with installment fields expands across months and sums to total', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).post('/api/transactions').send({
    date: '2026-06-01', category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', installment_total_cents: 359400, installment_count: 6,
    first_month: '2026-06'
  }).expect(201);

  assert.equal(res.body.installment_group_id > 0, true);

  // 6 child transactions, one per month June..November.
  const all = ctx.db.prepare('SELECT * FROM transactions ORDER BY date').all();
  assert.equal(all.length, 6);
  assert.deepEqual(all.map(t => t.date.slice(0, 7)),
    ['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
  assert.equal(all.reduce((s, t) => s + t.amount_cents, 0), 359400);
  assert.equal(all[0].installment_no, 1);
  assert.equal(all[0].installment_total, 6);
});

test('DELETE installment group removes all child transactions', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).post('/api/transactions').send({
    date: '2026-06-01', category_id: ctx.categoryId, card_id: ctx.cardId,
    description: 'Avianca', installment_total_cents: 359400, installment_count: 6,
    first_month: '2026-06'
  }).expect(201);
  await request(app).delete(`/api/installment-groups/${res.body.installment_group_id}`).expect(204);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
});

test('deleteInstallmentGroup with non-existent id throws 404', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).delete('/api/installment-groups/99999').expect(404);
});
