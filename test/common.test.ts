const { test } = require('node:test');
const assert = require('node:assert');
const { zMonth, zDate, zPositiveInt, zNonNegInt } = require('../src/adapters/http/schemas/common');

test('zMonth accepts YYYY-MM and rejects malformed/short months', () => {
  const s = zMonth('month must be YYYY-MM');
  assert.equal(s.safeParse('2026-06').success, true);
  assert.equal(s.safeParse('2026-6').success, false);   // not zero-padded
  assert.equal(s.safeParse('2026-06-01').success, false); // a date, not a month
  assert.equal(s.safeParse(202606).success, false);       // not a string
  assert.equal(s.safeParse('2026-06').error, undefined);
  assert.equal(s.safeParse('bad').error.errors[0].message, 'month must be YYYY-MM');
});

test('zDate accepts YYYY-MM-DD and rejects months/garbage', () => {
  const s = zDate('date must be YYYY-MM-DD');
  assert.equal(s.safeParse('2026-06-10').success, true);
  assert.equal(s.safeParse('2026-06').success, false);
  assert.equal(s.safeParse('bad').success, false);
});

test('zPositiveInt requires an integer > 0', () => {
  const s = zPositiveInt('amount_cents must be a positive integer');
  assert.equal(s.safeParse(1).success, true);
  assert.equal(s.safeParse(0).success, false);
  assert.equal(s.safeParse(-5).success, false);
  assert.equal(s.safeParse(2.5).success, false);
  assert.equal(s.safeParse('5').success, false);
});

test('zNonNegInt allows 0 but rejects negatives and non-integers', () => {
  const s = zNonNegInt('limit_cents must be a non-negative integer');
  assert.equal(s.safeParse(0).success, true);
  assert.equal(s.safeParse(100).success, true);
  assert.equal(s.safeParse(-1).success, false);
  assert.equal(s.safeParse(1.5).success, false);
});
