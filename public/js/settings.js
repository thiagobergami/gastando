import { api, showError } from './api.js';
import { reaisToCents, currentMonth, esc } from './format.js';
import { mountChrome } from './chrome.js';
import { ceilingText, renderLimitRows, renderGroupedLimitRows,
  allocationStatus, allocationText, allocationPillClass } from './budget.js';

// Re-exported so existing importers (and tests) can keep reaching them here.
export { ceilingText, renderLimitRows, renderGroupedLimitRows };

const COLORS = ['sage', 'gold', 'slate', 'neutral'];
const $ = id => document.getElementById(id);
const state = { groups: [], cats: [] };

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
    updateAllocation();
  } catch (e) { showError(e.message); }
}

function readLimitCents() {
  return [...document.querySelectorAll('#limits input[data-cat]')]
    .map(inp => reaisToCents(inp.value || 0));
}

function updateAllocation() {
  const status = allocationStatus(
    readLimitCents(),
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
  const el = $('ceiling');
  el.textContent = allocationText(status);
  el.className = allocationPillClass(status);
}

function wireLimitInputs() {
  $('limits').querySelectorAll('input[data-cat]').forEach(inp => {
    inp.addEventListener('input', updateAllocation);
    inp.addEventListener('change', async () => {
      try {
        await api.put('/api/limits', { category_id: Number(inp.dataset.cat),
          month: $('month').value, limit_cents: reaisToCents(inp.value) });
      } catch (e) { showError(e.message); }
    });
  });
}

async function loadLimits() {
  try {
    const [groups, cats, limits] = await Promise.all([
      api.get('/api/groups'), api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`)]);
    state.groups = groups; state.cats = cats;
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderGroupedLimitRows(groups, cats, byCat);
    wireLimitInputs();
    updateAllocation();
  } catch (e) { showError(e.message); }
}

async function renameCategory(id) {
  const cat = state.cats.find(c => c.id === id);
  const name = prompt('Rename category', cat.name);
  if (!name || name === cat.name) return;
  await api.put(`/api/categories/${id}`, { ...cat, name });
  await loadLimits();
}

async function renameGroup(id) {
  const g = state.groups.find(x => x.id === id);
  const name = prompt('Rename group', g.name);
  if (!name || name === g.name) return;
  await api.put(`/api/groups/${id}`, { ...g, name });
  await loadLimits();
}

async function recolorGroup(id) {
  const g = state.groups.find(x => x.id === id);
  const color = prompt(`Color (${COLORS.join(', ')})`, g.color);
  if (!color || color === g.color) return;
  if (!COLORS.includes(color)) { showError(`Color must be one of: ${COLORS.join(', ')}`); return; }
  await api.put(`/api/groups/${id}`, { ...g, color });
  await loadLimits();
}

async function addCategory(groupId) {
  const name = prompt('New category name');
  if (!name) return;
  await api.post('/api/categories', { group_id: groupId, name });
  await loadLimits();
}

async function addGroup() {
  const name = prompt('New group name');
  if (!name) return;
  await api.post('/api/groups', { name });
  await loadLimits();
}

async function onLimitsClick(e) {
  const d = e.target.dataset;
  try {
    if (d.catDel) { await api.del(`/api/categories/${d.catDel}`); await loadLimits(); return; }
    if (d.groupDel) { await api.del(`/api/groups/${d.groupDel}`); await loadLimits(); return; }
    if (d.catRename) { await renameCategory(Number(d.catRename)); return; }
    if (d.groupRename) { await renameGroup(Number(d.groupRename)); return; }
    if (d.groupRecolor) { await recolorGroup(Number(d.groupRecolor)); return; }
    if (d.addCat) { await addCategory(Number(d.addCat)); return; }
    if (e.target.hasAttribute('data-add-group')) { await addGroup(); return; }
  } catch (err) { showError(err.message); }
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    $('cards').innerHTML = cards.filter(c => c.active).map(c => `
      <div class="flex items-center justify-between border-b border-line py-2">
        <span>${esc(c.name)}</span>
        <button data-del="${c.id}" class="text-clay text-sm">Remove</button>
      </div>`).join('');
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('limits')) {
  mountChrome('/settings.html');
  $('month').value = currentMonth();
  $('monthLabel').textContent = $('month').value;
  $('month').addEventListener('change', () => { $('monthLabel').textContent = $('month').value; loadLimits(); });
  $('limits').addEventListener('click', onLimitsClick);
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateAllocation));
  $('saveSettings').addEventListener('click', async () => {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      showError('Saved');
    } catch (e) { showError(e.message); }
  });
  $('addCard').addEventListener('click', async () => {
    try { await api.post('/api/cards', { name: $('newCard').value }); $('newCard').value = ''; loadCards(); }
    catch (e) { showError(e.message); }
  });
  loadSettings(); loadLimits(); loadCards();
}
