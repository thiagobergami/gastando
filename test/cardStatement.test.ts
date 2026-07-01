const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makeCardRepository } = require('../src/infra/repositories/cards');

test('setStatementConfig persists closing/due day', () => {
  const ctx = makeTestDb();
  const repo = makeCardRepository(ctx.db);
  assert.equal(repo.setStatementConfig(ctx.cardId, 20, 27), 1);
  const card = repo.findById(ctx.cardId);
  assert.equal(card.closing_day, 20);
  assert.equal(card.due_day, 27);
});
