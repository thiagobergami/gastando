import { renderAdvisor } from './advisor.js';
import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { currentMonth, esc, formatBRL, monthName } from './format.js';
import { renderReceivables } from './receivables.js';
import { meterBar, statusPill } from './ui.js';

export function monthLabel(month) {
  const [y] = String(month).split('-');
  return `${monthName(month)} de ${Number(y)}`;
}

// Linha de contexto sob o título (Figma 10:15 / 12:53). `today` entra como
// parâmetro — uma função que lê o relógio por dentro não tem como ser testada.
export function monthSubtitle(d, today) {
  const head = monthLabel(d.month).replace(/^./, (c) => c.toUpperCase());
  if (!d.configured) {
    const n = d.entry_count ?? 0;
    return `${head} · ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} até agora`;
  }
  const [y, m] = String(d.month).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = new Date(`${today}T00:00:00Z`);
  const end = Date.UTC(y, m - 1, lastDay);
  const left = Math.round((end - now.getTime()) / 86400000);
  if (left < 0) return `${head} · mês fechado`;
  if (left === 0) return `${head} · último dia do mês`;
  return `${head} · ${left === 1 ? 'falta 1 dia' : `faltam ${left} dias`} para fechar o mês`;
}

// Estado inicial (§6): funciona a partir da primeira transação, sem pedir nada.
// Cada linha é composição — valor e fatia do mês —, não gasto contra limite:
// no estado inicial não existe limite nenhum.
export function renderHeroInitial(d) {
  const total = d.totals.spent_cents;
  const rows = d.categories
    .filter((c) => c.spent_cents > 0)
    .sort((a, b) => b.spent_cents - a.spent_cents)
    .map((c) => {
      const pct = total > 0 ? Math.round((c.spent_cents / total) * 100) : 0;
      return `
      <div class="mb-3">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-semibold">${esc(c.name)}</span>
          <span class="font-mono text-sm text-ink-mut">${formatBRL(c.spent_cents)} · ${pct}%</span>
        </div>
        <div class="meter mt-1"><div class="meter-fill" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join('');
  return `
    <section class="paper-card">
      <div class="label-caps text-ink-mut">PARA ONDE SEU DINHEIRO FOI</div>
      <div class="font-display text-5xl text-ink leading-none mt-1">${formatBRL(total)}</div>
      <p class="text-sm text-ink-mut mt-2 mb-5">em ${esc(monthLabel(d.month))}, distribuídos assim:</p>
      ${rows || `<p class="text-ink-mut">Nenhum lançamento neste mês ainda.</p>`}
    </section>`;
}

// Estado completo (§6): renda e custos fixos existem, então a projeção existe.
export function renderHeroConfigured(d) {
  const t = d.totals;
  const line = (label, cents) => `
    <div class="flex items-baseline justify-between gap-4 text-sm">
      <span class="text-ink-mut">${label}</span>
      <span class="font-mono">${formatBRL(cents)}</span>
    </div>`;
  const ok = t.left_to_spend_cents >= 0;
  return `
    <section class="paper-card grid md:grid-cols-2 gap-6 items-center">
      <div>
        <div class="label-caps text-ink-mut">POSSO GASTAR ESTE MÊS</div>
        <div class="font-display text-5xl ${ok ? 'text-sage' : 'text-clay'} leading-none mt-1">${formatBRL(t.left_to_spend_cents)}</div>
        <p class="text-sm text-ink-mut mt-2">de ${formatBRL(t.can_spend_cents)} previstos · ${formatBRL(t.spent_cents)} já gastos</p>
        <div class="mt-3">${meterBar(t.spent_cents, t.can_spend_cents, ok ? 'ok' : 'over')}</div>
      </div>
      <div class="md:border-l md:border-line md:pl-6 space-y-2">
        ${line('Renda', t.monthly_income_cents)}
        ${line('Custos fixos', t.fixed_costs_cents)}
        ${line('Meta de poupança', t.savings_goal_cents)}
        <div class="pt-2 border-t border-line">${line('Projeção de sobra', t.projected_savings_cents)}</div>
      </div>
    </section>`;
}

export function renderHero(d) {
  return d.configured ? renderHeroConfigured(d) : renderHeroInitial(d);
}

// Lista plana: os cabeçalhos de grupo sumiram junto com os grupos.
export function renderCategories(d) {
  const month = d.month || '';
  const rows = d.categories
    .map((c) => {
      const carry = c.carry_in_cents || 0;
      const eff = c.effective_spent_cents ?? c.spent_cents;
      const right =
        c.limit_cents > 0
          ? `<span class="font-mono text-sm text-ink-mut">${formatBRL(eff)} / ${formatBRL(c.limit_cents)}</span>`
          : `<span class="font-mono text-sm text-ink-mut">${formatBRL(eff)} <span class="text-xs">· sem limite</span></span>`;
      const meter =
        c.limit_cents > 0
          ? `<div class="mt-2 flex items-center gap-3">
             <div class="flex-1">${meterBar(eff, c.limit_cents, c.status)}</div>
             ${carry > 0 ? `<span class="pill pill-over">+${formatBRL(carry)} saldo</span>` : ''}
             ${statusPill(c.status)}
           </div>`
          : '';
      return `
      <a href="category.html?id=${c.category_id}&month=${month}"
         class="paper-card block hover:border-sage transition-colors">
        <div class="flex items-baseline justify-between gap-4">
          <span class="font-semibold">${esc(c.name)}</span>
          ${right}
        </div>
        ${meter}
      </a>`;
    })
    .join('');
  return `
    <section class="mt-8">
      <h2 class="font-display text-2xl text-ink mb-3">Por categoria</h2>
      <div class="space-y-3">${rows}</div>
    </section>`;
}

// Não é banner de "complete seu perfil": é o convite para o ritual (§6).
export function renderReviewInvite() {
  return `
    <section class="paper-card mt-8 flex flex-col md:flex-row md:items-center gap-4">
      <div class="flex-1">
        <h2 class="font-display text-xl text-ink">Ainda sem tetos por categoria</h2>
        <p class="text-sm text-ink-mut mt-1">Definir renda, custos fixos e limites é o primeiro passo da revisão mensal.</p>
      </div>
      <a href="decidir.html" class="btn-ghost whitespace-nowrap self-start md:self-auto">Começar a revisão</a>
    </section>`;
}

// Duas chamadas que já existem; o painel é montado no cliente (design §B.4). Um
// erro aqui não pode derrubar o Acompanhar inteiro — o painel some, o resto fica.
async function loadCommitments(month) {
  const el = document.getElementById('commitments');
  if (!el) return;
  try {
    const [installments, recurring] = await Promise.all([
      api.get(`/api/installment-groups?month=${month}`),
      api.get('/api/recurring'),
    ]);
    el.innerHTML = renderCommitments(buildCommitments(installments, recurring));
  } catch {
    el.innerHTML = '';
  }
}

// Painel novo, carregado à parte do resto (mesmo padrão de `loadCommitments`):
// chamada assíncrona própria, erro não derruba o resto da tela. Sem filtro de
// mês — uma dívida de fevereiro continua valendo em abril (design "API"), então
// ao contrário de `load`/`loadCommitments` este painel não reage à troca de mês.
async function loadReceivables() {
  const el = document.getElementById('receivables');
  if (!el) return;
  try {
    const rows = await api.get('/api/transactions/receivables');
    el.innerHTML = renderReceivables(rows);
    el.querySelectorAll('button[data-receive]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await api.post(`/api/transactions/${b.dataset.receive}/split-received`);
          loadReceivables();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  } catch {
    el.innerHTML = '';
  }
}

async function load(month) {
  try {
    const d = await api.get(`/api/dashboard?month=${month}`);
    const sub = document.getElementById('subtitle');
    if (sub) sub.textContent = monthSubtitle(d, new Date().toISOString().slice(0, 10));
    document.getElementById('hero').innerHTML = renderHero(d);
    document.getElementById('body').innerHTML = d.configured
      ? renderCategories(d) + renderAdvisor(d)
      : renderReviewInvite();
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => {
    load(monthEl.value);
    loadCommitments(monthEl.value);
  });
  load(monthEl.value);
  loadCommitments(monthEl.value);
  loadReceivables();
}
