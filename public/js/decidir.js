import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { addMonths, capitalize, esc, formatBRL, monthName } from './format.js';
import { changes, monthlyTotals, trendVerdict } from './pauta.js';
import { reviewMonths, stepSubtitle, stepTrail } from './review.js';

const $ = (id) => document.getElementById(id);

// Sem persistência de progresso: sair e voltar recomeça no passo 1. O que
// persiste é o que cada passo grava pela API — nunca estado de wizard. É o que
// impede o `setup.html` que a Fatia 1 matou de ressuscitar por outra porta.
const state = {
  step: 1,
  months: reviewMonths(new Date().toISOString().slice(0, 10)),
  decisions: { model: null, limits: [] },
};

// `note` é o único campo que pode carregar texto do usuário (o nome da
// categoria de maior mudança), então é o único que precisa escapar. `label`,
// `value` e `tone` são sempre gerados pelo app.
export const tile = (label, value, note, tone = 'text-ink') => `
  <div class="stat-tile">
    <div class="label-caps text-ink-mut">${label}</div>
    <div class="font-mono text-2xl ${tone} mt-1">${value}</div>
    <div class="text-sm text-ink-mut mt-1">${esc(note)}</div>
  </div>`;

// Passo 1 — leitura, não ação. Três números e um link, como o frame 18:3: a
// pauta inteira está a um clique, e repeti-la aqui faria o passo 1 pesar mais
// que a decisão que ele prepara.
async function renderStep1() {
  // Os mesmos seis meses da Análise, mas terminando no mês FECHADO — o passo 1
  // olha para o que aconteceu, não para o mês que está correndo.
  const qs = `from=${addMonths(state.months.closed, -5)}&to=${state.months.closed}`;
  const [trends, savings] = await Promise.all([
    api.get(`/api/bi/trends?${qs}`),
    api.get(`/api/bi/savings-realized?${qs}`),
  ]);
  const totals = monthlyTotals(trends);
  const spent = totals.totals_cents[totals.totals_cents.length - 1] ?? 0;
  const realized = savings.series[0].spent_cents;
  const goal = savings.series[1].spent_cents;
  const saved = realized[realized.length - 1] ?? 0;
  const lastGoal = goal[goal.length - 1] ?? 0;
  const top = changes(trends)[0];
  const verdict = trendVerdict(totals.totals_cents);

  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">O mês que passou</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">${capitalize(monthName(state.months.closed))} fechou. Antes de decidir qualquer coisa, veja o que aconteceu.</p>
      <div class="flex flex-col md:flex-row gap-4">
        ${tile('GASTOU', formatBRL(spent), verdict || 'sem base de comparação ainda')}
        ${tile('GUARDOU', formatBRL(saved), `meta era ${formatBRL(lastGoal)}`, saved >= lastGoal ? 'text-sage' : 'text-ink')}
        ${
          top
            ? tile(
                'MAIOR MUDANÇA',
                `${top.delta_cents < 0 ? '−' : '+'} ${formatBRL(Math.abs(top.delta_cents))}`,
                top.name,
                top.delta_cents > 0 ? 'text-clay' : 'text-ink',
              )
            : tile('MAIOR MUDANÇA', '—', 'nada mudou de forma relevante')
        }
      </div>
      <a href="/analise.html" class="inline-block mt-5 text-sage hover:underline">Ver a análise completa dos seis meses →</a>
    </section>`;
}

// Passo 2 — reuso direto da Fatia 2, zero código novo de render.
async function renderStep2() {
  const [installments, recurring] = await Promise.all([
    api.get(`/api/installment-groups?month=${state.months.opening}`),
    api.get('/api/recurring'),
  ]);
  const panel = renderCommitments(buildCommitments(installments, recurring));
  if (panel) return panel;
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">O que já está comprometido</h2>
      <p class="text-sm text-ink-mut mt-1">Nada de ${monthName(state.months.opening)} está reservado ainda — o mês inteiro é seu para decidir.</p>
    </section>`;
}

const RENDERERS = { 1: renderStep1, 2: renderStep2 };

function renderFooter() {
  const back =
    state.step === 1
      ? `<a href="/" class="btn-ghost">Sair da revisão</a>`
      : `<button id="back" class="btn-ghost">Voltar</button>`;
  return `${back}<button id="next" class="btn-primary">Continuar</button>`;
}

async function render() {
  $('title').textContent = `Revisão de ${monthName(state.months.closed)}`;
  $('subtitle').textContent = stepSubtitle(state.step);
  $('trail').innerHTML = stepTrail(state.step);
  $('footer').innerHTML = renderFooter();
  $('step').innerHTML = `<p class="text-ink-mut">Carregando…</p>`;
  try {
    $('step').innerHTML = await RENDERERS[state.step]();
  } catch (e) {
    $('step').innerHTML = '';
    showError(e.message);
  }
  wire();
}

// A trilha tem cinco botões desde já, mas nem todos os passos existem ainda.
// Clampar no número de renderizadores registrados mantém a tela navegável em
// cada estado intermediário, e passa a valer sozinho quando as Tasks 10 e 11
// registram os que faltam.
function go(step) {
  state.step = Math.max(1, Math.min(step, Object.keys(RENDERERS).length));
  render();
}

function wire() {
  $('trail')
    .querySelectorAll('button[data-step]')
    .forEach((b) => {
      b.addEventListener('click', () => go(Number(b.dataset.step)));
    });
  const next = $('next');
  if (next) next.addEventListener('click', () => go(state.step + 1));
  const back = $('back');
  if (back) back.addEventListener('click', () => go(state.step - 1));
}

if (typeof document !== 'undefined' && $('trail')) {
  mountChrome('/decidir.html');
  $('closed').value = state.months.closed;
  // Um seletor no cabeçalho desloca os dois meses juntos, para quem faz a
  // revisão atrasada (§B.4 do design). Trocar de mês zera as decisões: elas
  // descrevem o que mudou nesta sessão, e a sessão recomeça.
  $('closed').addEventListener('change', () => {
    const closed = $('closed').value;
    if (!closed) return;
    state.months = { closed, opening: addMonths(closed, 1) };
    state.decisions = { model: null, limits: [] };
    go(1);
  });
  render();
}
