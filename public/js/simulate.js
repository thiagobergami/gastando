import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL, reaisToCents } from './format.js';
import { meterBar, statusPill } from './ui.js';

const $ = (id) => document.getElementById(id);

export function simulateAdvisory(months) {
  const over = months.filter((m) => m.status === 'over').length;
  if (over === 0) return 'Este plano cabe no seu orçamento em todos os meses.';
  return `Este plano excede o limite em ${over} de ${months.length} meses — considere reduzir o número de parcelas.`;
}

export function renderResult(d) {
  const rows = d.months
    .map((m) => {
      const newTotal = m.limit_cents - m.remaining_after_cents;
      const projected = newTotal - m.installment_cents;
      return `
        <tr class="border-b border-line ${m.status === 'over' ? 'bg-clay-soft/10' : ''}">
          <td class="py-2 font-mono text-sm">${m.month}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(m.limit_cents)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(projected)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(m.installment_cents)}</td>
          <td class="py-2 text-right font-mono text-sm">${formatBRL(newTotal)}</td>
          <td class="py-2 text-right">${statusPill(m.status)}</td>
        </tr>`;
    })
    .join('');
  const meters = d.months
    .map((m) => {
      const newTotal = m.limit_cents - m.remaining_after_cents;
      return `<div class="mb-3">
        <div class="flex justify-between text-xs text-ink-mut mb-1"><span class="font-mono">${m.month}</span><span class="font-mono">${formatBRL(newTotal)} / ${formatBRL(m.limit_cents)}</span></div>
        ${meterBar(newTotal, m.limit_cents, m.status)}
      </div>`;
    })
    .join('');
  return `
    <div class="grid md:grid-cols-[1fr,320px] gap-6">
      <div class="paper-card overflow-x-auto">
        <table class="w-full text-left">
          <thead><tr class="text-xs uppercase tracking-wide text-ink-mut border-b border-line">
            <th class="py-2 font-semibold">Mês</th>
            <th class="py-2 text-right font-semibold">Limite</th>
            <th class="py-2 text-right font-semibold">Gasto projetado</th>
            <th class="py-2 text-right font-semibold">+Esta compra</th>
            <th class="py-2 text-right font-semibold">Novo total</th>
            <th class="py-2 text-right font-semibold">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <aside class="paper-card">
        <h2 class="font-display text-lg mb-3">Análise de Impacto</h2>
        ${meters}
        <p class="text-sm text-ink-mut mt-4 border-t border-line pt-3">${simulateAdvisory(d.months)}</p>
      </aside>
    </div>`;
}

async function run() {
  try {
    const total_cents = reaisToCents($('amount').value);
    if (!Number.isInteger(total_cents) || total_cents <= 0) {
      showError('Informe um valor total');
      return;
    }
    const params = new URLSearchParams({
      category_id: $('category').value,
      total_cents,
      count: Number($('count').value) || 1,
      first_month: $('firstMonth').value,
    });
    const d = await api.get(`/api/simulate?${params.toString()}`);
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
