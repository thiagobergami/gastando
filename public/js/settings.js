import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';

const $ = id => document.getElementById(id);

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

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
    updateCeiling();
  } catch (e) { showError(e.message); }
}

function updateCeiling() {
  $('ceiling').textContent = ceilingText(
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
}

async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'), api.get(`/api/limits?month=${$('month').value}`)]);
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderLimitRows(cats, byCat);
    $('limits').querySelectorAll('input[data-cat]').forEach(inp =>
      inp.addEventListener('change', async () => {
        try {
          await api.put('/api/limits', { category_id: Number(inp.dataset.cat),
            month: $('month').value, limit_cents: reaisToCents(inp.value) });
        } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    $('cards').innerHTML = cards.filter(c => c.active).map(c => `
      <div class="flex items-center justify-between border-b border-line py-2">
        <span>${c.name}</span>
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
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateCeiling));
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
