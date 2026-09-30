import { formatBRL } from './format.js';
import { resolveRef } from './quickentry.js';

export function toggleEntryOption(state, option) {
  const next = { ...state, [option]: !state[option] };
  if (option === 'recurring' && next.recurring) {
    next.installment = false;
    next.split = false;
  } else if (option !== 'recurring' && next[option]) {
    next.recurring = false;
  }
  return next;
}

export function createSplitPreviewLoader(request, publish) {
  let version = 0;
  return {
    async load(input) {
      const current = ++version;
      publish(null);
      try {
        const result = await request(input);
        if (current === version) publish(result);
      } catch {
        if (current === version) publish(null);
      }
    },
    clear() {
      version++;
      publish(null);
    },
  };
}

export function formatSplitPreview(preview, person) {
  if (!preview) return '';
  const range = (amounts) => {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return min === max ? formatBRL(min) : `${formatBRL(min)} a ${formatBRL(max)}`;
  };
  return `${preview.installment_amounts_cents.length} parcelas de ${range(preview.installment_amounts_cents)} · ${person || 'A outra pessoa'} deve ${range(preview.receivable_amounts_cents)} por parcela · Total a receber: ${formatBRL(preview.total_receivable_cents)}`;
}

export function resolvePurchasePerson(name, people, currentPersonId) {
  const typed = String(name ?? '').trim();
  const current = people.find((person) => person.id === currentPersonId);
  if (current && current.name.toLowerCase() === typed.toLowerCase()) return { id: current.id };
  return resolveRef(typed, people);
}
