import { esc, formatBRL } from './format.js';

// Helpers puros do modelo de orçamento, sem efeito no DOM.

export function nameEditor(kind, id, value) {
  return `<span class="inline-flex items-center gap-1">
    <input data-edit-input="${kind}:${id}" value="${esc(value)}"
      class="rounded border border-line px-2 py-0.5 text-sm" />
    <button data-save="${kind}:${id}" class="text-sage text-sm">Salvar</button>
    <button data-cancel="${kind}:${id}" class="text-ink-mut text-sm">Cancelar</button>
  </span>`;
}

export function canSpendText(income, fixed, goal) {
  return `Posso gastar este mês ${formatBRL(income - fixed - goal)}`;
}

// Lista plana de categorias: limite, marcação de essencial e ações.
// `essential` é o que sobrou dos grupos — quem renomeou grupos antes da
// migração 006 corrige aqui (spec §10).
export function renderCategoryRows(cats, byCat, carryByCat = new Map()) {
  const rows = cats
    .filter((c) => c.active)
    .map((c) => {
      const carry = carryByCat.get(c.id) || {};
      const overage = carry.overage_cents || 0;
      const carryIn = carry.carry_in_cents || 0;
      return `
    <tr class="border-b border-line">
      <td class="py-2" data-name-cell="cat:${c.id}">${esc(c.name)}</td>
      <td class="py-2 text-center">
        <label class="inline-flex items-center gap-1 text-xs text-ink-mut">
          <input type="checkbox" data-essential="${c.id}" ${c.essential ? 'checked' : ''} /> essencial
        </label>
      </td>
      <td class="py-2 text-right">
        <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
          class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
      </td>
      <td class="py-2 pl-4 text-sm">
        ${overage > 0 ? `<span class="pill pill-over">${formatBRL(overage)} excedidos</span>` : '<span class="text-ink-mut">Sem excedente</span>'}
        ${carryIn > 0 ? `<span class="block text-xs text-ink-mut mt-1">Inclui ${formatBRL(carryIn)} do mês anterior</span>` : ''}
        <label class="flex items-center gap-1 mt-1 text-xs text-ink-mut">
          <input type="checkbox" data-carry="${c.id}" ${carry.carry_forward ? 'checked' : ''} ${overage === 0 && !carry.carry_forward ? 'disabled' : ''} /> Levar excedente para o mês seguinte
        </label>
      </td>
      <td class="py-2 text-right">
        <button data-cat-rename="${c.id}" class="text-sage text-sm mr-2">Renomear</button>
        <button data-cat-del="${c.id}" class="text-clay text-sm">Remover</button>
      </td>
    </tr>`;
    })
    .join('');
  return `${rows}
    <tr>
      <td class="py-2" colspan="5"><button data-add-cat class="text-sage text-sm">+ Adicionar categoria</button></td>
    </tr>`;
}

// --- Reconciliação de alocação: os limites cabem no "posso gastar"? ---

export function allocationStatus(limitCentsList, income, fixed, goal) {
  const ceiling = income - fixed - goal;
  const allocated = limitCentsList.reduce((sum, n) => sum + (n || 0), 0);
  const remaining = ceiling - allocated;
  return { ceiling, allocated, remaining, over: remaining < 0 };
}

export function allocationText(status) {
  const head = `Alocado ${formatBRL(status.allocated)} de ${formatBRL(status.ceiling)}`;
  return status.over
    ? `${head} · ${formatBRL(-status.remaining)} acima do que posso gastar`
    : `${head} · ${formatBRL(status.remaining)} disponível`;
}

export function allocationPillClass(status) {
  return status.over ? 'pill pill-over' : 'pill pill-ok';
}
