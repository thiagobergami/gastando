const { test } = require('node:test');
const assert = require('node:assert');

test('groupTag escapes the group name', async () => {
  const { groupTag } = await import('../public/js/ui.js');
  const html = groupTag('Casa & Jardim <x>');
  assert.match(html, /Casa &amp; Jardim &lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
});

test('dashboard renderGroups escapes category name, examples and group header', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [
      {
        category_id: 1,
        name: '<b>Boom</b>',
        examples: 'a & b',
        group_id: 1,
        group_name: 'G&G',
        limit_cents: 100,
        spent_cents: 0,
        status: 'ok',
      },
    ],
    groups: [{ group_id: 1, name: 'G&G', limit_cents: 100, spent_cents: 0 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.doesNotMatch(html, /<b>Boom<\/b>/);
  assert.match(html, /&lt;b&gt;Boom/);
  assert.match(html, /a &amp; b/);
});

test('transactions renderRows escapes the description', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows([
    {
      id: 1,
      date: '2026-06-01',
      description: '<img src=x>',
      amount_cents: 100,
      installment_no: null,
      installment_total: null,
      installment_group_id: null,
    },
  ]);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
});
