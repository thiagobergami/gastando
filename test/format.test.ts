const { test } = require('node:test');
const assert = require('node:assert');

test('parseReais accepts what a Brazilian actually types', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.equal(parseReais('248,90'), 24890);
  assert.equal(parseReais('248.90'), 24890);
  assert.equal(parseReais('R$ 248,90'), 24890);
  assert.equal(parseReais('1.248,90'), 124890);
  assert.equal(parseReais('  1.248,90  '), 124890);
  assert.equal(parseReais('50'), 5000);
  assert.equal(parseReais(248.9), 24890);
});

test('parseReais rejects what is not a number', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.ok(Number.isNaN(parseReais('')));
  assert.ok(Number.isNaN(parseReais('abc')));
  assert.ok(Number.isNaN(parseReais(null)));
  assert.ok(Number.isNaN(parseReais(undefined)));
});

test('parseReais rounds to the nearest cent', async () => {
  const { parseReais } = await import('../public/js/format.js');
  assert.equal(parseReais('0,015'), 2);
  assert.equal(parseReais('10,999'), 1100);
});

test('shortDate shows day and month', async () => {
  const { shortDate } = await import('../public/js/format.js');
  assert.equal(shortDate('2026-08-06'), '06/08');
  assert.equal(shortDate('2026-12-31'), '31/12');
  assert.equal(shortDate(''), '');
});

test('monthShort names the month in pt-BR', async () => {
  const { monthShort } = await import('../public/js/format.js');
  assert.equal(monthShort('2027-03'), 'mar/2027');
  assert.equal(monthShort('2026-06'), 'jun/2026');
  assert.equal(monthShort('2026-01'), 'jan/2026');
});
