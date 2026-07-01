import { api, showError } from './api.js';
import { aggregateSeries, barChart, lineChart, topSeries } from './charts.js';
import { mountChrome } from './chrome.js';
import { addMonths, currentMonth } from './format.js';

async function run() {
  try {
    const qs = `from=${document.getElementById('from').value}&to=${document.getElementById('to').value}`;
    const [trends, byCard, byGroup, bva, forecast, savings] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`),
      api.get(`/api/bi/by-card?${qs}`),
      api.get(`/api/bi/by-group?${qs}`),
      api.get(`/api/bi/budget-vs-actual?${qs}`),
      api.get(`/api/bi/installment-forecast?${qs}`),
      api.get(`/api/bi/savings-trend?${qs}`),
    ]);
    lineChart('chart', trends.months, trends.series, true);

    const cardAgg = aggregateSeries(byCard.series);
    barChart(
      'byCard',
      cardAgg.map((s) => s.name),
      cardAgg.map((s) => s.total),
      { horizontal: false },
    );

    const groupAgg = aggregateSeries(byGroup.series);
    barChart(
      'byGroup',
      groupAgg.map((s) => s.name),
      groupAgg.map((s) => s.total),
      { horizontal: true },
    );
    const top = topSeries(byGroup.series);
    const impactEl = document.getElementById('byGroupImpact');
    if (impactEl) impactEl.textContent = top ? `Maior impacto: ${top.name}` : '';

    lineChart('budgetVsActual', bva.months, bva.series, false);
    lineChart('installmentForecast', forecast.months, forecast.series, false);
    lineChart('savingsTrend', savings.months, savings.series, false);
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('chart')) {
  mountChrome('/bi.html');
  document.getElementById('from').value = currentMonth();
  document.getElementById('to').value = addMonths(currentMonth(), 6);
  document.getElementById('run').addEventListener('click', run);
  window.addEventListener('themechange', run);
  run();
}
