import { api, showError } from './api.js';
import { currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('to').value = currentMonth();
$('from').value = currentMonth().slice(0, 5) + '01'; // Jan of current year
let chart;

async function run() {
  try {
    const d = await api.get(`/api/bi/trends?from=${$('from').value}&to=${$('to').value}`);
    const datasets = d.series
      .filter(s => s.spent_cents.some(v => v > 0))
      .map(s => ({ label: s.name, data: s.spent_cents.map(c => c / 100), fill: false, tension: 0.3 }));
    if (chart) chart.destroy();
    chart = new Chart($('chart'), {
      type: 'line',
      data: { labels: d.months, datasets },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  } catch (e) { showError(e.message); }
}
$('run').addEventListener('click', run);
run();
