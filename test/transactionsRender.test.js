const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  { id: 10, date: '2026-06-12', description: 'iFood almoço', amount_cents: 4890,
    installment_no: null, installment_total: null, installment_group_id: null },
  { id: 11, date: '2026-06-08', description: 'Avianca', amount_cents: 59900,
    installment_no: 3, installment_total: 6, installment_group_id: 7 },
];

test('renderRows formats amount and installment chip', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows(rows);
  assert.match(html, /iFood almoço/);
  assert.match(html, /R\$ 48,90/);
  assert.match(html, /R\$ 599,00/);
  assert.match(html, /3\/6/);                 // installment chip
  assert.match(html, /data-edit="10"/);       // edit affordance
  assert.match(html, /data-del="11"/);        // delete affordance
});
