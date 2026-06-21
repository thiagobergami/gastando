import { formatBRL } from './format.js';

// Pure budget-model helpers shared by the Settings page and the setup wizard.
// Kept free of DOM side-effects so either page can import them safely.

export function ceilingText(income, fixed, goal) {
  return `Healthy ceiling ${formatBRL(income - fixed - goal)}`;
}

export function renderLimitRows(cats, byCat) {
  return cats.filter(c => c.active).map(c => `
    <tr class="border-b border-line">
      <td class="py-2">${c.name}</td>
      <td class="py-2 text-right">
        <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
          class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
      </td>
    </tr>`).join('');
}

// --- Allocation reconciliation: do the category limits fit under the ceiling? ---

export function allocationStatus(limitCentsList, income, fixed, goal) {
  const ceiling = income - fixed - goal;
  const allocated = limitCentsList.reduce((sum, n) => sum + (n || 0), 0);
  const remaining = ceiling - allocated;
  return { ceiling, allocated, remaining, over: remaining < 0 };
}

export function allocationText(status) {
  const head = `Allocated ${formatBRL(status.allocated)} of ${formatBRL(status.ceiling)}`;
  return status.over
    ? `${head} · ${formatBRL(-status.remaining)} over ceiling`
    : `${head} · ${formatBRL(status.remaining)} left`;
}

export function allocationPillClass(status) {
  return status.over ? 'pill pill-over' : 'pill pill-ok';
}
