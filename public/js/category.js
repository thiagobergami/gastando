import { api, showError } from './api.js';
import { formatBRL, currentMonth, addMonths, esc } from './format.js';
import { mountChrome } from './chrome.js';
import { meterBar, statusPill } from './ui.js';
import { lineChart } from './charts.js';

const $ = (id) => document.getElementById(id);

function params() {
  const q = new URLSearchParams(location.search);
  return { id: Number(q.get('id')), month: q.get('month') || currentMonth() };
}

export function renderRows(rows) {
  if (!rows.length) {
    return `<tr><td class="py-4 text-ink-mut" colspan="3">No transactions this month.</td></tr>`;
  }
  return rows
    .map(
      (r) => `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${r.date}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
    </tr>`,
    )
    .join('');
}

export function renderSummary({ spent_cents, limit_cents }) {
  const remaining = limit_cents - spent_cents;
  const status = spent_cents > limit_cents ? 'over' : 'ok';
  return `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-mut mb-2">
      <span>Spent <b class="text-ink font-mono">${formatBRL(spent_cents)}</b></span>
      <span>Limit <b class="text-ink font-mono">${formatBRL(limit_cents)}</b></span>
      <span>Left <b class="text-ink font-mono">${formatBRL(remaining)}</b></span>
      ${statusPill(status)}
    </div>
    ${meterBar(spent_cents, limit_cents, status)}`;
}

async function load(id, month) {
  try {
    const from = addMonths(month, -5);
    const [rows, trend] = await Promise.all([
      api.get(`/api/transactions?category_id=${id}&month=${month}`),
      api.get(`/api/bi/category-trend?category_id=${id}&from=${from}&to=${month}`),
    ]);
    const spent_cents = rows.reduce((s, r) => s + r.amount_cents, 0);
    const limitSeries = trend.series.find((s) => s.name === 'Limit');
    const limit_cents = limitSeries.spent_cents[limitSeries.spent_cents.length - 1];
    $('summary').innerHTML = renderSummary({ spent_cents, limit_cents });
    $('list').innerHTML = renderRows(rows);
    lineChart('trend', trend.months, trend.series, false);
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/');
  const { id, month } = params();
  $('month').value = month;
  api
    .get('/api/categories')
    .then((cats) => {
      const cat = cats.find((c) => c.id === id);
      if (!cat) {
        $('catName').textContent = 'Category not found';
        return;
      }
      $('catName').textContent = cat.name;
      $('month').addEventListener('change', () => {
        const q = new URLSearchParams(location.search);
        q.set('month', $('month').value);
        history.replaceState(null, '', `?${q}`);
        load(id, $('month').value);
      });
      load(id, month);
    })
    .catch((e) => showError(e.message));
}
