import { api, showError } from './api.js';
import { currentMonth, addMonths } from './format.js';
import { mountChrome } from './chrome.js';
import { lineChart } from './charts.js';

async function run() {
  try {
    const qs = `from=${document.getElementById('from').value}&to=${document.getElementById('to').value}`;
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
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('chart')) {
  mountChrome('/bi.html');
  document.getElementById('from').value = currentMonth();
  document.getElementById('to').value = addMonths(currentMonth(), 6);
  document.getElementById('run').addEventListener('click', run);
  run();
}
