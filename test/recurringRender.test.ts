const { test } = require('node:test');
const assert = require('node:assert');

test('renderList shows description, amount, day and actions', async () => {
  const { renderList } = await import('../public/js/recurring.js');
  const names = { cats: new Map([[1, 'Assinaturas']]), cards: new Map([[2, 'Nubank']]) };
  const html = renderList(
    [
      {
        id: 7,
        description: 'Claude',
        category_id: 1,
        card_id: 2,
        amount_cents: 10000,
        day_of_month: 5,
        active: 1,
      },
    ],
    names,
  );
  assert.match(html, /Claude/);
  assert.match(html, /Assinaturas/);
  assert.match(html, /R\$ 100,00/);
  assert.match(html, /dia 5/);
  assert.match(html, /data-del="7"/);
});

test('renderList escapes the description', async () => {
  const { renderList } = await import('../public/js/recurring.js');
  const html = renderList(
    [
      {
        id: 1,
        description: '<x>',
        category_id: 1,
        card_id: 2,
        amount_cents: 100,
        day_of_month: 1,
        active: 1,
      },
    ],
    { cats: new Map(), cards: new Map() },
  );
  assert.doesNotMatch(html, /<x>/);
  assert.match(html, /&lt;x&gt;/);
});
