const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  {
    id: 1,
    date: '2026-06-03',
    description: 'Pão de Açúcar',
    amount_cents: 12000,
    installment_no: null,
    installment_total: null,
    installment_group_id: null,
  },
  {
    id: 2,
    date: '2026-06-11',
    description: 'Carrefour',
    amount_cents: 24000,
    installment_no: 3,
    installment_total: 10,
    installment_group_id: 5,
  },
];

test('category renderRows shows date/desc/amount + installment chip, view-only', async () => {
  const { renderRows } = await import('../public/js/category.js');
  const html = renderRows(rows);
  assert.match(html, /Pão de Açúcar/);
  assert.match(html, /R\$ 120,00/);
  assert.match(html, /R\$ 240,00/);
  assert.match(html, /3\/10/); // installment chip
  assert.doesNotMatch(html, /data-edit/); // no edit affordance
  assert.doesNotMatch(html, /data-del/); // no delete affordance
});

test('category renderRows shows an empty state', async () => {
  const { renderRows } = await import('../public/js/category.js');
  assert.match(renderRows([]), /No transactions/);
});

test('category renderSummary shows spent/limit/left and status', async () => {
  const { renderSummary } = await import('../public/js/category.js');
  const ok = renderSummary({ spent_cents: 82000, limit_cents: 90000 });
  assert.match(ok, /R\$ 820,00/); // spent
  assert.match(ok, /R\$ 900,00/); // limit
  assert.match(ok, /R\$ 80,00/); // remaining
  assert.match(ok, /pill-ok/);
  const over = renderSummary({ spent_cents: 95000, limit_cents: 90000 });
  assert.match(over, /pill-over/);
  assert.match(over, /meter-fill over/);
});
