const { test } = require('node:test');
const assert = require('node:assert');

const d = { months: [
  { month: '2026-07', installment_cents: 10000, limit_cents: 100000,
    remaining_before_cents: 15000, remaining_after_cents: 5000, status: 'ok' },
  { month: '2026-08', installment_cents: 10000, limit_cents: 100000,
    remaining_before_cents: 5000, remaining_after_cents: -5000, status: 'over' },
] };

test('renderResult summarizes over months and renders meters', async () => {
  const { renderResult } = await import('../public/js/simulate.js');
  const html = renderResult(d);
  assert.match(html, /2026-07/);
  assert.match(html, /1 of 2 months/);   // one over
  assert.match(html, /pill-over/);
  assert.match(html, /meter-fill over/);  // August over
});
