const { test } = require('node:test');
const assert = require('node:assert');

test('reviewMonths always closes the previous month and opens the current one', async () => {
  const { reviewMonths } = await import('../public/js/review.js');
  assert.deepEqual(reviewMonths('2026-08-08'), { closed: '2026-07', opening: '2026-08' });
  // Decisão C.3: sem esperteza de fim de mês. O último dia de agosto ainda
  // revisa julho — quem quiser outra coisa usa o seletor do cabeçalho.
  assert.deepEqual(reviewMonths('2026-08-31'), { closed: '2026-07', opening: '2026-08' });
  assert.deepEqual(reviewMonths('2026-08-01'), { closed: '2026-07', opening: '2026-08' });
});

test('reviewMonths crosses the year boundary', async () => {
  const { reviewMonths } = await import('../public/js/review.js');
  assert.deepEqual(reviewMonths('2027-01-04'), { closed: '2026-12', opening: '2027-01' });
  assert.deepEqual(reviewMonths('2026-12-20'), { closed: '2026-11', opening: '2026-12' });
});

test('stepTrail marks done, current and pending, and ships a mobile bar', async () => {
  const { stepTrail, STEPS } = await import('../public/js/review.js');
  assert.equal(STEPS.length, 5);
  assert.deepEqual(STEPS, [
    'O mês que passou',
    'Compromissos',
    'Seu modelo',
    'Orçamentos',
    'Simular',
  ]);

  const html = stepTrail(3);
  for (const label of STEPS) assert.ok(html.includes(label), `missing ${label}`);
  assert.match(html, /data-step="1"[^>]*class="[^"]*step-done/);
  assert.match(html, /data-step="3"[^>]*class="[^"]*step-active/);
  assert.doesNotMatch(html, /data-step="4"[^>]*class="[^"]*step-(done|active)/);
  // barra de progresso do mobile (frame 25:86)
  assert.match(html, /PASSO 3 DE 5 · SEU MODELO/);
  assert.match(html, /60%/);
  assert.match(html, /width:60%/);
});

test('stepTrail is clickable on every step — nothing is mandatory', async () => {
  const { stepTrail } = await import('../public/js/review.js');
  const html = stepTrail(1);
  for (let n = 1; n <= 5; n++) {
    assert.match(html, new RegExp(`<button[^>]*data-step="${n}"`), `step ${n} not clickable`);
  }
});

test('stepSubtitle says what the step is for', async () => {
  const { stepSubtitle } = await import('../public/js/review.js');
  assert.equal(stepSubtitle(1), 'Passo 1 de 5 · só leitura, nada a decidir ainda');
  assert.equal(
    stepSubtitle(3),
    'Passo 3 de 5 · o único momento em que o app pergunta números sobre você',
  );
  assert.equal(stepSubtitle(4), 'Passo 4 de 5 · começamos pelas categorias que estouraram');
  assert.equal(stepSubtitle(6), 'Revisão concluída');
});

test('overspentFirst puts blown budgets on top, then the rest by spend', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'Mercado', spent_cents: 62000, limit_cents: 85000 },
    { name: 'Lazer', spent_cents: 24000, limit_cents: 0 },
    { name: 'Transporte', spent_cents: 41000, limit_cents: 38000 },
    { name: 'Restaurantes & Delivery', spent_cents: 71200, limit_cents: 60000 },
  ];
  assert.deepEqual(
    overspentFirst(rows).map((r) => r.name),
    ['Restaurantes & Delivery', 'Transporte', 'Mercado', 'Lazer'],
  );
});

test('overspentFirst does not treat a missing limit as an overrun', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'Sem limite', spent_cents: 999999, limit_cents: 0 },
    { name: 'Estourou', spent_cents: 100, limit_cents: 50 },
  ];
  assert.deepEqual(
    overspentFirst(rows).map((r) => r.name),
    ['Estourou', 'Sem limite'],
  );
});

test('overspentFirst leaves the input array alone', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'A', spent_cents: 10, limit_cents: 0 },
    { name: 'B', spent_cents: 100, limit_cents: 50 },
  ];
  overspentFirst(rows);
  assert.equal(rows[0].name, 'A');
});

test('modelSummary shows the arithmetic the way the frame writes it', async () => {
  const { modelSummary } = await import('../public/js/review.js');
  const m = modelSummary(1200000, 386000, 250000);
  assert.equal(m.can_spend_cents, 564000);
  assert.equal(m.formula, '12.000 − 3.860 − 2.500');
  assert.equal(modelSummary(0, 0, 0).formula, '0 − 0 − 0');
});

test('summaryLines reports the model and every limit that moved', async () => {
  const { summaryLines } = await import('../public/js/review.js');
  const lines = summaryLines({
    opening: '2026-09',
    model: { income_cents: 1200000, fixed_costs_cents: 386000, savings_goal_cents: 250000 },
    limits: [
      { name: 'Restaurantes & Delivery', from_cents: 60000, to_cents: 65000 },
      { name: 'Transporte', from_cents: 38000, to_cents: 52000 },
    ],
  });
  assert.deepEqual(lines, [
    'Modelo de setembro gravado: renda R$ 12.000,00, custos fixos R$ 3.860,00, meta R$ 2.500,00.',
    'Restaurantes & Delivery: R$ 600,00 → R$ 650,00',
    'Transporte: R$ 380,00 → R$ 520,00',
  ]);
});

test('summaryLines admits when nothing was decided', async () => {
  const { summaryLines } = await import('../public/js/review.js');
  assert.deepEqual(summaryLines({ opening: '2026-09', model: null, limits: [] }), [
    'Você passou pela revisão sem mudar nada. Está tudo como estava.',
  ]);
});
