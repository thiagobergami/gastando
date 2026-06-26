const { test } = require('node:test');
const assert = require('node:assert');

const data = {
  categories: [
    { category_id: 1, name: 'Supermercado', examples: 'Pão de Açúcar, Assaí', group_id: 1,
      group_name: 'Essenciais / semi-fixos', limit_cents: 85000, spent_cents: 82100, status: 'ok' },
    { category_id: 2, name: 'Transporte', examples: 'Uber, Metrô', group_id: 1,
      group_name: 'Essenciais / semi-fixos', limit_cents: 52000, spent_cents: 53800, status: 'over' },
  ],
  groups: [{ group_id: 1, name: 'Essenciais / semi-fixos', limit_cents: 137000, spent_cents: 135900 }],
  totals: { spent_cents: 135900, teto_cents: 814000, savings_goal_cents: 244000,
    projected_savings_cents: 361000, vs_goal_cents: 117000 },
};

test('renderHero shows projected savings and ok state', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(data.totals);
  assert.match(html, /Projected savings/);
  assert.match(html, /R\$ 3\.610,00/);
  assert.match(html, /pill-ok/); // projected >= goal
});

test('renderGroups shows examples, group tag, and over meter', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const html = renderGroups(data);
  assert.match(html, /Supermercado/);
  assert.match(html, /Pão de Açúcar/);     // examples line
  assert.match(html, /tag-sage/);          // group chip
  assert.match(html, /meter-fill over/);   // Transporte over limit
  assert.match(html, /Essenciais/);        // group header
  assert.doesNotMatch(html, /carryover/); // no badge when payload lacks carry_in_cents
});

test('renderGroups shows carryover badge and effective group total', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [
      { category_id: 1, name: 'Games', examples: '', group_id: 1,
        group_name: 'Estilo de vida', limit_cents: 10000, spent_cents: 8000,
        carry_in_cents: 3000, effective_spent_cents: 11000, status: 'over' },
    ],
    groups: [{ group_id: 1, name: 'Estilo de vida', limit_cents: 10000,
      spent_cents: 8000, effective_spent_cents: 11000 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.match(html, /carryover/);          // badge present when carrying
  assert.match(html, /R\$ 30,00/);          // the carried amount is shown
  assert.match(html, /meter-fill over/);    // meter driven by effective spend
  assert.match(html, /R\$ 110,00/);         // group header shows effective total, not actual 80,00
});

test('renderGroups omits carryover badge when not carrying', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [
      { category_id: 1, name: 'Games', examples: '', group_id: 1,
        group_name: 'Estilo de vida', limit_cents: 10000, spent_cents: 5000,
        carry_in_cents: 0, effective_spent_cents: 5000, status: 'ok' },
    ],
    groups: [{ group_id: 1, name: 'Estilo de vida', limit_cents: 10000,
      spent_cents: 5000, effective_spent_cents: 5000 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.doesNotMatch(html, /carryover/);
});

test('renderGroups links each category to its detail screen', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const html = renderGroups({ ...data, month: '2026-06' });
  assert.match(html, /href="category\.html\?id=1&month=2026-06"/);
  assert.match(html, /href="category\.html\?id=2&month=2026-06"/);
});
