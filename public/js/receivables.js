import { esc, formatBRL, monthShort } from './format.js';

export function localCurrentMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function pendingReceivables(rows) {
  return rows.filter((r) => !r.received);
}

export function totalPendingCents(rows) {
  return pendingReceivables(rows).reduce((sum, r) => sum + r.amount_cents, 0);
}

export function classifyReceivables(rows, currentMonth) {
  const ordered = [...rows].sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      (a.installment_no ?? 0) - (b.installment_no ?? 0) ||
      a.transaction_id - b.transaction_id,
  );
  return {
    due: ordered.filter((r) => !r.received && r.month <= currentMonth),
    future: ordered.filter((r) => !r.received && r.month > currentMonth),
    received: ordered.filter((r) => r.received),
  };
}

function renderLine(r) {
  return `
    <div class="flex items-baseline justify-between gap-4 py-3 border-b border-line last:border-0">
      <span>
        <span class="block">${esc(r.person_name)} · ${esc(r.description)}</span>
        <span class="block text-sm text-ink-mut">${monthShort(r.month)}${r.installment_no ? ` · parcela ${r.installment_no}/${r.installment_total}` : ''}</span>
      </span>
      <span class="flex items-center gap-3">
        <span class="font-mono whitespace-nowrap">${formatBRL(r.amount_cents)}</span>
        <button type="button" ${r.received ? 'data-unreceive' : 'data-receive'}="${r.transaction_id}" class="text-sage text-sm">${r.received ? 'Desmarcar recebido' : 'Marcar recebido'}</button>
      </span>
    </div>`;
}

function renderSection(title, rows) {
  if (!rows.length) return '';
  return `<div class="mt-4">
    <div class="flex items-baseline justify-between gap-4 border-b border-line pb-3">
      <h3 class="font-semibold">${title}</h3>
      <span class="font-mono">${formatBRL(totalPendingCents(rows))}</span>
    </div>
    ${rows.map(renderLine).join('')}
  </div>`;
}

export function renderReceivables(rows, currentMonth = localCurrentMonth()) {
  if (!rows.length) return '';
  const { due, future, received } = classifyReceivables(rows, currentMonth);
  return `
    <section class="paper-card mt-8">
      <h2 class="font-display text-2xl text-ink">A receber</h2>
      <div class="flex items-baseline justify-between gap-4 pb-3 border-b border-line">
        <span class="font-semibold">Total pendente</span>
        <span class="font-mono text-sage">${formatBRL(totalPendingCents(rows))}</span>
      </div>
      ${renderSection('A receber até este mês', due)}
      ${renderSection('Previsto para os próximos meses', future)}
      ${received.length ? `<details class="mt-4"><summary class="text-sm text-ink-mut">Recebidos (${received.length})</summary>${received.map(renderLine).join('')}</details>` : ''}
    </section>`;
}
