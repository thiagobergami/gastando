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
});
