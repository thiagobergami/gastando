const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeRecurringRepository } = require('../src/infra/repositories/recurring');

test('insert + list round-trips a template', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Claude',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 10000,
    day_of_month: 5,
  });
  assert.equal(t.description, 'Claude');
  assert.equal(repo.list().length, 1);
  assert.equal(repo.listActive().length, 1);
});

test('charge dedup + last-amount lookup', () => {
  const ctx = makeTestDb();
  const repo = makeRecurringRepository(ctx.db);
  const t = repo.insert({
    description: 'Disney',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 4000,
    day_of_month: 1,
  });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), false);
  repo.insertCharge({
    template_id: t.id,
    date: '2026-05-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 3500,
    description: 'Disney',
  });
  assert.equal(repo.lastChargeAmountBefore(t.id, '2026-06'), 3500);
  repo.insertCharge({
    template_id: t.id,
    date: '2026-06-01',
    category_id: ctx.categoryId,
    card_id: ctx.cardId,
    amount_cents: 4000,
    description: 'Disney',
  });
  assert.equal(repo.findChargeForMonth(t.id, '2026-06'), true);
});
