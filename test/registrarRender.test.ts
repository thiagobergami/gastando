const { test } = require('node:test');
const assert = require('node:assert');

const rows = [
  {
    id: 10,
    date: '2026-06-12',
    description: 'iFood almoço',
    amount_cents: 4890,
    installment_no: null,
    installment_total: null,
    installment_group_id: null,
  },
  {
    id: 11,
    date: '2026-06-08',
    description: 'Avianca',
    amount_cents: 59900,
    installment_no: 3,
    installment_total: 6,
    installment_group_id: 7,
  },
];

test('renderRows formats amount and installment chip', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(rows);
  assert.match(html, /iFood almoço/);
  assert.match(html, /R\$ 48,90/);
  assert.match(html, /R\$ 599,00/);
  assert.match(html, /3\/6/); // installment chip
  assert.match(html, /data-edit="10"/); // edit affordance
  assert.match(html, /data-del="11"/); // delete affordance
});

const lookups = {
  cats: new Map([[1, { name: 'Restaurantes' }]]),
  cards: new Map([[5, 'Nubank']]),
};

test('renderRows shows category name and card name', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const rowsWithRefs = rows.map((r) => ({ ...r, category_id: 1, card_id: 5 }));
  const html = renderRows(rowsWithRefs, lookups);
  assert.match(html, /Restaurantes/);
  assert.match(html, /Nubank/);
});

test('renderRows shows the category name without any group chip', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 1,
        date: '2026-08-03',
        description: 'Assaí',
        category_id: 1,
        card_id: 1,
        amount_cents: 12300,
      },
    ],
    { cats: new Map([[1, { name: 'Mercado' }]]), cards: new Map([[1, 'Nubank']]) },
  );
  assert.match(html, /Mercado/);
  assert.doesNotMatch(html, /tag-sage|tag-gold|tag-slate|tag-neutral/);
});

test('renderRows shows the date as day/month', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows([
    {
      id: 1,
      date: '2026-08-06',
      description: 'Assaí Atacadista',
      category_id: 1,
      card_id: 5,
      amount_cents: 24890,
    },
  ]);
  assert.match(html, />06\/08</);
  assert.doesNotMatch(html, /2026-08-06/);
});

test('renderRows keeps edit and delete affordances', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows([
    { id: 42, date: '2026-08-06', description: 'x', amount_cents: 100, installment_group_id: null },
  ]);
  assert.match(html, /data-edit="42"/);
  assert.match(html, /data-del="42"/);
});

test('renderRows shows a split tag with percent and person name', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 20,
        date: '2026-06-15',
        description: 'Jantar',
        category_id: 1,
        card_id: 1,
        amount_cents: 10000,
        split_person_id: 3,
        split_percent: 50,
      },
    ],
    {
      cats: new Map([[1, { name: 'Restaurantes' }]]),
      cards: new Map([[1, 'Nubank']]),
      people: new Map([[3, 'Fulano']]),
    },
  );
  assert.match(html, /50% Fulano/);
  assert.match(html, /tag-sage/);
});

test('renderRows escapes the split person name', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 21,
        date: '2026-06-15',
        description: 'Jantar',
        category_id: 1,
        card_id: 1,
        amount_cents: 10000,
        split_person_id: 3,
        split_percent: 50,
      },
    ],
    {
      cats: new Map([[1, { name: 'Restaurantes' }]]),
      cards: new Map([[1, 'Nubank']]),
      people: new Map([[3, '<b>Fulano</b>']]),
    },
  );
  assert.match(html, /&lt;b&gt;Fulano&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Fulano/);
});

test('shared installment row links to its purchase and shows both tags', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
  const html = renderRows(
    [
      {
        id: 3,
        date: '2026-09-01',
        description: 'TV',
        amount_cents: 20000,
        shared_installment: true,
        installment_group_id: 7,
        installment_no: 2,
        installment_total: 6,
        split_person_id: 1,
        split_percent: 50,
      },
    ],
    { cats: new Map(), cards: new Map(), people: new Map([[1, 'Ana']]) },
  );
  assert.match(html, /2\/6/);
  assert.match(html, /50% Ana/);
  assert.match(html, /parcelas\.html\?group=7/);
  assert.doesNotMatch(html, /data-edit="3"/);
});
