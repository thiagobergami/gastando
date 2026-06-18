const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { simulatePurchase } = require('../src/services/simulate');

test('simulate spreads installments and carries the limit forward', () => {
  const { db, categoryId } = makeTestDb();
  db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 50000)").run(categoryId);
  db.prepare("INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES ('2026-06-02', ?, 1, 40000)").run(categoryId);

  const r = simulatePurchase(db, { category_id: categoryId, total_cents: 30000, count: 3, first_month: '2026-06' });
  assert.equal(r.name, 'Supermercado');
  assert.equal(r.months.length, 3);

  // June: existing 40000 + installment 10000 = 50000, limit 50000 -> ok, remaining 0
  assert.equal(r.months[0].month, '2026-06');
  assert.equal(r.months[0].installment_cents, 10000);
  assert.equal(r.months[0].spent_before_cents, 40000);
  assert.equal(r.months[0].spent_after_cents, 50000);
  assert.equal(r.months[0].remaining_before_cents, 10000);
  assert.equal(r.months[0].remaining_after_cents, 0);
  assert.equal(r.months[0].status, 'ok');

  // July: limit carries forward (50000), no prior spend
  assert.equal(r.months[1].month, '2026-07');
  assert.equal(r.months[1].limit_cents, 50000);
  assert.equal(r.months[1].remaining_after_cents, 40000);
});

test('simulate flags an over-limit month', () => {
  const { db, categoryId } = makeTestDb();
  db.prepare("INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, '2026-06', 5000)").run(categoryId);
  const r = simulatePurchase(db, { category_id: categoryId, total_cents: 9000, count: 1, first_month: '2026-06' });
  assert.equal(r.months[0].status, 'over');
  assert.equal(r.months[0].remaining_after_cents, -4000);
});

test('simulate returns null for an unknown category', () => {
  const { db } = makeTestDb();
  assert.equal(simulatePurchase(db, { category_id: 9999, total_cents: 1000, count: 1, first_month: '2026-06' }), null);
});
