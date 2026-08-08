const { test } = require('node:test');
const assert = require('node:assert');

const configured = {
  month: '2026-08',
  configured: true,
  entry_count: 14,
  categories: [
    {
      category_id: 1,
      name: 'Mercado',
      examples: '',
      essential: 1,
      limit_cents: 85000,
      spent_cents: 62000,
      carry_in_cents: 0,
      effective_spent_cents: 62000,
      remaining_cents: 23000,
      status: 'ok',
    },
    {
      category_id: 2,
      name: 'Restaurantes & Delivery',
      examples: '',
      essential: 0,
      limit_cents: 65000,
      spent_cents: 71200,
      carry_in_cents: 0,
      effective_spent_cents: 71200,
      remaining_cents: -6200,
      status: 'over',
    },
    {
      category_id: 3,
      name: 'Lazer',
      examples: '',
      essential: 0,
      limit_cents: 0,
      spent_cents: 24000,
      carry_in_cents: 0,
      effective_spent_cents: 24000,
      remaining_cents: -24000,
      status: 'ok',
    },
  ],
  by_essential: { essential_cents: 62000, non_essential_cents: 95200 },
  totals: {
    limit_cents: 150000,
    spent_cents: 157200,
    monthly_income_cents: 1200000,
    fixed_costs_cents: 386000,
    savings_goal_cents: 250000,
    can_spend_cents: 564000,
    left_to_spend_cents: 406800,
    projected_savings_cents: 657000,
    vs_goal_cents: 407000,
  },
};

const initial = {
  month: '2026-08',
  configured: false,
  entry_count: 14,
  categories: [
    {
      category_id: 1,
      name: 'Mercado',
      examples: '',
      essential: 1,
      limit_cents: 0,
      spent_cents: 62000,
      carry_in_cents: 0,
      effective_spent_cents: 62000,
      remaining_cents: -62000,
      status: 'ok',
    },
    {
      category_id: 3,
      name: 'Lazer',
      examples: '',
      essential: 0,
      limit_cents: 0,
      spent_cents: 24000,
      carry_in_cents: 0,
      effective_spent_cents: 24000,
      remaining_cents: -24000,
      status: 'ok',
    },
  ],
  by_essential: { essential_cents: 62000, non_essential_cents: 24000 },
  totals: {
    limit_cents: 0,
    spent_cents: 86000,
    monthly_income_cents: 0,
    fixed_costs_cents: 0,
    savings_goal_cents: 0,
    can_spend_cents: 0,
    left_to_spend_cents: 0,
    projected_savings_cents: -86000,
    vs_goal_cents: -86000,
  },
};

test('renderHero picks the initial hero when nothing is configured', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(initial);
  assert.match(html, /PARA ONDE SEU DINHEIRO FOI/);
  assert.match(html, /R\$ 860,00/); // total gasto no mês
  assert.doesNotMatch(html, /POSSO GASTAR/);
});

test('the initial hero breaks the month down by category share', async () => {
  const { renderHeroInitial } = await import('../public/js/dashboard.js');
  const html = renderHeroInitial(initial);
  assert.match(html, /Mercado/);
  assert.match(html, /72%/); // 62.000 de 86.000
  assert.match(html, /28%/); // 24.000 de 86.000
});

test('renderHero shows "posso gastar" once income exists', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(configured);
  assert.match(html, /POSSO GASTAR ESTE MÊS/);
  assert.match(html, /R\$ 4\.068,00/); // left_to_spend
  assert.match(html, /R\$ 5\.640,00/); // can_spend, na linha de apoio
  assert.match(html, /Projeção de sobra/);
});

test('renderCategories meters spend against the limit, flat — no group headers', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  assert.match(html, /Mercado/);
  assert.match(html, /meter-fill over/); // Restaurantes estourou
  assert.doesNotMatch(html, /Essenciais/);
  assert.doesNotMatch(html, /tag-sage/); // o chip de grupo morreu
});

test('renderCategories shows a limitless category as an amount, not as an error', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  const lazer = html.slice(html.indexOf('Lazer'));
  assert.match(lazer, /sem limite/);
  assert.match(lazer, /R\$ 240,00/);
});

test('renderCategories keeps the carry-over badge', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const d = {
    ...configured,
    categories: [
      {
        category_id: 9,
        name: 'Jogos',
        examples: '',
        essential: 0,
        limit_cents: 10000,
        spent_cents: 8000,
        carry_in_cents: 3000,
        effective_spent_cents: 11000,
        remaining_cents: -1000,
        status: 'over',
      },
    ],
  };
  const html = renderCategories(d);
  assert.match(html, /saldo/);
  assert.match(html, /R\$ 30,00/);
});

test('renderCategories links each row to the category screen', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  assert.match(html, /href="category\.html\?id=1&month=2026-08"/);
});

test('renderReviewInvite points at the place where limits are set', async () => {
  const { renderReviewInvite } = await import('../public/js/dashboard.js');
  const html = renderReviewInvite();
  assert.match(html, /Ainda sem tetos por categoria/);
  assert.match(html, /href="settings\.html"/);
});

// Linha de contexto sob o título (Figma 10:15 e 12:53). `today` é injetado para
// que o teste não dependa da data em que roda.
test('monthSubtitle counts the days left when the budget is configured', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  assert.equal(
    monthSubtitle(configured, '2026-08-06'),
    'Agosto de 2026 · faltam 25 dias para fechar o mês',
  );
});

test('monthSubtitle counts the entries when nothing is configured', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  assert.equal(monthSubtitle(initial, '2026-08-06'), 'Agosto de 2026 · 14 lançamentos até agora');
});

test('monthSubtitle says so when the month is already closed', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  assert.equal(monthSubtitle(configured, '2026-09-02'), 'Agosto de 2026 · mês fechado');
});

const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Acompanhar reserves a slot for the commitments panel', () => {
  assert.match(read('public/index.html'), /id="commitments"/);
});

test('the dashboard mounts the panel instead of redrawing it', async () => {
  const src = read('public/js/dashboard.js');
  // desenhado por commitments.js, montado pelo dashboard: o render não é
  // reimplementado aqui
  assert.match(src, /from '\.\/commitments\.js'/);
  assert.match(src, /renderCommitments\(buildCommitments\(/);
  const mod = await import('../public/js/dashboard.js');
  assert.equal(mod.renderCommitments, undefined);
});

test('the commitments panel is the same in both hero states', async () => {
  const { buildCommitments, renderCommitments } = await import('../public/js/commitments.js');
  const model = buildCommitments(
    [],
    [{ id: 1, description: 'Netflix', amount_cents: 4490, active: 1 }],
  );
  // independe de `configured`: é o mesmo painel nos dois estados do §6
  assert.match(renderCommitments(model), /Compromissos futuros/);
});
