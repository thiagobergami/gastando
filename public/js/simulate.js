import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('firstMonth').value = currentMonth();

async function loadCategories() {
  try {
    const cats = await api.get('/api/categories');
    $('category').innerHTML = cats
      .filter(c => c.active)
      .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (e) { showError(e.message); }
}

async function run() {
  try {
    const total_cents = reaisToCents($('amount').value);
    if (!Number.isInteger(total_cents) || total_cents <= 0) { showError('Enter a total amount'); return; }
    const params = new URLSearchParams({
      category_id: $('category').value,
      total_cents,
      count: Number($('count').value) || 1,
      first_month: $('firstMonth').value,
    });
    const d = await api.get('/api/simulate?' + params.toString());
    render(d);
  } catch (e) { showError(e.message); }
}

function render(d) {
  const rows = d.months.map(m => `
    <tr class="${m.status === 'over' ? 'over' : ''}">
      <td>${m.month}</td>
      <td>${formatBRL(m.installment_cents)}</td>
      <td>${formatBRL(m.limit_cents)}</td>
      <td>${formatBRL(m.remaining_before_cents)}</td>
      <td>${formatBRL(m.remaining_after_cents)}</td>
      <td>${m.status}</td>
    </tr>`).join('');
  $('result').innerHTML = `
    <thead><tr>
      <th>Month</th><th>Installment</th><th>Limit</th>
      <th>Remaining before</th><th>Remaining after</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

$('run').addEventListener('click', run);
loadCategories();
