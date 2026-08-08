import { api, showError } from './api.js';
import {
  allocationPillClass,
  allocationStatus,
  allocationText,
  canSpendText,
  nameEditor,
  renderCategoryRows,
} from './budget.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL, reaisToCents } from './format.js';

// Re-exported so existing importers (and tests) can keep reaching them here.
export { canSpendText, renderCategoryRows };

// Documento e storage entram por parâmetro: uma função que alcança `document`
// por dentro não teria como ser testada sem DOM.
export function applyTheme(next, doc, storage) {
  doc.documentElement.setAttribute('data-theme', next);
  try {
    storage.setItem('theme', next);
  } catch {
    /* modo privado — ignorar */
  }
  return next;
}

const $ = (id) => document.getElementById(id);
const state = { cats: [] };

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

function wireEssentialToggles() {
  $('limits')
    .querySelectorAll('input[data-essential]')
    .forEach((box) => {
      box.addEventListener('change', async () => {
        const id = Number(box.dataset.essential);
        const c = state.cats.find((x) => x.id === id);
        try {
          await api.put(`/api/categories/${id}`, { ...c, essential: box.checked ? 1 : 0 });
          c.essential = box.checked ? 1 : 0;
        } catch (e) {
          box.checked = !box.checked;
          showError(e.message);
        }
      });
    });
}

async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`),
    ]);
    state.cats = cats;
    const byCat = new Map(limits.map((l) => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderCategoryRows(cats, byCat);
    wireLimitInputs();
    wireEssentialToggles();
    updateAllocation();
  } catch (e) {
    showError(e.message);
  }
}

function beginRename(kind, id) {
  const cell = $('limits').querySelector(`[data-name-cell="${kind}:${id}"]`);
  if (!cell) return;
  const cur = state.cats.find((c) => c.id === id).name;
  cell.innerHTML = nameEditor(kind, id, cur);
  cell.querySelector('input').focus();
}

function beginAdd() {
  const btn = $('limits').querySelector('[data-add-cat]');
  if (!btn) return;
  const cell = btn.closest('td');
  if (!cell) return;
  cell.innerHTML = nameEditor('addcat', 'new', '');
  cell.querySelector('input').focus();
}

async function saveEdit(token) {
  const [kind, rawId] = token.split(':');
  const id = rawId;
  const val = $('limits').querySelector(`[data-edit-input="${token}"]`).value.trim();
  if (!val) {
    await loadLimits();
    return;
  }
  if (kind === 'cat') {
    const c = state.cats.find((x) => x.id === Number(id));
    await api.put(`/api/categories/${id}`, { ...c, name: val });
  } else if (kind === 'addcat') {
    await api.post('/api/categories', { name: val });
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
    if (d.catRename) {
      beginRename('cat', Number(d.catRename));
      return;
    }
    if (e.target.hasAttribute('data-add-cat')) {
      beginAdd();
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

export function renderCards(cards, stmtByCard, _month) {
  return cards
    .filter((c) => c.active)
    .map((c) => {
      const s = stmtByCard.get(c.id);
      return `
      <div class="paper-card" data-card="${c.id}">
        <div class="flex items-center justify-between">
          <span class="font-semibold">${esc(c.name)}</span>
          <button data-del="${c.id}" class="text-clay text-sm">Remover</button>
        </div>
        <div class="mt-2 flex items-center gap-3 text-sm">
          <label>Fechamento <input type="number" min="1" max="31" data-closing="${c.id}"
            value="${c.closing_day ?? ''}" class="w-16 rounded border border-line px-1" /></label>
          <label>Vencimento <input type="number" min="1" max="31" data-due="${c.id}"
            value="${c.due_day ?? ''}" class="w-16 rounded border border-line px-1" /></label>
          <span class="ml-auto font-mono">${s ? `Fatura ${formatBRL(s.amount_cents)}` : ''}</span>
        </div>
      </div>`;
    })
    .join('');
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    const active = cards.filter((c) => c.active);
    const stmts = await Promise.all(
      active.map((c) =>
        api.get(`/api/cards/${c.id}/statement?month=${$('month').value}`).then((s) => [c.id, s]),
      ),
    );
    $('cards').innerHTML = renderCards(cards, new Map(stmts), $('month').value);
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
    const saveCfg = async (id) => {
      const closing = $('cards').querySelector(`input[data-closing="${id}"]`).value;
      const due = $('cards').querySelector(`input[data-due="${id}"]`).value;
      try {
        await api.put(`/api/cards/${id}/statement-config`, {
          closing_day: closing ? Number(closing) : null,
          due_day: due ? Number(due) : null,
        });
        loadCards();
      } catch (e) {
        showError(e.message);
      }
    };
    $('cards')
      .querySelectorAll('input[data-closing],input[data-due]')
      .forEach((inp) => {
        inp.addEventListener('change', () =>
          saveCfg(Number(inp.dataset.closing ?? inp.dataset.due)),
        );
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
      showError('Salvo');
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

  // O tema saiu do cabeçalho (design §A.3) e vira manutenção, junto de cartões,
  // categorias e backup.
  const themeSel = $('theme');
  if (themeSel) {
    themeSel.value =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    themeSel.addEventListener('change', () => {
      const next = applyTheme(themeSel.value, document, localStorage);
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
    });
  }

  loadSettings();
  loadLimits();
  loadCards();
}
