const { test } = require('node:test');
const assert = require('node:assert');
const { monthOf, addMonths } = require('../src/domain/services/dates');
const { daysInMonth, chargeDate } = require('../src/domain/services/dates');

test('monthOf extracts YYYY-MM from a date', () => {
  assert.equal(monthOf('2026-06-15'), '2026-06');
});

test('addMonths rolls over years', () => {
  assert.equal(addMonths('2026-06', 0), '2026-06');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', 12), '2027-01');
});

test('chargeDate clamps the day to the month length', () => {
  assert.equal(chargeDate('2026-02', 31), '2026-02-28');
  assert.equal(chargeDate('2026-06', 5), '2026-06-05');
  assert.equal(chargeDate('2026-01', 31), '2026-01-31');
  assert.equal(daysInMonth('2024-02'), 29); // leap year
});
