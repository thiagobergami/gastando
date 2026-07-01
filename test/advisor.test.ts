const { test } = require('node:test');
const assert = require('node:assert');

const base = {
  totals: {
    projected_savings_cents: 300000,
    savings_goal_cents: 250000,
    teto_cents: 500000,
    vs_goal_cents: 50000,
  },
  categories: [{ name: 'Supermercado', status: 'ok', spent_cents: 40000, limit_cents: 50000 }],
};

test('selectAdvice flags the worst over-limit category first', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  const d = {
    ...base,
    categories: [
      {
        name: 'Jogos',
        status: 'over',
        spent_cents: 30000,
        effective_spent_cents: 30000,
        limit_cents: 25000,
      },
      {
        name: 'Uber',
        status: 'over',
        spent_cents: 60000,
        effective_spent_cents: 60000,
        limit_cents: 40000,
      },
    ],
  };
  const a = selectAdvice(d);
  assert.equal(a.id, 'over');
  assert.match(a.text, /Uber/); // biggest overage (20000 > 5000)
});

test('selectAdvice warns when projected savings is below goal', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  const d = {
    ...base,
    totals: {
      ...base.totals,
      projected_savings_cents: 200000,
      savings_goal_cents: 250000,
      vs_goal_cents: -50000,
    },
  };
  assert.equal(selectAdvice(d).id, 'below-goal');
});

test('selectAdvice reinforces when healthy', async () => {
  const { selectAdvice } = await import('../public/js/advisor.js');
  assert.equal(selectAdvice(base).id, 'healthy');
});

test('renderAdvisor includes the tip text and a settings CTA', async () => {
  const { renderAdvisor } = await import('../public/js/advisor.js');
  const html = renderAdvisor(base);
  assert.match(html, /Revisar Orçamento/);
  assert.match(html, /settings\.html/);
});
