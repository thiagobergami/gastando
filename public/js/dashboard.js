import { api, showError } from './api.js';
import { formatBRL, currentMonth, esc } from './format.js';
import { mountChrome } from './chrome.js';
import { meterBar, groupTag, statusPill } from './ui.js';

export function renderHero(t) {
  const ok = t.projected_savings_cents >= t.savings_goal_cents;
  const vs =
    t.vs_goal_cents >= 0
      ? `+${formatBRL(t.vs_goal_cents)} above goal`
      : `${formatBRL(t.vs_goal_cents)} vs goal`;
  return `
    <section class="paper-card grid md:grid-cols-2 gap-6 items-center">
      <div>
        <div class="text-xs font-semibold uppercase tracking-wide text-ink-mut">Projected savings</div>
        <div class="font-display text-5xl ${ok ? 'text-sage' : 'text-clay'} leading-none mt-1">${formatBRL(t.projected_savings_cents)}</div>
        <div class="mt-3 flex items-center gap-3 text-sm text-ink-mut">
          <span>Ceiling ${formatBRL(t.teto_cents)}</span>
          <span class="pill ${ok ? 'pill-ok' : 'pill-over'}">${vs}</span>
        </div>
      </div>
      <div class="md:border-l md:border-line md:pl-6">
        <div class="flex justify-between text-sm text-ink-mut mb-2"><span>Spent</span><b class="text-ink">${formatBRL(t.spent_cents)}</b></div>
        ${meterBar(t.spent_cents, t.teto_cents, t.spent_cents > t.teto_cents ? 'over' : 'ok')}
        <div class="mt-2 text-xs text-ink-mut">of ceiling ${formatBRL(t.teto_cents)}</div>
      </div>
    </section>`;
}

export function renderGroups(d) {
  const month = d.month || '';
  const byGroup = new Map(d.groups.map((g) => [g.group_id, { ...g, cats: [] }]));
  for (const c of d.categories) byGroup.get(c.group_id).cats.push(c);
  return [...byGroup.values()]
    .map(
      (g) => `
    <section class="mt-8">
      <div class="flex items-center gap-3 mb-3">
        <h2 class="text-xs font-bold uppercase tracking-wider text-ink-mut">${esc(g.name)}</h2>
        <span class="flex-1 h-px bg-line"></span>
        <span class="font-mono text-sm text-ink-mut">${formatBRL(g.effective_spent_cents ?? g.spent_cents)} / ${formatBRL(g.limit_cents)}</span>
      </div>
      <div class="space-y-3">
        ${g.cats
          .map((c) => {
            const carry = c.carry_in_cents || 0;
            const eff = c.effective_spent_cents ?? c.spent_cents;
            return `
          <a href="category.html?id=${c.category_id}&month=${month}" class="paper-card block hover:border-sage transition-colors">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-semibold flex items-center gap-2">${esc(c.name)} ${groupTag(g.name)}</div>
                ${c.examples ? `<div class="text-xs text-ink-mut mt-0.5">${esc(c.examples)}</div>` : ''}
              </div>
              <div class="text-right">
                <div class="font-display text-xl">${formatBRL(c.limit_cents)}</div>
                <div class="font-mono text-xs text-ink-mut mt-0.5">spent ${formatBRL(c.spent_cents)}</div>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <div class="flex-1">${meterBar(eff, c.limit_cents, c.status)}</div>
              ${carry > 0 ? `<span class="pill pill-over">+${formatBRL(carry)} carryover</span>` : ''}
              ${statusPill(c.status)}
            </div>
          </a>`;
          })
          .join('')}
      </div>
    </section>`,
    )
    .join('');
}

async function load(month) {
  try {
    const d = await api.get(`/api/dashboard?month=${month}`);
    document.getElementById('hero').innerHTML = renderHero(d.totals);
    document.getElementById('groups').innerHTML = renderGroups(d);
  } catch (e) {
    showError(e.message);
  }
}

// Bootstrap (browser only)
if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => load(monthEl.value));
  load(monthEl.value);
}
