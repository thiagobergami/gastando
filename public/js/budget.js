import { esc, formatBRL } from './format.js';

// Pure budget-model helpers shared by the Settings page and the setup wizard.
// Kept free of DOM side-effects so either page can import them safely.

export const GROUP_COLORS = ['sage', 'gold', 'slate', 'neutral'];

export function nameEditor(kind, id, value) {
  return `<span class="inline-flex items-center gap-1">
    <input data-edit-input="${kind}:${id}" value="${esc(value)}"
      class="rounded border border-line px-2 py-0.5 text-sm" />
    <button data-save="${kind}:${id}" class="text-sage text-sm">Save</button>
    <button data-cancel="${kind}:${id}" class="text-ink-mut text-sm">Cancel</button>
  </span>`;
}

export function colorSwatches(groupId, current) {
  return GROUP_COLORS.map(
    (c) =>
      `<button data-group-color="${groupId}" data-color="${c}" title="${c}"
       class="tag tag-${c} mr-1 ${c === current ? 'ring-2 ring-ink' : ''}">${c}</button>`,
  ).join('');
}

export function ceilingText(income, fixed, goal) {
  return `Healthy ceiling ${formatBRL(income - fixed - goal)}`;
}

export function renderLimitRows(cats, byCat) {
  return cats
    .filter((c) => c.active)
    .map(
      (c) => `
    <tr class="border-b border-line">
      <td class="py-2">${esc(c.name)}</td>
      <td class="py-2 text-right">
        <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
          class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
      </td>
    </tr>`,
    )
    .join('');
}

export function renderGroupedLimitRows(groups, cats, byCat) {
  const groupBlock = (g) => {
    const rows = cats
      .filter((c) => c.active && c.group_id === g.id)
      .map(
        (c) => `
      <tr class="border-b border-line">
        <td class="py-2" data-name-cell="cat:${c.id}">${esc(c.name)}</td>
        <td class="py-2 text-right">
          <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
            class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
        </td>
        <td class="py-2 text-right">
          <button data-cat-rename="${c.id}" class="text-sage text-sm mr-2">Rename</button>
          <button data-cat-del="${c.id}" class="text-clay text-sm">Remove</button>
        </td>
      </tr>`,
      )
      .join('');
    return `
      <tr class="bg-paper">
        <td class="py-2" colspan="2" data-name-cell="group:${g.id}"><span class="tag tag-${esc(g.color)}">${esc(g.name)}</span></td>
        <td class="py-2 text-right">
          <button data-group-rename="${g.id}" class="text-sage text-sm mr-2">Rename</button>
          ${colorSwatches(g.id, g.color)}
          <button data-group-del="${g.id}" class="text-clay text-sm">Remove</button>
        </td>
      </tr>
      ${rows}
      <tr>
        <td class="py-2" colspan="3">
          <button data-add-cat="${g.id}" class="text-sage text-sm">+ Add category</button>
        </td>
      </tr>`;
  };
  return (
    groups
      .filter((g) => g.active)
      .map(groupBlock)
      .join('') +
    `
    <tr>
      <td class="py-2" colspan="3"><button data-add-group class="text-sage text-sm">+ Add group</button></td>
    </tr>`
  );
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
