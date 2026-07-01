import { esc, formatBRL } from './format.js';

export function currency(cents) {
  return `<span class="font-mono">${formatBRL(cents)}</span>`;
}

export function meterBar(spentCents, limitCents, status) {
  const pct = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0;
  const over = status === 'over' || (limitCents > 0 && spentCents > limitCents);
  const cls = over ? ' over' : status === 'approaching' ? ' approaching' : '';
  return `<div class="meter"><div class="meter-fill${cls}" style="width:${pct}%"></div></div>`;
}

export function statusPill(status) {
  if (status === 'over') return `<span class="pill pill-over">Acima</span>`;
  if (status === 'approaching') return `<span class="pill pill-warn">Perto</span>`;
  return `<span class="pill pill-ok">OK</span>`;
}

export function pageHeader(title, subtitle) {
  return `<div class="mb-6">
    <h1 class="font-display text-3xl text-ink">${esc(title)}</h1>
    ${subtitle ? `<p class="text-ink-mut mt-1">${esc(subtitle)}</p>` : ''}
  </div>`;
}

export function groupTag(groupName) {
  const n = (groupName || '').toLowerCase();
  let cls = 'tag-neutral';
  if (n.includes('essenc')) cls = 'tag-sage';
  else if (n.includes('estilo')) cls = 'tag-gold';
  else if (n.includes('fundo')) cls = 'tag-slate';
  return `<span class="tag ${cls}">${esc(groupName)}</span>`;
}
