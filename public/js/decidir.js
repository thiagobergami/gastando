import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { addMonths, capitalize, esc, formatBRL, monthName, parseReais } from './format.js';
import { changes, monthlyTotals, trendVerdict } from './pauta.js';
import { modelSummary, overspentFirst, reviewMonths, stepSubtitle, stepTrail } from './review.js';

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

// Passo 3 — o único momento em que o app pergunta números sobre a pessoa.
// Grava `monthly_model[opening]` E `settings` numa ação só (§B.1 do design),
// que é o que faz o herói do Acompanhar e a Análise nunca discordarem.
async function renderStep3() {
  const m = await api.get(`/api/monthly-model?month=${state.months.opening}`);
  const field = (id, label, cents) => `
    <label class="field">
      <span>${label}</span>
      <input type="text" id="${id}" value="${formatBRL(cents)}" class="font-mono" />
    </label>`;
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Seu modelo</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">Renda, custos fixos e quanto você quer guardar. É daqui que sai o "posso gastar".</p>
      <div class="grid sm:grid-cols-3 gap-3">
        ${field('income', 'Renda mensal', m.income_cents)}
        ${field('fixed', 'Custos fixos', m.fixed_costs_cents)}
        ${field('goal', 'Meta de poupança', m.savings_goal_cents)}
      </div>
      <div id="canSpend" class="mt-4 rounded border border-sage/40 bg-sage-soft/10 p-4 flex flex-col md:flex-row md:items-center gap-2"></div>
      <p class="text-sm text-ink-mut mt-4">Antes deste passo o app funciona normalmente — só sem projeção de poupança. Nada aqui é obrigatório.</p>
      <p class="text-sm text-ink-mut mt-2">Custos fixos são o que sai todo mês sem passar pelo seu julgamento: aluguel, condomínio, mensalidades. <b>Não lance esses valores também como transação</b> — se lançar, eles seriam descontados duas vezes da sua poupança.</p>
    </section>`;
}

function readModelFields() {
  const cents = (id) => {
    const v = parseReais($(id).value);
    return Number.isNaN(v) || v < 0 ? 0 : v;
  };
  return {
    income_cents: cents('income'),
    fixed_costs_cents: cents('fixed'),
    savings_goal_cents: cents('goal'),
  };
}

function paintCanSpend() {
  const v = readModelFields();
  const s = modelSummary(v.income_cents, v.fixed_costs_cents, v.savings_goal_cents);
  $('canSpend').innerHTML = `
    <div>
      <div class="label-caps text-ink-mut">POSSO GASTAR ESTE MÊS</div>
      <div class="text-sm text-ink-mut font-mono mt-0.5">${s.formula}</div>
    </div>
    <div class="md:ml-auto font-mono text-3xl ${s.can_spend_cents >= 0 ? 'text-sage' : 'text-clay'}">${formatBRL(s.can_spend_cents)}</div>`;
}

async function saveModel() {
  const v = readModelFields();
  await api.put('/api/monthly-model', { month: state.months.opening, ...v });
  state.decisions.model = v;
}

function wireStep3() {
  paintCanSpend();
  for (const id of ['income', 'fixed', 'goal']) {
    $(id).addEventListener('input', paintCanSpend);
    // Reescreve o campo em `R$ 1.234,56` quando a pessoa sai dele: digitar é
    // livre (`parseReais` aceita vírgula, ponto de milhar e o prefixo), ler é
    // formatado.
    $(id).addEventListener('blur', () => {
      const v = parseReais($(id).value);
      $(id).value = formatBRL(Number.isNaN(v) || v < 0 ? 0 : v);
      paintCanSpend();
    });
  }
}

// Passo 4 — categorias que estouraram no mês fechado aparecem primeiro. O
// número já gasto e a sugestão de média de 3 meses vêm de `/api/limits/*`, que
// já existiam; o que é novo é a ordem e o lugar.
async function renderStep4() {
  const [cats, limits, sugg] = await Promise.all([
    api.get('/api/categories'),
    api.get(`/api/limits?month=${state.months.opening}`),
    api.get(`/api/limits/suggestions?month=${state.months.opening}`),
  ]);
  const limitBy = new Map(limits.map((l) => [l.category_id, l.limit_cents]));
  const suggBy = new Map(sugg.map((s) => [s.category_id, s]));
  const rows = overspentFirst(
    cats
      .filter((c) => c.active)
      .map((c) => ({
        category_id: c.id,
        name: c.name,
        limit_cents: limitBy.get(c.id) ?? 0,
        spent_cents: suggBy.get(c.id)?.last_month_cents ?? 0,
        avg3_cents: suggBy.get(c.id)?.avg3_cents ?? 0,
      })),
  );
  state.limitRows = rows;

  const body = rows
    .map((r) => {
      const over = r.limit_cents > 0 && r.spent_cents > r.limit_cents;
      return `
      <div class="flex flex-wrap items-center gap-3 py-4 border-b border-line last:border-0">
        <div class="flex-1 min-w-[12rem]">
          <div>${esc(r.name)}</div>
          <div class="text-sm ${over ? 'text-clay' : 'text-ink-mut'}">gastou ${formatBRL(r.spent_cents)}</div>
        </div>
        <button type="button" class="chip-suggest" data-suggest="${r.category_id}" data-value="${r.avg3_cents}">média 3m · ${formatBRL(r.avg3_cents)}</button>
        <input type="text" class="w-32 rounded-full border border-line bg-card px-4 py-2 text-right font-mono"
               data-limit="${r.category_id}" value="${formatBRL(r.limit_cents)}" />
      </div>`;
    })
    .join('');

  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Ajustar orçamentos</h2>
      <p class="text-sm text-ink-mut mt-1 mb-2">Os limites valem para ${monthName(state.months.opening)}. ${capitalize(monthName(state.months.closed))} fica como está — o histórico por mês é preservado.</p>
      ${body || `<p class="text-ink-mut">Nenhuma categoria ativa ainda.</p>`}
    </section>`;
}

async function saveLimit(input) {
  const id = Number(input.dataset.limit);
  const row = state.limitRows.find((r) => r.category_id === id);
  const parsed = parseReais(input.value);
  const to_cents = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  input.value = formatBRL(to_cents);
  if (to_cents === row.limit_cents) return;
  await api.put('/api/limits', {
    category_id: id,
    month: state.months.opening,
    limit_cents: to_cents,
  });
  // Um limite pode ser mexido várias vezes: o resumo guarda de onde veio e para
  // onde foi, não cada passo do caminho.
  const seen = state.decisions.limits.find((l) => l.category_id === id);
  if (seen) seen.to_cents = to_cents;
  else
    state.decisions.limits.push({
      category_id: id,
      name: row.name,
      from_cents: row.limit_cents,
      to_cents,
    });
  row.limit_cents = to_cents;
}

function wireStep4() {
  $('step')
    .querySelectorAll('button[data-suggest]')
    .forEach((b) => {
      b.addEventListener('click', () => {
        const input = $('step').querySelector(`input[data-limit="${b.dataset.suggest}"]`);
        input.value = formatBRL(Number(b.dataset.value));
        saveLimit(input).catch((e) => showError(e.message));
      });
    });
  $('step')
    .querySelectorAll('input[data-limit]')
    .forEach((inp) => {
      inp.addEventListener('change', () => saveLimit(inp).catch((e) => showError(e.message)));
    });
}

const RENDERERS = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 };
const WIRERS = { 3: wireStep3, 4: wireStep4 };

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

// A trilha tem cinco botões, mas `go()` clampa no número de renderizadores
// registrados: enquanto o passo 5 não existir, clicar nele para no 4. O passo 3
// grava ao sair — inclusive para trás e inclusive pela trilha —, porque não há
// botão "salvar": o passo é a gravação.
function go(step) {
  const leaving = state.step;
  const next = Math.max(1, Math.min(step, Object.keys(RENDERERS).length));
  if (leaving === 3 && next !== 3 && $('income')) {
    // Sair do passo 3 grava — inclusive pela trilha, inclusive para trás. Não
    // existe botão "salvar": o passo é a gravação.
    saveModel()
      .catch((e) => showError(e.message))
      .finally(() => {
        state.step = next;
        render();
      });
    return;
  }
  state.step = next;
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
  const extra = WIRERS[state.step];
  if (extra) extra();
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
    // Trocar de mês descarta o que estava em edição. Repõe o passo direto, sem
    // passar por `go()`: `go()` grava ao sair do passo 3, e os valores no
    // formulário são do mês ANTERIOR — gravá-los sob o mês novo seria escrever
    // um número que a pessoa nunca afirmou sobre aquele mês.
    state.months = { closed, opening: addMonths(closed, 1) };
    state.decisions = { model: null, limits: [] };
    state.step = 1;
    render();
  });
  render();
}
