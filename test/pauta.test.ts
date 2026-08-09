const { test } = require('node:test');
const assert = require('node:assert');

// Seis meses, três categorias — o mesmo formato que `GET /api/bi/trends` devolve.
const trends = {
  months: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
  series: [
    { category_id: 1, name: 'Mercado', spent_cents: [0, 0, 0, 0, 76200, 62000] },
    { category_id: 2, name: 'Restaurantes & Delivery', spent_cents: [0, 0, 0, 0, 44400, 71200] },
    { category_id: 3, name: 'Transporte', spent_cents: [0, 0, 0, 0, 31400, 41000] },
    { category_id: 4, name: 'Lazer', spent_cents: [0, 0, 0, 0, 30000, 24000] },
    { category_id: 5, name: 'Saúde', spent_cents: [0, 0, 0, 0, 5000, 5000] },
  ],
};

test('monthName gives the bare pt-BR month', async () => {
  const { monthName } = await import('../public/js/format.js');
  assert.equal(monthName('2026-08'), 'agosto');
  assert.equal(monthName('2026-01'), 'janeiro');
  assert.equal(monthName('2026-12'), 'dezembro');
  assert.equal(monthName(''), '');
});

test('rangeSentence reads like the frame', async () => {
  const { rangeSentence } = await import('../public/js/pauta.js');
  assert.equal(rangeSentence(trends.months), 'Março a agosto de 2026 · seis meses de histórico');
  assert.equal(rangeSentence(['2026-08']), 'Agosto de 2026 · um mês de histórico');
  assert.equal(
    rangeSentence(['2025-11', '2025-12', '2026-01']),
    'Novembro de 2025 a janeiro de 2026 · três meses de histórico',
  );
  assert.equal(rangeSentence([]), '');
});

test('rangeSentence falls back to digits past twelve months', async () => {
  const { rangeSentence } = await import('../public/js/pauta.js');
  const months = Array.from({ length: 13 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
  assert.match(rangeSentence(months), /· 13 meses de histórico$/);
});

test('composition ranks the final month and folds the tail into Outras', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const c = composition(trends);
  assert.equal(c.month, '2026-08');
  assert.equal(c.total_cents, 71200 + 62000 + 41000 + 24000 + 5000); // 203200
  assert.deepEqual(
    c.rows.map((r) => r.name),
    ['Restaurantes & Delivery', 'Mercado', 'Transporte', 'Lazer', 'Outras'],
  );
  assert.equal(c.rows[0].spent_cents, 71200);
  assert.equal(c.rows[0].pct, 35);
  assert.equal(c.rows[4].spent_cents, 5000); // Saúde, dobrada em Outras
});

test('composition omits Outras when nothing is left over', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const two = {
    months: ['2026-08'],
    series: [
      { name: 'A', spent_cents: [6000] },
      { name: 'B', spent_cents: [4000] },
    ],
  };
  const c = composition(two);
  assert.deepEqual(
    c.rows.map((r) => r.name),
    ['A', 'B'],
  );
  assert.deepEqual(
    c.rows.map((r) => r.pct),
    [60, 40],
  );
});

test('composition on an empty month is empty, not broken', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const c = composition({ months: ['2026-08'], series: [{ name: 'A', spent_cents: [0] }] });
  assert.equal(c.total_cents, 0);
  assert.deepEqual(c.rows, []);
  assert.deepEqual(composition({ months: [], series: [] }), {
    month: '',
    total_cents: 0,
    rows: [],
  });
});

test('monthlyTotals sums every series per month', async () => {
  const { monthlyTotals } = await import('../public/js/pauta.js');
  const t = monthlyTotals(trends);
  assert.deepEqual(t.months, trends.months);
  assert.deepEqual(t.totals_cents, [0, 0, 0, 0, 187000, 203200]);
});

test('trendVerdict compares the last month to the three before it', async () => {
  const { trendVerdict } = await import('../public/js/pauta.js');
  // média de 300, 400, 500 = 400; último = 376 → −6%
  assert.equal(trendVerdict([300, 400, 500, 376]), 'Menos: −6% contra a média dos últimos 3 meses');
  assert.equal(trendVerdict([300, 400, 500, 448]), 'Mais: +12% contra a média dos últimos 3 meses');
  assert.equal(trendVerdict([300, 400, 500, 400]), 'Na média dos últimos 3 meses');
  assert.equal(trendVerdict([100, 200]), ''); // menos de quatro meses
  assert.equal(trendVerdict([0, 0, 0, 500]), ''); // média zero: sem base de comparação
});

test('changes ranks categories by absolute variation between the last two months', async () => {
  const { changes } = await import('../public/js/pauta.js');
  const rows = changes(trends);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Restaurantes & Delivery', 'Mercado', 'Transporte', 'Lazer'],
  );
  assert.deepEqual(
    rows.map((r) => r.delta_cents),
    [26800, -14200, 9600, -6000],
  );
  assert.deepEqual(
    rows.map((r) => r.pct),
    [60, -19, 31, -20],
  );
});

test('changes drops flat categories and honours the limit', async () => {
  const { changes } = await import('../public/js/pauta.js');
  assert.ok(!changes(trends).some((r) => r.name === 'Saúde')); // 5000 → 5000
  assert.equal(changes(trends, 2).length, 2);
});

test('changes has no opinion when there is nothing to compare', async () => {
  const { changes } = await import('../public/js/pauta.js');
  assert.deepEqual(
    changes({ months: ['2026-08'], series: [{ name: 'A', spent_cents: [10] }] }),
    [],
  );
  assert.deepEqual(changes({ months: [], series: [] }), []);
});

test('changes reports no percentage when the category is brand new', async () => {
  const { changes } = await import('../public/js/pauta.js');
  const rows = changes({
    months: ['2026-07', '2026-08'],
    series: [{ name: 'Pet', spent_cents: [0, 15000] }],
  });
  assert.equal(rows[0].delta_cents, 15000);
  assert.equal(rows[0].pct, null);
});

test('changeAmount renders the sign apart from the amount', async () => {
  const { changeAmount } = await import('../public/js/pauta.js');
  assert.equal(changeAmount(26800), '+ R$ 268,00');
  assert.equal(changeAmount(-14200), '− R$ 142,00');
});

test('splitAt reads the final month of the committed series', async () => {
  const { splitAt } = await import('../public/js/pauta.js');
  const payload = {
    months: ['2026-07', '2026-08'],
    series: [
      { name: 'Comprometido', spent_cents: [100000, 162000] },
      { name: 'Discricionário', spent_cents: [200000, 224000] },
    ],
  };
  assert.deepEqual(splitAt(payload), {
    committed_cents: 162000,
    discretionary_cents: 224000,
    total_cents: 386000,
    committed_pct: 42,
  });
  assert.equal(splitAt(payload, 0).committed_pct, 33);
});

test('splitAt on a month with no spend reports zero, not NaN', async () => {
  const { splitAt } = await import('../public/js/pauta.js');
  const payload = {
    months: ['2026-08'],
    series: [
      { name: 'Comprometido', spent_cents: [0] },
      { name: 'Discricionário', spent_cents: [0] },
    ],
  };
  assert.equal(splitAt(payload).committed_pct, 0);
});

test('questionCard puts the question in the title', async () => {
  const { questionCard } = await import('../public/js/pauta.js');
  const html = questionCard({
    question: 'Para onde meu dinheiro foi?',
    note: 'Agosto de 2026 · R$ 3.860,00',
    body: '<p>corpo</p>',
  });
  assert.match(html, /paper-card/);
  assert.match(html, /Para onde meu dinheiro foi\?/);
  assert.match(html, /Agosto de 2026 · R\$ 3\.860,00/);
  assert.match(html, /<p>corpo<\/p>/);
});

test('the renderers escape category names', async () => {
  const { composition, renderComposition, changes, renderChanges } = await import(
    '../public/js/pauta.js'
  );
  const evil = {
    months: ['2026-07', '2026-08'],
    series: [{ name: '<img src=x>', spent_cents: [100, 200] }],
  };
  const c = renderComposition(composition(evil));
  assert.match(c, /&lt;img/);
  assert.doesNotMatch(c, /<img/);
  const ch = renderChanges(changes(evil));
  assert.match(ch, /&lt;img/);
  assert.doesNotMatch(ch, /<img/);
});
