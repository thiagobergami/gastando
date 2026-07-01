const { test } = require('node:test');
const assert = require('node:assert');

const d = {
  months: [
    {
      month: '2026-07',
      installment_cents: 10000,
      limit_cents: 100000,
      remaining_before_cents: 15000,
      remaining_after_cents: 5000,
      status: 'ok',
    },
    {
      month: '2026-08',
      installment_cents: 10000,
      limit_cents: 100000,
      remaining_before_cents: 5000,
      remaining_after_cents: -5000,
      status: 'over',
    },
  ],
};

test('renderResult shows a results table and impact panel', async () => {
  const { renderResult } = await import('../public/js/simulate.js');
  const html = renderResult(d);
  assert.match(html, /2026-07/);
  assert.match(html, /<table/);
  assert.match(html, /Análise de Impacto/);
  assert.match(html, /Novo total/);
  assert.match(html, /Acima/); // status pill pt-BR
  assert.match(html, /meter-fill over/); // August over
});

test('simulateAdvisory phrases the over-count', async () => {
  const { simulateAdvisory } = await import('../public/js/simulate.js');
  assert.match(
    simulateAdvisory([{ status: 'over' }, { status: 'ok' }]),
    /excede o limite em 1 de 2/,
  );
  assert.match(simulateAdvisory([{ status: 'ok' }]), /cabe no seu orçamento/);
});
