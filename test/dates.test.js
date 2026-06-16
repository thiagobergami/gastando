const { test } = require('node:test');
const assert = require('node:assert');
const { monthOf, addMonths } = require('../src/services/dates');

test('monthOf extracts YYYY-MM from a date', () => {
  assert.equal(monthOf('2026-06-15'), '2026-06');
});

test('addMonths rolls over years', () => {
  assert.equal(addMonths('2026-06', 0), '2026-06');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', 12), '2027-01');
});
