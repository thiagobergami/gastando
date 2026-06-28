import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth, esc } from './format.js';
import { mountChrome } from './chrome.js';
import { meterBar, statusPill } from './ui.js';

const $ = (id) => document.getElementById(id);

export function renderResult(d) {
  const overCount = d.months.filter((m) => m.status === 'over').length;
  const summary = `<div class="pill ${overCount ? 'pill-over' : 'pill-ok'} mb-4">Over limit in ${overCount} of ${d.months.length} months</div>`;
  const cards = d.months
    .map((m) => {
      const spent = m.limit_cents - m.remaining_after_cents; // projected new total
      return `
      <div class="paper-card">
        <div class="flex items-center justify-between">
          <span class="font-display text-lg">${m.month}</span>
          ${statusPill(m.status)}
        </div>
        <div class="font-mono text-xs text-ink-mut mt-1">
          Limit ${formatBRL(m.limit_cents)} · +Parcela ${formatBRL(m.installment_cents)} · New total ${formatBRL(spent)}
        </div>
        <div class="mt-3">${meterBar(spent, m.limit_cents, m.status)}</div>
      </div>`;
    })
    .join('');
  return `${summary}<div class="space-y-3">${cards}</div>`;
}

async function run() {
  try {
    const total_cents = reaisToCents($('amount').value);
    if (!Number.isInteger(total_cents) || total_cents <= 0) {
      showError('Enter a total amount');
      return;
    }
    const params = new URLSearchParams({
      category_id: $('category').value,
      total_cents,
      count: Number($('count').value) || 1,
      first_month: $('firstMonth').value,
    });
    const d = await api.get('/api/simulate?' + params.toString());
    $('result').innerHTML = renderResult(d);
  } catch (e) {
    showError(e.message);
  }
}

async function loadCategories() {
  try {
    const cats = await api.get('/api/categories');
    $('category').innerHTML = cats
      .filter((c) => c.active)
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join('');
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('result')) {
  mountChrome('/simulate.html');
  $('firstMonth').value = currentMonth();
  $('run').addEventListener('click', run);
  loadCategories();
}
