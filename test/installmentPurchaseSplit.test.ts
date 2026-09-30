import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { makeInstallmentRepository } from '../src/infra/repositories/installments';
import { makeTransactionRepository } from '../src/infra/repositories/transactions';
import { makeTestDb } from './helpers';

function fixture(total = 120000, count = 6, percent = 50) {
  const ctx = makeTestDb();
  const installments = makeInstallmentRepository(ctx.db);
  const transactions = makeTransactionRepository(ctx.db);
  const input = {
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'TV',
    total_cents: total,
    count,
    first_month: '2026-09',
    split_person_id: ctx.personId,
    split_percent: percent,
  };
  const id = installments.createPurchase(input);
  const physical = () =>
    ctx.db
      .prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY installment_no')
      .all(id) as any[];
  return { ...ctx, installments, transactions, input, id, physical, app: createApp(ctx.db) };
}

test('group split is resolved in every transaction read without duplication', () => {
  const f = fixture();
  assert.ok(f.physical().every((t) => t.split_person_id === null));
  assert.equal(f.transactions.firstByGroup(f.id)?.split_percent, 50);
  assert.equal(f.transactions.findById(f.physical()[1].id)?.split_person_id, f.personId);
  assert.ok(f.transactions.list({}).every((t) => t.split_percent === 50));
  assert.deepEqual(
    f.transactions.listReceivables().map((r) => r.amount_cents),
    [10000, 10000, 10000, 10000, 10000, 10000],
  );
  f.db.prepare('UPDATE people SET active=0 WHERE id=?').run(f.personId);
  assert.equal(f.installments.listWithProgress('2026-09')[0].split_person_name, 'Fulano');
});

test('rounding survives receipts, date changes and descriptive edits', () => {
  const f = fixture(100, 3);
  const before = f.physical();
  f.transactions.setSplitReceived(before[1].id, true);
  f.installments.payOffEarly(f.id, '2026-09');
  f.installments.update(f.id, {
    ...f.input,
    description: 'TV nova',
    split_person_id: undefined,
    split_percent: undefined,
  });
  assert.deepEqual(
    f.physical().map((t) => t.id),
    before.map((t) => t.id),
  );
  assert.equal(f.physical()[1].split_received, 1);
  assert.ok(f.physical().every((t) => t.date === '2026-09-01'));
  const rows = f.transactions.listReceivables();
  assert.deepEqual(
    rows.map((r) => r.amount_cents),
    [17, 17, 16],
  );
  assert.equal(
    rows.filter((r) => !r.received).reduce((s, r) => s + r.amount_cents, 0),
    33,
  );
  const snapshot = f.physical();
  assert.throws(
    () => f.installments.update(f.id, { ...f.input, total_cents: 200 }),
    (e: any) => e.status === 409,
  );
  assert.deepEqual(f.physical(), snapshot);
});

test('split edits preserve omission, allow clearing before receipt, and protect legacy splits', () => {
  const f = fixture();
  f.installments.update(f.id, { ...f.input, split_person_id: null, split_percent: null });
  assert.equal(f.transactions.firstByGroup(f.id)?.split_person_id, null);
  const tx = f.physical()[0];
  f.transactions.update(tx.id, { ...tx, split_person_id: f.personId, split_percent: 25 });
  assert.equal(f.installments.listWithProgress('2026-09')[0].has_individual_splits, true);
  assert.throws(
    () => f.installments.update(f.id, f.input),
    (e: any) => e.status === 409,
  );
  assert.throws(
    () =>
      f.installments.update(f.id, {
        ...f.input,
        total_cents: 100,
        split_person_id: null,
        split_percent: null,
      }),
    (e: any) => e.status === 409,
  );
  f.transactions.setSplitReceived(tx.id, true);
  assert.throws(
    () => f.transactions.update(tx.id, { ...tx, split_person_id: null, split_percent: null }),
    (e: any) => e.status === 409,
  );
  f.transactions.setSplitReceived(tx.id, false);
  f.transactions.update(tx.id, { ...tx, split_person_id: null, split_percent: null });
  f.installments.update(f.id, f.input);
  assert.equal(f.transactions.firstByGroup(f.id)?.split_percent, 50);
});

test('zero shares are omitted and shared child edits/deletes are rejected', () => {
  const f = fixture(3, 3, 1);
  assert.equal(f.transactions.listReceivables().length, 0);
  const tx = f.physical()[0];
  assert.throws(
    () => f.transactions.update(tx.id, tx),
    (e: any) => e.status === 409,
  );
  assert.throws(
    () => f.transactions.remove(tx.id),
    (e: any) => e.status === 409,
  );
});

test('HTTP shared purchase lifecycle, preview, protection and unchanged finances', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const input = {
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'TV',
    installment_total_cents: 120000,
    installment_count: 6,
    first_month: '2026-09',
    split_person_id: ctx.personId,
    split_percent: 50,
  };
  const preview = await request(app)
    .post('/api/installment-groups/preview')
    .send({ total_cents: 100, count: 3, split_percent: 50 })
    .expect(200);
  assert.deepEqual(preview.body.receivable_amounts_cents, [17, 17, 16]);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 0);
  const created = await request(app).post('/api/transactions').send(input).expect(201);
  assert.equal(created.body.split_percent, 50);
  const groupId = created.body.installment_group_id;
  const rows = ctx.db.prepare('SELECT * FROM transactions ORDER BY installment_no').all() as any[];
  const beforeDashboard = (await request(app).get('/api/dashboard?month=2026-09').expect(200)).body;
  const beforeBi = (await request(app).get('/api/bi/trends?from=2026-09&to=2027-02')).body;
  await request(app).post(`/api/transactions/${rows[1].id}/split-received`).expect(204);
  let receivables = (await request(app).get('/api/transactions/receivables').expect(200)).body;
  assert.equal(
    receivables.filter((r) => !r.received).reduce((s, r) => s + r.amount_cents, 0),
    50000,
  );
  const edit = {
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    description: 'TV nova',
    total_cents: 120000,
    count: 6,
    first_month: '2026-09',
  };
  await request(app).put(`/api/installment-groups/${groupId}`).send(edit).expect(204);
  assert.equal(
    ctx.db.prepare('SELECT split_received FROM transactions WHERE id=?').get(rows[1].id)
      .split_received,
    1,
  );
  await request(app)
    .put(`/api/installment-groups/${groupId}`)
    .send({ ...edit, total_cents: 240000 })
    .expect(409);
  await request(app)
    .put(`/api/transactions/${rows[0].id}`)
    .send({ ...rows[0], split_person_id: ctx.personId, split_percent: 50 })
    .expect(409);
  await request(app).delete(`/api/transactions/${rows[0].id}`).expect(409);
  assert.deepEqual((await request(app).get('/api/dashboard?month=2026-09')).body, beforeDashboard);
  assert.deepEqual(
    (await request(app).get('/api/bi/trends?from=2026-09&to=2027-02')).body,
    beforeBi,
  );
  await request(app).delete(`/api/transactions/${rows[1].id}/split-received`).expect(204);
  receivables = (await request(app).get('/api/transactions/receivables')).body;
  assert.equal(
    receivables.reduce((s, r) => s + r.amount_cents, 0),
    60000,
  );
  await request(app)
    .put(`/api/installment-groups/${groupId}`)
    .send({ ...edit, total_cents: 240000 })
    .expect(204);
  assert.equal(
    (await request(app).get('/api/transactions/receivables')).body.reduce(
      (s, r) => s + r.amount_cents,
      0,
    ),
    120000,
  );
  await request(app).delete(`/api/installment-groups/${groupId}`).expect(204);
  assert.deepEqual((await request(app).get('/api/transactions/receivables')).body, []);
});

test('HTTP validates split pair and preserves existing group config when omitted', async () => {
  const f = fixture();
  const path = `/api/installment-groups/${f.id}`;
  for (const split of [
    { split_person_id: f.personId },
    { split_person_id: null },
    { split_percent: null },
    { split_percent: 50 },
    { split_person_id: null, split_percent: 50 },
    { split_person_id: f.personId, split_percent: 0 },
    { split_person_id: 999, split_percent: 50 },
    { split_person_id: f.personId, split_percent: 50.5 },
  ]) {
    await request(f.app)
      .put(path)
      .send({ ...f.input, split_person_id: undefined, split_percent: undefined, ...split })
      .expect(400);
  }
  await request(f.app)
    .put(path)
    .send({ ...f.input, split_person_id: undefined, split_percent: undefined })
    .expect(204);
  assert.equal(f.transactions.firstByGroup(f.id)?.split_percent, 50);
  await request(f.app)
    .post('/api/transactions')
    .send({
      category_id: f.categoryId,
      card_id: f.cardId,
      installment_total_cents: 2,
      installment_count: 3,
      first_month: '2026-09',
    })
    .expect(400);
  await request(f.app)
    .post('/api/installment-groups/preview')
    .send({ total_cents: 100, count: 3, split_percent: 100 })
    .expect(400);
  await request(f.app)
    .post(`/api/installment-groups/${f.id}/payoff`)
    .send({ month: '2026-09' })
    .expect(204);
  assert.deepEqual(
    f.transactions.listReceivables().map((r) => r.amount_cents),
    [10000, 10000, 10000, 10000, 10000, 10000],
  );
});
