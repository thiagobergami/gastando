import { api, showError } from './api.js';
import { currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

export const PALETTE = ['#4c6455', '#d4af37', '#c27d60', '#5c7c84', '#8fa998', '#735c00'];

export function datasetsFor(series, onlyNonZero) {
  return series
    .filter(s => !onlyNonZero || s.spent_cents.some(v => v > 0))
    .map((s, i) => ({
      label: s.name,
      data: s.spent_cents.map(c => c / 100),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length],
      fill: false,
      tension: 0.3,
    }));
}

const charts = {};
function lineChart(canvasId, labels, series, onlyNonZero) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels, datasets: datasetsFor(series, onlyNonZero) },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
        y: { ticks: { font: { family: 'JetBrains Mono' } }, grid: { color: '#e4e2dd' } },
      },
    },
  });
}

async function run() {
  try {
    const qs = `from=${document.getElementById('from').value}&to=${document.getElementById('to').value}`;
    const [trends, byCard, byGroup, bva, forecast] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`), api.get(`/api/bi/by-card?${qs}`), api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`), api.get(`/api/bi/installment-forecast?${qs}`),
    ]);
    lineChart('chart', trends.months, trends.series, true);
    lineChart('byCard', byCard.months, byCard.series, false);
    lineChart('byGroup', byGroup.months, byGroup.series, false);
    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('chart')) {
  mountChrome('/bi.html');
  document.getElementById('to').value = currentMonth();
  document.getElementById('from').value = currentMonth().slice(0, 5) + '01';
  document.getElementById('run').addEventListener('click', run);
  run();
}
