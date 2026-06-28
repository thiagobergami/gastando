const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');
const { splitCents } = require('../src/domain/services/installments');

test('splitCents distributes remainder to the first parcelas', () => {
  assert.deepEqual(splitCents(1000, 4), [250, 250, 250, 250]);
  assert.deepEqual(splitCents(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  assert.equal(
    splitCents(599 * 100 + 0, 6).reduce((a, b) => a + b, 0),
    59900,
  );
});

test('POST with installment fields expands across months and sums to total', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-01',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'Avianca',
      installment_total_cents: 359400,
      installment_count: 6,
      first_month: '2026-06',
    })
    .expect(201);

  assert.equal(res.body.installment_group_id > 0, true);

  // 6 child transactions, one per month June..November.
  const all = ctx.db.prepare('SELECT * FROM transactions ORDER BY date').all();
  assert.equal(all.length, 6);
  assert.deepEqual(
    all.map((t) => t.date.slice(0, 7)),
    ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
  );
  assert.equal(
    all.reduce((s, t) => s + t.amount_cents, 0),
    359400,
  );
  assert.equal(all[0].installment_no, 1);
  assert.equal(all[0].installment_total, 6);
});

test('DELETE installment group removes all child transactions', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-01',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'Avianca',
      installment_total_cents: 359400,
      installment_count: 6,
      first_month: '2026-06',
    })
    .expect(201);
  await request(app).delete(`/api/installment-groups/${res.body.installment_group_id}`).expect(204);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM transactions').get().n, 0);
});

test('deleteInstallmentGroup with non-existent id throws 404', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).delete('/api/installment-groups/99999').expect(404);
});

const { makeInstallmentRepository } = require('../src/infra/repositories/installments');
const { AppError } = require('../src/domain/errors');

test('listWithProgress splits paid/remaining by asOf month', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'Avianca',
    total_cents: 60000,
    count: 6,
    first_month: '2026-06',
  });
  // June, July, Aug landed (<= 2026-08); Sep, Oct, Nov remaining.
  const rows = repo.listWithProgress('2026-08');
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.id, id);
  assert.equal(r.category_name, 'Supermercado');
  assert.equal(r.card_name, 'Nubank');
  assert.equal(r.total_count, 6);
  assert.equal(r.paid_count, 3);
  assert.equal(r.remaining_count, 3);
  assert.equal(r.paid_cents, 30000);
  assert.equal(r.remaining_cents, 30000);
  assert.equal(r.monthly_cents, 10000);
  assert.equal(r.next_month, '2026-09');
});

test('update re-expands children to the new count/total atomically', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  const id = repo.createPurchase({
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'TV',
    total_cents: 60000,
    count: 6,
    first_month: '2026-06',
  });
  repo.update(id, {
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'TV',
    total_cents: 30000,
    count: 3,
    first_month: '2026-07',
  });
  const all = ctx.db
    .prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date')
    .all(id);
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map((t) => t.date.slice(0, 7)),
    ['2026-07', '2026-08', '2026-09'],
  );
  assert.equal(
    all.reduce((s, t) => s + t.amount_cents, 0),
    30000,
  );
  assert.equal(all[0].installment_total, 3);
  const g = ctx.db.prepare('SELECT * FROM installment_groups WHERE id=?').get(id);
  assert.equal(g.total_count, 3);
  assert.equal(g.first_month, '2026-07');
});

test('update on a missing group throws 404', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  assert.throws(
    () =>
      repo.update(9999, {
        category_id: ctx.categoryId,
        card_id: ctx.cardId,
        description: '',
        total_cents: 1000,
        count: 2,
        first_month: '2026-06',
      }),
    (e) => e instanceof AppError && e.status === 404,
  );
});

const { makeInstallmentUseCases } = require('../src/application/use-cases/installments');
const { makeCategoryRepository } = require('../src/infra/repositories/categories');
const { makeCardRepository } = require('../src/infra/repositories/cards');

test('use-case list returns progress rows', () => {
  const ctx = makeTestDb();
  const repo = makeInstallmentRepository(ctx.db);
  repo.createPurchase({
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'A',
    total_cents: 1200,
    count: 2,
    first_month: '2026-06',
  });
  const uc = makeInstallmentUseCases({
    installments: repo,
    categories: makeCategoryRepository(ctx.db),
    cards: makeCardRepository(ctx.db),
  });
  assert.equal(uc.list('2026-06').length, 1);
});

test('GET /api/installment-groups returns progress rows', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'Avianca',
      installment_total_cents: 60000,
      installment_count: 6,
      first_month: '2026-06',
    })
    .expect(201);
  const res = await request(app).get('/api/installment-groups?month=2026-08').expect(200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].remaining_count, 3);
  assert.equal(res.body[0].monthly_cents, 10000);
});

test('PUT /api/installment-groups/:id re-expands the schedule', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'TV',
      installment_total_cents: 60000,
      installment_count: 6,
      first_month: '2026-06',
    })
    .expect(201);
  await request(app)
    .put(`/api/installment-groups/${made.body.installment_group_id}`)
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'TV',
      total_cents: 30000,
      count: 3,
      first_month: '2026-07',
    })
    .expect(204);
  const n = ctx.db
    .prepare('SELECT COUNT(*) n FROM transactions WHERE installment_group_id=?')
    .get(made.body.installment_group_id).n;
  assert.equal(n, 3);
});

test('PUT with a bad month returns 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const made = await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'TV',
      installment_total_cents: 1200,
      installment_count: 2,
      first_month: '2026-06',
    })
    .expect(201);
  await request(app)
    .put(`/api/installment-groups/${made.body.installment_group_id}`)
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      total_cents: 1200,
      count: 2,
      first_month: 'June',
    })
    .expect(400);
});

test('use-case update rejects an unknown category with 400', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      description: 'X',
      installment_total_cents: 1200,
      installment_count: 2,
      first_month: '2026-06',
    })
    .expect(201);
  await request(app)
    .put(`/api/installment-groups/${res.body.installment_group_id}`)
    .send({
      category_id: 999999,
      card_id: ctx.cardId,
      total_cents: 1200,
      count: 2,
      first_month: '2026-06',
    })
    .expect(400);
});
