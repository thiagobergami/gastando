const { test } = require('node:test');
const assert = require('node:assert');
const { budgetStatus } = require('../src/domain/services/budget');

test('budgetStatus is over above limit, approaching from 80%, else ok', () => {
  assert.equal(budgetStatus(101, 100), 'over');
  assert.equal(budgetStatus(100, 100), 'approaching'); // at the limit
  assert.equal(budgetStatus(80, 100), 'approaching');
  assert.equal(budgetStatus(79, 100), 'ok');
  assert.equal(budgetStatus(50, 0), 'ok'); // no limit set
});
