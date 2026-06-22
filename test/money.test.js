const { test } = require('node:test');
const assert = require('node:assert');
const { formatBRL } = require('../src/domain/services/money');

test('formats cents as pt-BR currency', () => {
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(814000), 'R$ 8.140,00');
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(-5000), '-R$ 50,00');
});
