const { test } = require('node:test');
const assert = require('node:assert');

test('datasetsFor maps series to palette datasets and filters zeros', async () => {
  const { datasetsFor, PALETTE } = await import('../public/js/charts.js');
  assert.ok(PALETTE.length >= 4);
  const series = [
    { name: 'Supermercado', spent_cents: [85000, 82100] },
    { name: 'Flat', spent_cents: [0, 0] },
  ];
  const all = datasetsFor(series, false);
  assert.equal(all.length, 2);
  assert.equal(all[0].label, 'Supermercado');
  assert.deepEqual(all[0].data, [850, 821]); // cents → reais
  assert.equal(all[0].borderColor, PALETTE[0]);

  const nz = datasetsFor(series, true);
  assert.equal(nz.length, 1); // flat-zero dropped
});
