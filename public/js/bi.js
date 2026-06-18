import { api, showError } from './api.js';
import { currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('to').value = currentMonth();
$('from').value = currentMonth().slice(0, 5) + '01'; // Jan of current year

const charts = {};

// Renders one line chart. `series` items each have { name, spent_cents: number[] }.
// `onlyNonZero` drops flat-zero series (used for the per-category chart which has many).
function lineChart(canvasId, labels, series, onlyNonZero) {
  const datasets = series
    .filter(s => !onlyNonZero || s.spent_cents.some(v => v > 0))
    .map(s => ({ label: s.name, data: s.spent_cents.map(c => c / 100), fill: false, tension: 0.3 }));
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart($(canvasId), {
    type: 'line',
    data: { labels, datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

async function run() {
  try {
    const qs = `from=${$('from').value}&to=${$('to').value}`;
    const [trends, byCard, byGroup, bva, forecast] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`),
      api.get(`/api/bi/by-card?${qs}`),
      api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`),
      api.get(`/api/bi/installment-forecast?${qs}`),
    ]);
    lineChart('chart', trends.months, trends.series, true);
    lineChart('byCard', byCard.months, byCard.series, false);
    lineChart('byGroup', byGroup.months, byGroup.series, false);
    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
  } catch (e) { showError(e.message); }
}

$('run').addEventListener('click', run);
run();
