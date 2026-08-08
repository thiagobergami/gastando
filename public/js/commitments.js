import { esc, formatBRL, monthShort } from './format.js';

// O último mês de um parcelamento é derivado, não um campo do payload: com
// `first_month` e `total_count` a conta é fechada (design §B.4).
export function lastMonth(firstMonth, count) {
  const [y, m] = String(firstMonth).split('-').map(Number);
  const total = y * 12 + (m - 1) + Math.max(0, count - 1);
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Montado no cliente, das duas chamadas que já existem. `GET /api/recurring`
// devolve também os templates desativados, então o filtro por `active` é aqui.
export function buildCommitments(installments, recurring) {
  const rows = [
    ...installments
      .filter((i) => i.remaining_count > 0)
      .map((i) => ({
        kind: 'installment',
        label: i.description,
        detail: `parcela ${i.paid_count} de ${i.total_count} · até ${monthShort(
          lastMonth(i.first_month, i.total_count),
        )}`,
        monthly_cents: i.monthly_cents,
        href: '/parcelas.html',
      })),
    ...recurring
      .filter((r) => r.active)
      .map((r) => ({
        kind: 'recurring',
        label: r.description,
        detail: 'repete todo mês',
        monthly_cents: r.amount_cents,
        href: '/recurring.html',
      })),
  ];
  return { rows, total_cents: rows.reduce((sum, r) => sum + r.monthly_cents, 0) };
}

// Só leitura: cada linha é um link para a tela que gerencia aquilo. `parcelas.html`
// e `recurring.html` saíram da navegação mas seguem existindo (design §B.4).
export function renderCommitments(model) {
  if (!model.rows.length) return '';
  const rows = model.rows
    .map(
      (r) => `
      <a href="${r.href}" class="flex items-baseline justify-between gap-4 py-3 border-b border-line hover:text-sage">
        <span>
          <span class="block">${esc(r.label)}</span>
          <span class="block text-sm text-ink-mut">${esc(r.detail)}</span>
        </span>
        <span class="font-mono whitespace-nowrap">${formatBRL(r.monthly_cents)} /mês</span>
      </a>`,
    )
    .join('');
  return `
    <section class="paper-card mt-8">
      <h2 class="font-display text-2xl text-ink">Compromissos futuros</h2>
      <p class="text-sm text-ink-mut mt-1 mb-2">O que já está reservado antes de você gastar qualquer coisa.</p>
      ${rows}
      <div class="flex items-baseline justify-between gap-4 pt-3">
        <span class="font-semibold">Já comprometido por mês</span>
        <span class="font-mono text-sage">${formatBRL(model.total_cents)}</span>
      </div>
    </section>`;
}
