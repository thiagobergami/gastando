const { test } = require('node:test');
const assert = require('node:assert');

const row = {
  id: 1,
  description: 'Avianca',
  category_name: 'Viagens',
  card_name: 'Nubank',
  total_cents: 60000,
  total_count: 6,
  paid_count: 3,
  remaining_count: 3,
  paid_cents: 30000,
  remaining_cents: 30000,
  monthly_cents: 10000,
  next_month: '2026-09',
};

test('renderGroups shows progress, monthly and remaining', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  const html = renderGroups([row]);
  assert.match(html, /Avianca/);
  assert.match(html, /Viagens/);
  assert.match(html, /3\/6/); // parcelas paid/total
  assert.match(html, /R\$ 100,00/); // monthly
  assert.match(html, /R\$ 300,00/); // remaining balance
  assert.match(html, /2026-09/); // next charge
  assert.match(html, /data-edit="1"/);
  assert.match(html, /data-del="1"/);
});

test('renderGroups escapes the description', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  const html = renderGroups([{ ...row, description: '<x>' }]);
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /&lt;x&gt;/);
});

test('renderGroups shows an empty state', async () => {
  const { renderGroups } = await import('../public/js/parcelas.js');
  assert.match(renderGroups([]), /Nenhum parcelamento/);
});
