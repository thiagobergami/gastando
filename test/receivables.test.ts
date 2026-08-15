const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  {
    transaction_id: 1,
    person_id: 3,
    person_name: 'Fulano',
    description: 'Jantar',
    month: '2026-02',
    amount_cents: 5000,
    received: 0,
  },
  {
    transaction_id: 2,
    person_id: 4,
    person_name: 'Ciclano',
    description: 'Uber',
    month: '2026-03',
    amount_cents: 3000,
    received: 1,
  },
];

test('pendingReceivables keeps only what has not been received', async () => {
  const { pendingReceivables } = await import('../public/js/receivables.js');
  assert.deepEqual(
    pendingReceivables(rows).map((r) => r.transaction_id),
    [1],
  );
});

test('totalPendingCents sums only pending amounts', async () => {
  const { totalPendingCents } = await import('../public/js/receivables.js');
  assert.equal(totalPendingCents(rows), 5000);
});

test('renderReceivables shows an empty string when nothing is pending', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  assert.equal(renderReceivables([rows[1]]), '');
});

test('renderReceivables shows the person, description, month, amount and a receive button', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables(rows);
  assert.match(html, /Fulano/);
  assert.match(html, /Jantar/);
  assert.match(html, /fev\/2026/);
  assert.match(html, /R\$ 50,00/);
  assert.match(html, /data-receive="1"/);
  assert.doesNotMatch(html, /Ciclano/); // já recebido, não aparece
});

test('renderReceivables shows the total pending, not the total of everything', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables(rows);
  assert.match(html, /R\$ 50,00/);
  assert.doesNotMatch(html, /R\$ 80,00/); // não soma o já recebido
});

test('renderReceivables escapes the person name and description', async () => {
  const { renderReceivables } = await import('../public/js/receivables.js');
  const html = renderReceivables([
    {
      transaction_id: 5,
      person_id: 9,
      person_name: '<b>Fulano</b>',
      description: '<i>x</i>',
      month: '2026-02',
      amount_cents: 1000,
      received: 0,
    },
  ]);
  assert.match(html, /&lt;b&gt;Fulano&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Fulano/);
  assert.match(html, /&lt;i&gt;x&lt;\/i&gt;/);
});
