const { test } = require('node:test');
const assert = require('node:assert');

const cats = [
  { id: 1, name: 'Mercado', active: 1, essential: 1 },
  { id: 2, name: 'Lazer', active: 1, essential: 0 },
  { id: 3, name: 'Antiga', active: 0, essential: 0 },
];
const byCat = new Map([
  [1, 85000],
  [2, 20000],
]);

test('renderCategoryRows lists only active categories, flat', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /Mercado/);
  assert.match(html, /Lazer/);
  assert.doesNotMatch(html, /Antiga/);
  assert.doesNotMatch(html, /grupo/i);
});

test('renderCategoryRows renders the essential toggle in both states', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /data-essential="1"[^>]*checked/);
  assert.match(html, /data-essential="2"(?![^>]*checked)/);
});

test('renderCategoryRows prefills the limit in reais', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /data-cat="1"[^>]*value="850"/);
});

test('renderCategoryRows flags excess and shows the saved carry choice per category', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const carryByCat = new Map([
    [1, { overage_cents: 3000, carry_forward: true }],
    [2, { overage_cents: 0, carry_forward: false }],
  ]);
  const html = renderCategoryRows(cats, byCat, carryByCat);
  assert.match(html, /R\$ 30,00 excedidos/);
  assert.match(html, /data-carry="1"[^>]*checked/);
  assert.match(html, /data-carry="2"[^>]*disabled/);
});

test('canSpendText names the number the way the user asks the question', async () => {
  const { canSpendText } = await import('../public/js/budget.js');
  assert.equal(canSpendText(1200000, 386000, 250000), 'Posso gastar este mês R$ 5.640,00');
});
