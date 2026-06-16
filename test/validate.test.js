const { test } = require('node:test');
const assert = require('node:assert');
const { isMonth, isDate, isPositiveInt, fail } = require('../src/validate');

test('validators', () => {
  assert.equal(isMonth('2026-06'), true);
  assert.equal(isMonth('2026-6'), false);
  assert.equal(isDate('2026-06-15'), true);
  assert.equal(isDate('2026-06'), false);
  assert.equal(isPositiveInt(5), true);
  assert.equal(isPositiveInt(0), false);
  assert.equal(isPositiveInt(2.5), false);
});

test('fail throws a status-tagged error', () => {
  assert.throws(() => fail(400, 'bad'), e => e.status === 400 && e.message === 'bad');
});
