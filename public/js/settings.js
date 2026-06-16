import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('month').value = currentMonth();
$('monthLabel').textContent = $('month').value;
$('month').addEventListener('change', () => { $('monthLabel').textContent = $('month').value; loadLimits(); });

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
  } catch (e) { showError(e.message); }
}
$('saveSettings').addEventListener('click', async () => {
  try {
    await api.put('/api/settings', {
      monthly_income: reaisToCents($('monthly_income').value),
      fixed_costs: reaisToCents($('fixed_costs').value),
      savings_goal: reaisToCents($('savings_goal').value),
    });
    showError('Saved'); // reuse toast for confirmation
  } catch (e) { showError(e.message); }
});

async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`)]);
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = cats.filter(c => c.active).map(c => `
      <tr><td>${c.name}</td>
      <td><input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}" /></td></tr>`).join('');
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
    $('cards').innerHTML = cards.filter(c => c.active)
      .map(c => `<span>${c.name} <button data-del="${c.id}">×</button></span>`).join(' ');
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}
$('addCard').addEventListener('click', async () => {
  try { await api.post('/api/cards', { name: $('newCard').value }); $('newCard').value = ''; loadCards(); }
  catch (e) { showError(e.message); }
});

loadSettings(); loadLimits(); loadCards();
