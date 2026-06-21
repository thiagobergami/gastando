const { test } = require('node:test');
const assert = require('node:assert');

test('ceilingText derives ceiling', async () => {
  const { ceilingText } = await import('../public/js/settings.js');
  assert.match(ceilingText(1435000, 377000, 244000), /R\$ 8\.140,00/);
});

test('renderLimitRows (budget) still builds editable rows', async () => {
  const { renderLimitRows } = await import('../public/js/budget.js');
  const cats = [{ id: 1, name: 'Supermercado', active: 1 }];
  const html = renderLimitRows(cats, new Map([[1, 85000]]));
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);
});

test('renderGroupedLimitRows groups categories under their group with controls', async () => {
  const { renderGroupedLimitRows } = await import('../public/js/settings.js');
  const groups = [{ id: 7, name: 'Essenciais', color: 'sage', active: 1 }];
  const cats = [{ id: 1, name: 'Supermercado', group_id: 7, active: 1 }];
  const byCat = new Map([[1, 85000]]);
  const html = renderGroupedLimitRows(groups, cats, byCat);
  assert.match(html, /Essenciais/);
  assert.match(html, /tag-sage/);
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);
  assert.match(html, /data-cat-del="1"/);
  assert.match(html, /data-group-del="7"/);
  assert.match(html, /data-add-cat="7"/);
  assert.match(html, /data-add-group/);
});
