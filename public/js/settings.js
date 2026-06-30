import { api, showError } from './api.js';
import {
  allocationPillClass,
  allocationStatus,
  allocationText,
  ceilingText,
  nameEditor,
  renderGroupedLimitRows,
  renderLimitRows,
} from './budget.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, reaisToCents } from './format.js';

// Re-exported so existing importers (and tests) can keep reaching them here.
export { ceilingText, renderGroupedLimitRows, renderLimitRows };

const $ = (id) => document.getElementById(id);
const state = { groups: [], cats: [] };

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
    updateAllocation();
  } catch (e) {
    showError(e.message);
  }
}

function readLimitCents() {
  return [...document.querySelectorAll('#limits input[data-cat]')].map((inp) =>
    reaisToCents(inp.value || 0),
  );
}

function updateAllocation() {
  const status = allocationStatus(
    readLimitCents(),
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0),
  );
  const el = $('ceiling');
  el.textContent = allocationText(status);
  el.className = allocationPillClass(status);
}

function wireLimitInputs() {
  $('limits')
    .querySelectorAll('input[data-cat]')
    .forEach((inp) => {
      inp.addEventListener('input', updateAllocation);
      inp.addEventListener('change', async () => {
        try {
          await api.put('/api/limits', {
            category_id: Number(inp.dataset.cat),
            month: $('month').value,
            limit_cents: reaisToCents(inp.value),
          });
        } catch (e) {
          showError(e.message);
        }
      });
    });
}

async function loadLimits() {
  try {
    const [groups, cats, limits] = await Promise.all([
      api.get('/api/groups'),
      api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`),
    ]);
    state.groups = groups;
    state.cats = cats;
    const byCat = new Map(limits.map((l) => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderGroupedLimitRows(groups, cats, byCat);
    wireLimitInputs();
    updateAllocation();
  } catch (e) {
    showError(e.message);
  }
}

function beginRename(kind, id) {
  const cell = $('limits').querySelector(`[data-name-cell="${kind}:${id}"]`);
  if (!cell) return;
  const cur = kind === 'cat'
    ? state.cats.find((c) => c.id === id).name
    : state.groups.find((g) => g.id === id).name;
  cell.innerHTML = nameEditor(kind, id, cur);
  cell.querySelector('input').focus();
}

function beginAdd(kind, groupId) {
  // For addcat: replace the "+ Add category" button cell content.
  // For addgroup: replace the "+ Add group" button cell content.
  const attr = kind === 'addcat' ? `data-add-cat="${groupId}"` : 'data-add-group';
  const btn = $('limits').querySelector(`[${attr}]`);
  if (!btn) return;
  const cell = btn.closest('td');
  if (!cell) return;
  cell.innerHTML = nameEditor(kind, groupId, '');
  cell.querySelector('input').focus();
}

async function saveEdit(token) {
  const [kind, rawId] = token.split(':');
  const id = rawId;
  const val = $('limits').querySelector(`[data-edit-input="${token}"]`).value.trim();
  if (!val) { await loadLimits(); return; }
  if (kind === 'cat') {
    const c = state.cats.find((x) => x.id === Number(id));
    await api.put(`/api/categories/${id}`, { ...c, name: val });
  } else if (kind === 'group') {
    const g = state.groups.find((x) => x.id === Number(id));
    await api.put(`/api/groups/${id}`, { ...g, name: val });
  } else if (kind === 'addcat') {
    await api.post('/api/categories', { group_id: Number(id), name: val });
  } else if (kind === 'addgroup') {
    await api.post('/api/groups', { name: val });
  }
  await loadLimits();
}

async function onLimitsClick(e) {
  const d = e.target.dataset;
  try {
    if (d.catDel) {
      await api.del(`/api/categories/${d.catDel}`);
      await loadLimits();
      return;
    }
    if (d.groupDel) {
      await api.del(`/api/groups/${d.groupDel}`);
      await loadLimits();
      return;
    }
    if (d.catRename) {
      beginRename('cat', Number(d.catRename));
      return;
    }
    if (d.groupRename) {
      beginRename('group', Number(d.groupRename));
      return;
    }
    if (d.groupColor) {
      const g = state.groups.find(x => x.id === Number(d.groupColor));
      await api.put(`/api/groups/${d.groupColor}`, { ...g, color: d.color });
      await loadLimits();
      return;
    }
    if (d.addCat) {
      beginAdd('addcat', d.addCat);
      return;
    }
    if (e.target.hasAttribute('data-add-group')) {
      beginAdd('addgroup', 'new');
      return;
    }
    if (d.save) {
      await saveEdit(d.save);
      return;
    }
    if (d.cancel) {
      await loadLimits();
      return;
    }
  } catch (err) {
    showError(err.message);
  }
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    $('cards').innerHTML = cards
      .filter((c) => c.active)
      .map(
        (c) => `
      <div class="flex items-center justify-between border-b border-line py-2">
        <span>${esc(c.name)}</span>
        <button data-del="${c.id}" class="text-clay text-sm">Remove</button>
      </div>`,
      )
      .join('');
    $('cards')
      .querySelectorAll('button[data-del]')
      .forEach((b) => {
        b.addEventListener('click', async () => {
          try {
            await api.del(`/api/cards/${b.dataset.del}`);
            loadCards();
          } catch (e) {
            showError(e.message);
          }
        });
      });
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('limits')) {
  mountChrome('/settings.html');
  $('month').value = currentMonth();
  $('monthLabel').textContent = $('month').value;
  $('month').addEventListener('change', () => {
    $('monthLabel').textContent = $('month').value;
    loadLimits();
  });
  $('limits').addEventListener('click', onLimitsClick);
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach((id) => {
    $(id).addEventListener('input', updateAllocation);
  });
  $('saveSettings').addEventListener('click', async () => {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      showError('Saved');
    } catch (e) {
      showError(e.message);
    }
  });
  $('addCard').addEventListener('click', async () => {
    try {
      await api.post('/api/cards', { name: $('newCard').value });
      $('newCard').value = '';
      loadCards();
    } catch (e) {
      showError(e.message);
    }
  });
  async function applySuggestions(field) {
    try {
      const sugg = await api.get(`/api/limits/suggestions?month=${$('month').value}`);
      const byCat = new Map(sugg.map((s) => [s.category_id, s[field]]));
      $('limits')
        .querySelectorAll('input[data-cat]')
        .forEach((inp) => {
          const v = byCat.get(Number(inp.dataset.cat));
          if (v !== undefined) {
            inp.value = (v / 100).toFixed(2);
            inp.dispatchEvent(new Event('change'));
          }
        });
      updateAllocation();
    } catch (e) {
      showError(e.message);
    }
  }
  $('useLastMonth').addEventListener('click', () => applySuggestions('last_month_cents'));
  $('useAvg3').addEventListener('click', () => applySuggestions('avg3_cents'));

  loadSettings();
  loadLimits();
  loadCards();
}
