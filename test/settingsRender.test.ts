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
  assert.match(html, /data-cat-rename="1"/);
  assert.match(html, /data-group-rename="7"/);
  assert.match(html, /data-group-color="7"/);
});

test('renderGroupedLimitRows escapes HTML in names', async () => {
  const { renderGroupedLimitRows } = await import('../public/js/settings.js');
  const groups = [{ id: 1, name: '<b>G</b>', color: 'sage', active: 1 }];
  const cats = [{ id: 2, name: '<img src=x onerror=alert(1)>', group_id: 1, active: 1 }];
  const html = renderGroupedLimitRows(groups, cats, new Map());
  assert.ok(!html.includes('<img src=x'), 'category name not escaped');
  assert.ok(html.includes('&lt;img src=x'), 'expected escaped category name');
  assert.ok(html.includes('&lt;b&gt;G&lt;/b&gt;'), 'expected escaped group name');
});

test('renderCards shows the projected bill and config inputs', async () => {
  const { renderCards } = await import('../public/js/settings.js');
  const cards = [{ id: 2, name: 'Nubank', active: 1, closing_day: 20, due_day: 27 }];
  const stmt = new Map([[2, { amount_cents: 35000, closing_date: '2026-06-20', due_date: '2026-06-27' }]]);
  const html = renderCards(cards, stmt, '2026-06');
  assert.match(html, /Nubank/);
  assert.match(html, /R\$ 350,00/);          // projected bill
  assert.match(html, /data-closing="2"/);
  assert.match(html, /value="20"/);
});
