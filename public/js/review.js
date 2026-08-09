import { addMonths, esc, formatBRL, MINUS, monthName } from './format.js';

export const STEPS = ['O mês que passou', 'Compromissos', 'Seu modelo', 'Orçamentos', 'Simular'];

const SUBTITLES = [
  'Passo 1 de 5 · só leitura, nada a decidir ainda',
  'Passo 2 de 5 · o que já está reservado no mês que começa',
  'Passo 3 de 5 · o único momento em que o app pergunta números sobre você',
  'Passo 4 de 5 · começamos pelas categorias que estouraram',
  'Passo 5 de 5 · opcional — e se eu comprar algo parcelado?',
];

// Decisão C.3: o mês fechado é sempre o anterior, sem esperteza de fim de mês.
// `today` entra como parâmetro — uma função que lê o relógio por dentro não tem
// como ser testada.
export function reviewMonths(today) {
  const opening = String(today).slice(0, 7);
  return { closed: addMonths(opening, -1), opening };
}

export function stepSubtitle(current) {
  return SUBTITLES[current - 1] ?? 'Revisão concluída';
}

const CHECK =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l5 5L20 7"/></svg>';

// Pílulas no desktop, barra de progresso no mobile (frames 18:3 e 25:86) — o
// mesmo padrão de dois cabeçalhos que `chrome.js` já usa. Cada passo é um botão:
// nada é obrigatório e a trilha é a saída de emergência (§B.4 do design).
export function stepTrail(current) {
  const pills = STEPS.map((label, i) => {
    const n = i + 1;
    const state = n === current ? ' step-active' : n < current ? ' step-done' : '';
    const mark = n < current ? CHECK : String(n);
    return `<button type="button" data-step="${n}" class="step${state}"><span class="step-no">${mark}</span>${esc(label)}</button>`;
  }).join('');
  const pct = Math.round((Math.min(current, STEPS.length) / STEPS.length) * 100);
  const label = STEPS[Math.min(current, STEPS.length) - 1] ?? '';
  return `
    <div class="step-indicator">${pills}</div>
    <div class="step-progress">
      <div class="flex items-baseline justify-between label-caps text-ink-mut mb-1.5">
        <span>PASSO ${Math.min(current, STEPS.length)} DE ${STEPS.length} · ${esc(label.toUpperCase())}</span>
        <span>${pct}%</span>
      </div>
      <div class="meter"><div class="meter-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// Estouradas primeiro — é a ordem que o §9 passo 4 pede e o frame 19:70 mostra.
// Limite zero é "sem limite", não "estourou": não dá para estourar o que não
// existe. Ordena numa cópia, para não surpreender quem passou o array.
export function overspentFirst(rows) {
  const over = (r) => r.limit_cents > 0 && r.spent_cents > r.limit_cents;
  return [...rows].sort(
    (a, b) => Number(over(b)) - Number(over(a)) || b.spent_cents - a.spent_cents,
  );
}

const reais = (cents) => Math.round(cents / 100).toLocaleString('pt-BR');

// A conta escrita por extenso sob o campo, como o frame 19:12: ver a subtração
// é o que torna "posso gastar" um número explicado em vez de mágico.
export function modelSummary(income, fixed, goal) {
  return {
    can_spend_cents: income - fixed - goal,
    formula: `${reais(income)} ${MINUS} ${reais(fixed)} ${MINUS} ${reais(goal)}`,
  };
}

// O fim da revisão diz o que mudou, não o que existe. Sair sem decidir nada é um
// resultado legítimo, e a frase reconhece isso em vez de repreender.
//
// Devolve TEXTO PURO, não HTML — quem renderiza escapa (`renderDone` em
// decidir.js faz `esc(l)` em cada linha). Escapar aqui também faria dupla
// escapada: `Restaurantes & Delivery` viraria `Restaurantes &amp; Delivery` na
// tela. `stepTrail`, logo acima, devolve HTML e por isso escapa — a diferença
// entre as duas é deliberada.
export function summaryLines(decisions) {
  const lines = [];
  if (decisions.model) {
    const m = decisions.model;
    lines.push(
      `Modelo de ${monthName(decisions.opening)} gravado: renda ${formatBRL(m.income_cents)}, ` +
        `custos fixos ${formatBRL(m.fixed_costs_cents)}, meta ${formatBRL(m.savings_goal_cents)}.`,
    );
  }
  for (const l of decisions.limits) {
    lines.push(`${l.name}: ${formatBRL(l.from_cents)} → ${formatBRL(l.to_cents)}`);
  }
  if (!lines.length) {
    return ['Você passou pela revisão sem mudar nada. Está tudo como estava.'];
  }
  return lines;
}
