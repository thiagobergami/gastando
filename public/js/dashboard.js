import { api, showError } from './api.js';
import { formatBRL, currentMonth } from './format.js';

const monthEl = document.getElementById('month');
monthEl.value = currentMonth();
monthEl.addEventListener('change', load);

async function load() {
  try {
    const d = await api.get(`/api/dashboard?month=${monthEl.value}`);
    renderHero(d.totals);
    renderGroups(d);
  } catch (e) { showError(e.message); }
}

function renderHero(t) {
  const ok = t.projected_savings_cents >= t.savings_goal_cents;
  document.getElementById('hero').innerHTML = `
    <div class="hero">
      <div>
        <div class="big-label">Projected savings</div>
        <div class="savings ${ok ? 'ok' : 'under'}">${formatBRL(t.projected_savings_cents)}</div>
        <div class="vs-goal">Goal ${formatBRL(t.savings_goal_cents)} · Teto ${formatBRL(t.teto_cents)}</div>
      </div>
      <div class="hero-right">
        <div class="meter-row"><span>Spent</span><b>${formatBRL(t.spent_cents)}</b></div>
        <div class="meter ${t.spent_cents > t.teto_cents ? 'over' : ''}">
          <i style="width:${Math.min(100, t.teto_cents ? t.spent_cents / t.teto_cents * 100 : 0)}%"></i>
        </div>
        <div class="meter-foot">of teto ${formatBRL(t.teto_cents)}</div>
      </div>
    </div>`;
}

function renderGroups(d) {
  const byGroup = new Map(d.groups.map(g => [g.group_id, { ...g, cats: [] }]));
  for (const c of d.categories) byGroup.get(c.group_id).cats.push(c);
  document.getElementById('groups').innerHTML = [...byGroup.values()].map(g => `
    <section>
      <h2 class="serif">${g.name} — ${formatBRL(g.spent_cents)} / ${formatBRL(g.limit_cents)}</h2>
      ${g.cats.map(c => {
        const pct = c.limit_cents ? Math.min(100, c.spent_cents / c.limit_cents * 100) : 0;
        return `<div class="cat">
          <div class="meter-row"><span>${c.name}</span>
            <b>${formatBRL(c.spent_cents)} / ${formatBRL(c.limit_cents)}</b></div>
          <div class="meter ${c.status === 'over' ? 'over' : ''}"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('')}
    </section>`).join('');
}

load();
