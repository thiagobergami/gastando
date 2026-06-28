import { formatBRL, esc } from './format.js';

export function currency(cents) {
  return `<span class="font-mono">${formatBRL(cents)}</span>`;
}

export function meterBar(spentCents, limitCents, status) {
  const pct = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  const over = status === 'over' || (limitCents > 0 && spentCents > limitCents);
  return `<div class="meter"><div class="meter-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>`;
}

export function statusPill(status) {
  return status === 'over'
    ? `<span class="pill pill-over">Over</span>`
    : `<span class="pill pill-ok">OK</span>`;
}

export function groupTag(groupName) {
  const n = (groupName || '').toLowerCase();
  let cls = 'tag-neutral';
  if (n.includes('essenc')) cls = 'tag-sage';
  else if (n.includes('estilo')) cls = 'tag-gold';
  else if (n.includes('fundo')) cls = 'tag-slate';
  return `<span class="tag ${cls}">${esc(groupName)}</span>`;
}
