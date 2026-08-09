import { PALETTE } from './charts.js';
import { capitalize, esc, formatBRL, MINUS, monthName } from './format.js';

const NUM_WORDS = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
];

const year = (ym) => Number(String(ym).slice(0, 4));

// `'Março a agosto de 2026 · seis meses de histórico'`. O numeral por extenso vai
// até doze; além disso o algarismo lê melhor do que "dezesseis".
export function rangeSentence(months) {
  if (!months.length) return '';
  const first = months[0];
  const last = months[months.length - 1];
  const span =
    year(first) === year(last)
      ? months.length === 1
        ? `${capitalize(monthName(last))} de ${year(last)}`
        : `${capitalize(monthName(first))} a ${monthName(last)} de ${year(last)}`
      : `${capitalize(monthName(first))} de ${year(first)} a ${monthName(last)} de ${year(last)}`;
  const n = months.length;
  const count = n < NUM_WORDS.length ? NUM_WORDS[n] : String(n);
  return `${span} · ${count} ${n === 1 ? 'mês' : 'meses'} de histórico`;
}

// A moldura de cada pergunta. O título É a pergunta — é a regra do §8 da spec.
export function questionCard({ question, note, body, wide = false }) {
  return `
    <section class="paper-card${wide ? ' lg:col-span-2' : ''}">
      <h2 class="font-display text-2xl text-ink">${esc(question)}</h2>
      ${note ? `<p class="text-sm text-ink-mut mt-1">${esc(note)}</p>` : ''}
      <div class="mt-4">${body}</div>
    </section>`;
}

// --- 1. Para onde meu dinheiro foi? ---

export function composition(trends, topN = 4) {
  const months = trends.months ?? [];
  if (!months.length) return { month: '', total_cents: 0, rows: [] };
  const i = months.length - 1;
  const all = trends.series
    .map((s) => ({ name: s.name, spent_cents: s.spent_cents[i] ?? 0 }))
    .filter((s) => s.spent_cents > 0)
    .sort((a, b) => b.spent_cents - a.spent_cents);
  const total_cents = all.reduce((sum, s) => sum + s.spent_cents, 0);
  const head = all.slice(0, topN);
  const tail = all.slice(topN).reduce((sum, s) => sum + s.spent_cents, 0);
  const rows = tail > 0 ? [...head, { name: 'Outras', spent_cents: tail }] : head;
  const pct = (c) => (total_cents > 0 ? Math.round((c / total_cents) * 100) : 0);
  return {
    month: months[i],
    total_cents,
    rows: rows.map((r) => ({ ...r, pct: pct(r.spent_cents) })),
  };
}

export function renderComposition(model) {
  if (!model.rows.length) return `<p class="text-ink-mut">Nenhum lançamento neste mês.</p>`;
  const bar = model.rows
    .map(
      (r, i) =>
        `<div class="h-4 rounded-full" style="width:${r.pct}%;background:${PALETTE[i % PALETTE.length]}"></div>`,
    )
    .join('');
  const legend = model.rows
    .map(
      (r, i) => `
      <div class="flex items-baseline justify-between gap-4 py-1.5">
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${PALETTE[i % PALETTE.length]}"></span>
          ${esc(r.name)}
        </span>
        <span class="font-mono text-sm text-ink-mut whitespace-nowrap">${formatBRL(r.spent_cents)} · ${r.pct}%</span>
      </div>`,
    )
    .join('');
  return `<div class="flex gap-1 mb-4">${bar}</div>${legend}`;
}

// --- 2. Estou gastando mais ou menos que antes? ---

export function monthlyTotals(trends) {
  const months = trends.months ?? [];
  return {
    months,
    totals_cents: months.map((_, i) =>
      trends.series.reduce((sum, s) => sum + (s.spent_cents[i] ?? 0), 0),
    ),
  };
}

// O veredito que o frame põe como subtítulo. Precisa de quatro meses: três para
// a média e um para comparar. Média zero não tem base — a frase some.
export function trendVerdict(totals) {
  if (totals.length < 4) return '';
  const last = totals[totals.length - 1];
  const prev = totals.slice(-4, -1);
  const avg = prev.reduce((a, b) => a + b, 0) / 3;
  if (avg === 0) return '';
  const pct = Math.round(((last - avg) / avg) * 100);
  if (pct === 0) return 'Na média dos últimos 3 meses';
  const head = pct < 0 ? `Menos: ${MINUS}${-pct}%` : `Mais: +${pct}%`;
  return `${head} contra a média dos últimos 3 meses`;
}

// --- 3. O que mais mudou este mês? ---

// Variação, não maior série absoluta (decisão 6 do design). "Caiu R$ 200" é uma
// resposta tão válida quanto "subiu R$ 200", então a ordem é por módulo.
export function changes(trends, limit = 4) {
  const months = trends.months ?? [];
  if (months.length < 2) return [];
  const i = months.length - 1;
  return trends.series
    .map((s) => {
      const now = s.spent_cents[i] ?? 0;
      const before = s.spent_cents[i - 1] ?? 0;
      const delta_cents = now - before;
      return {
        name: s.name,
        delta_cents,
        pct: before > 0 ? Math.round((delta_cents / before) * 100) : null,
      };
    })
    .filter((r) => r.delta_cents !== 0)
    .sort(
      (a, b) => Math.abs(b.delta_cents) - Math.abs(a.delta_cents) || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export function changeAmount(delta) {
  return `${delta < 0 ? MINUS : '+'} ${formatBRL(Math.abs(delta))}`;
}

export function renderChanges(rows) {
  if (!rows.length) return `<p class="text-ink-mut">Nada mudou de forma relevante.</p>`;
  return rows
    .map((r) => {
      const tone = r.delta_cents > 0 ? 'text-clay' : 'text-ink-mut';
      const pct =
        r.pct === null
          ? ''
          : `<span class="font-mono text-sm ${tone} w-14 text-right">${r.pct < 0 ? MINUS : '+'}${Math.abs(r.pct)}%</span>`;
      return `
      <div class="flex items-baseline justify-between gap-4 py-3 border-b border-line last:border-0">
        <span>${esc(r.name)}</span>
        <span class="flex items-baseline gap-4">
          <span class="font-mono ${tone} whitespace-nowrap">${changeAmount(r.delta_cents)}</span>
          ${pct}
        </span>
      </div>`;
    })
    .join('');
}

// --- 4. Quanto do meu gasto já é compromisso assumido? ---

// A ordem das séries é contratual (use-cases/bi.ts): [0] comprometido,
// [1] discricionário. Ler por índice sobrevive a uma mudança de tradução.
export function splitAt(payload, index) {
  const i = index ?? payload.months.length - 1;
  const committed_cents = payload.series[0].spent_cents[i] ?? 0;
  const discretionary_cents = payload.series[1].spent_cents[i] ?? 0;
  const total_cents = committed_cents + discretionary_cents;
  return {
    committed_cents,
    discretionary_cents,
    total_cents,
    committed_pct: total_cents > 0 ? Math.round((committed_cents / total_cents) * 100) : 0,
  };
}

export function renderSplit(model) {
  if (model.total_cents === 0) return `<p class="text-ink-mut">Nenhum lançamento neste mês.</p>`;
  const row = (color, label, cents) => `
    <div class="flex items-baseline justify-between gap-4 py-1.5">
      <span class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
        ${label}
      </span>
      <span class="font-mono text-sm text-ink-mut whitespace-nowrap">${formatBRL(cents)}</span>
    </div>`;
  return `
    <div class="flex gap-1 mb-4">
      <div class="h-4 rounded-full" style="width:${model.committed_pct}%;background:${PALETTE[3]}"></div>
      <div class="h-4 rounded-full" style="width:${100 - model.committed_pct}%;background:${PALETTE[4]}"></div>
    </div>
    ${row(PALETTE[3], 'Comprometido — parcelas e recorrentes', model.committed_cents)}
    ${row(PALETTE[4], 'Discricionário — o que você decide no mês', model.discretionary_cents)}`;
}
