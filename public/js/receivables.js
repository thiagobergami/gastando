import { esc, formatBRL, monthShort } from './format.js';

// "A tela é sobre o que falta receber, não um histórico" (design "UI —
// Acompanhar") — splits já recebidos somem da lista e do total.
export function pendingReceivables(rows) {
  return rows.filter((r) => !r.received);
}

export function totalPendingCents(rows) {
  return pendingReceivables(rows).reduce((sum, r) => sum + r.amount_cents, 0);
}

export function renderReceivables(rows) {
  const pending = pendingReceivables(rows);
  if (!pending.length) return '';
  const lines = pending
    .map(
      (r) => `
      <div class="flex items-baseline justify-between gap-4 py-3 border-b border-line last:border-0">
        <span>
          <span class="block">${esc(r.person_name)} · ${esc(r.description)}</span>
          <span class="block text-sm text-ink-mut">${monthShort(r.month)}</span>
        </span>
        <span class="flex items-center gap-3">
          <span class="font-mono whitespace-nowrap">${formatBRL(r.amount_cents)}</span>
          <button type="button" data-receive="${r.transaction_id}" class="text-sage text-sm">Marcar recebido</button>
        </span>
      </div>`,
    )
    .join('');
  return `
    <section class="paper-card mt-8">
      <h2 class="font-display text-2xl text-ink">A receber</h2>
      <div class="flex items-baseline justify-between gap-4 pb-3 border-b border-line">
        <span class="font-semibold">Total pendente</span>
        <span class="font-mono text-sage">${formatBRL(totalPendingCents(rows))}</span>
      </div>
      ${lines}
    </section>`;
}
