import { api, showError } from './api.js';
import { lineChart, savingsChart } from './charts.js';
import { mountChrome } from './chrome.js';
import { addMonths, capitalize, currentMonth, formatBRL, monthName } from './format.js';
import {
  changes,
  composition,
  monthlyTotals,
  questionCard,
  rangeSentence,
  renderChanges,
  renderComposition,
  renderSplit,
  splitAt,
  trendVerdict,
} from './pauta.js';

const $ = (id) => document.getElementById(id);

// Os cinco cards do frame 15:3, na ordem em que a pauta do §8 pergunta. Os dois
// que têm gráfico nascem com o `<canvas>` dentro do próprio card.
function renderPauta({ trends, split, savings }) {
  const comp = composition(trends);
  const totals = monthlyTotals(trends);
  const chg = changes(trends);
  const sp = splitAt(split);
  const months = trends.months;
  const previous = months.length > 1 ? months[months.length - 2] : '';
  const goal = savings.series[1].spent_cents;
  const lastGoal = goal[goal.length - 1] ?? 0;

  return [
    questionCard({
      question: 'Para onde meu dinheiro foi?',
      note: `${capitalize(monthName(comp.month))} de ${String(comp.month).slice(0, 4)} · ${formatBRL(comp.total_cents)}`,
      body: renderComposition(comp),
    }),
    questionCard({
      question: 'Estou gastando mais ou menos que antes?',
      note: trendVerdict(totals.totals_cents),
      body: '<canvas id="totalTrend" height="150"></canvas>',
    }),
    questionCard({
      question: 'O que mais mudou este mês?',
      note: previous ? `Contra ${monthName(previous)} de ${previous.slice(0, 4)}` : '',
      body: renderChanges(chg),
    }),
    questionCard({
      question: 'Quanto do meu gasto já é compromisso assumido?',
      note: sp.total_cents ? `${sp.committed_pct}% do mês estava decidido antes de começar` : '',
      body: renderSplit(sp),
    }),
    questionCard({
      question: 'Quanto eu de fato guardei?',
      note: `Poupança realizada contra a meta de ${formatBRL(lastGoal)} — o número-herói do app, que até hoje não tinha histórico`,
      body: '<canvas id="savings" height="150"></canvas>',
      wide: true,
    }),
  ].join('');
}

async function run() {
  try {
    const qs = `from=${$('from').value}&to=${$('to').value}`;
    const [trends, split, savings] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`),
      api.get(`/api/bi/committed-vs-discretionary?${qs}`),
      api.get(`/api/bi/savings-realized?${qs}`),
    ]);
    $('range').textContent = rangeSentence(trends.months);
    $('pauta').innerHTML = renderPauta({ trends, split, savings });

    const totals = monthlyTotals(trends);
    lineChart(
      'totalTrend',
      totals.months,
      [{ name: 'Gasto no mês', spent_cents: totals.totals_cents }],
      false,
    );
    savingsChart(
      'savings',
      savings.months,
      savings.series[0].spent_cents,
      savings.series[1].spent_cents,
    );
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && $('pauta')) {
  mountChrome('/analise.html');
  // Todas as cinco perguntas são retrospectivas, então o padrão olha para trás
  // — o intervalo antigo mostrava seis meses que ainda não aconteceram (§A.3).
  $('to').value = currentMonth();
  $('from').value = addMonths(currentMonth(), -5);
  $('run').addEventListener('click', run);
  window.addEventListener('themechange', run);
  run();
}
