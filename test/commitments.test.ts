const { test } = require('node:test');
const assert = require('node:assert');

const installments = [
  {
    id: 3,
    description: 'Notebook',
    total_count: 10,
    paid_count: 3,
    remaining_count: 7,
    first_month: '2026-06',
    monthly_cents: 41600,
  },
];
const recurring = [
  { id: 1, description: 'Netflix', amount_cents: 4490, day_of_month: 5, active: 1 },
  { id: 2, description: 'Seguro celular', amount_cents: 8990, day_of_month: 10, active: 1 },
  { id: 3, description: 'Cancelada', amount_cents: 9900, day_of_month: 1, active: 0 },
];

test('lastMonth is first_month plus total_count minus one', async () => {
  const { lastMonth } = await import('../public/js/commitments.js');
  assert.equal(lastMonth('2026-06', 10), '2027-03');
  assert.equal(lastMonth('2026-01', 1), '2026-01');
  assert.equal(lastMonth('2026-12', 2), '2027-01');
  assert.equal(lastMonth('2026-06', 0), '2026-06');
});

test('buildCommitments puts installments before recurring templates', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { rows } = buildCommitments(installments, recurring);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['installment', 'recurring', 'recurring'],
  );
  assert.deepEqual(
    rows.map((r) => r.label),
    ['Notebook', 'Netflix', 'Seguro celular'],
  );
});

test('buildCommitments describes each row the way the design reads it', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { rows } = buildCommitments(installments, recurring);
  assert.equal(rows[0].detail, 'parcela 3 de 10 · até mar/2027');
  assert.equal(rows[0].monthly_cents, 41600);
  assert.equal(rows[0].href, '/parcelas.html');
  assert.equal(rows[1].detail, 'repete todo mês');
  assert.equal(rows[1].href, '/recurring.html');
});

test('buildCommitments totals what is reserved every month', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const { total_cents } = buildCommitments(installments, recurring);
  assert.equal(total_cents, 41600 + 4490 + 8990); // 55080
});

test('buildCommitments ignores inactive templates and finished installments', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  const done = [{ ...installments[0], paid_count: 10, remaining_count: 0 }];
  const { rows, total_cents } = buildCommitments(done, recurring);
  assert.deepEqual(
    rows.map((r) => r.label),
    ['Netflix', 'Seguro celular'],
  );
  assert.equal(total_cents, 4490 + 8990);
  assert.ok(!rows.some((r) => r.label === 'Cancelada'));
});

test('buildCommitments on an empty book is empty, not broken', async () => {
  const { buildCommitments } = await import('../public/js/commitments.js');
  assert.deepEqual(buildCommitments([], []), { rows: [], total_cents: 0 });
});

test('renderCommitments draws the panel with its total', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(buildCommitments(installments, recurring));
  assert.match(html, /Compromissos futuros/);
  assert.match(html, /O que já está reservado antes de você gastar qualquer coisa\./);
  assert.match(html, /Notebook/);
  assert.match(html, /parcela 3 de 10 · até mar\/2027/);
  assert.match(html, /R\$ 416,00/);
  assert.match(html, /Já comprometido por mês/);
  assert.match(html, /R\$ 550,80/);
});

test('renderCommitments links each row to the screen that manages it', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(buildCommitments(installments, recurring));
  assert.match(html, /href="\/parcelas.html"/);
  assert.match(html, /href="\/recurring.html"/);
});

test('renderCommitments stays silent when nothing is committed', async () => {
  const { renderCommitments } = await import('../public/js/commitments.js');
  assert.equal(renderCommitments({ rows: [], total_cents: 0 }), '');
});

test('renderCommitments escapes descriptions', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const html = renderCommitments(
    buildCommitments([], [{ id: 1, description: '<img src=x>', amount_cents: 100, active: 1 }]),
  );
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
