const { test } = require('node:test');
const assert = require('node:assert');

test('dashboard renderCategories escapes the category name', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const d = {
    month: '2026-08',
    categories: [
      {
        category_id: 1,
        name: '<b>Boom</b>',
        examples: 'a & b',
        essential: 0,
        limit_cents: 100,
        spent_cents: 0,
        carry_in_cents: 0,
        effective_spent_cents: 0,
        remaining_cents: 100,
        status: 'ok',
      },
    ],
    totals: {},
  };
  const html = renderCategories(d);
  assert.doesNotMatch(html, /<b>Boom<\/b>/);
  assert.match(html, /&lt;b&gt;Boom/);
});

test('dashboard renderHeroInitial escapes the category name', async () => {
  const { renderHeroInitial } = await import('../public/js/dashboard.js');
  const html = renderHeroInitial({
    month: '2026-08',
    configured: false,
    categories: [{ category_id: 1, name: '<b>Boom</b>', spent_cents: 500 }],
    totals: { spent_cents: 500 },
  });
  assert.doesNotMatch(html, /<b>Boom<\/b>/);
  assert.match(html, /&lt;b&gt;Boom/);
});

test('transactions renderRows escapes the description', async () => {
  const { renderRows } = await import('../public/js/registrar.js');
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
