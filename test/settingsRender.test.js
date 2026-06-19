const { test } = require('node:test');
const assert = require('node:assert');

test('ceilingText derives ceiling', async () => {
  const { ceilingText } = await import('../public/js/settings.js');
  assert.match(ceilingText(1435000, 377000, 244000), /R\$ 8\.140,00/);
});

test('renderLimitRows builds editable rows with values', async () => {
  const { renderLimitRows } = await import('../public/js/settings.js');
  const cats = [{ id: 1, name: 'Supermercado', active: 1 }, { id: 2, name: 'Transporte', active: 1 }];
  const byCat = new Map([[1, 85000], [2, 52000]]);
  const html = renderLimitRows(cats, byCat);
  assert.match(html, /Supermercado/);
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);   // 85000 cents → 850 reais
});
