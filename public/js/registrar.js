import { api, getPage, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL, parseReais, shortDate } from './format.js';
import { entryHint, renderEntryRow, resolveRef } from './quickentry.js';

const $ = (id) => document.getElementById(id);
let editingId = null;
let page = 1;
const lookups = { cats: new Map(), cards: new Map() };
// Data e cartão persistem entre lançamentos: o caso comum é lançar vários gastos
// do mesmo cartão, no mesmo dia (spec §7).
const sticky = { date: new Date().toISOString().slice(0, 10), card: '' };
const state = { cats: [], cards: [] };

export function renderRows(rows, refs = { cats: new Map(), cards: new Map() }) {
  return rows
    .map((r) => {
      const cardName = refs.cards.get(r.card_id) ?? '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${shortDate(r.date)}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-sm">${esc(refs.cats.get(r.category_id)?.name ?? '')}</td>
      <td class="py-3 text-sm text-ink-mut">${esc(cardName)}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Editar</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Excluir</button>
      </td>
    </tr>`;
    })
    .join('');
}

function mountEntryRow() {
  $('entryRow').innerHTML = renderEntryRow(state.cats, state.cards, sticky);
  $('q-cat').addEventListener('input', () => {
    $('q-cat-hint').textContent = entryHint($('q-cat').value, state.cats, 'category');
  });
  $('q-card').addEventListener('input', () => {
    $('q-card-hint').textContent = entryHint($('q-card').value, state.cards, 'card');
  });
}

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  state.cats = cats;
  state.cards = cards;
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
  mountEntryRow();
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  const active = (list) =>
    list
      .filter((c) => c.active)
      .map(opt)
      .join('');
  $('filterCategory').innerHTML = `<option value="">Todas as categorias</option>${active(cats)}`;
  $('filterCard').innerHTML = `<option value="">Todos os cartões</option>${active(cards)}`;
}

async function loadList() {
  try {
    const perPage = Number($('perPage').value);
    const offset = (page - 1) * perPage;
    const qs = new URLSearchParams({
      month: $('month').value,
      limit: String(perPage),
      offset: String(offset),
    });
    if ($('filterCategory').value) qs.set('category_id', $('filterCategory').value);
    if ($('filterCard').value) qs.set('card_id', $('filterCard').value);
    if ($('search').value.trim()) qs.set('q', $('search').value.trim());
    const csvQs = new URLSearchParams({ month: $('month').value });
    if ($('filterCategory').value) csvQs.set('category_id', $('filterCategory').value);
    if ($('filterCard').value) csvQs.set('card_id', $('filterCard').value);
    if ($('search').value.trim()) csvQs.set('q', $('search').value.trim());
    const exportLink = $('exportCsv');
    if (exportLink) exportLink.href = `/api/transactions/export.csv?${csvQs}`;
    const { items: rows, total } = await getPage(`/api/transactions?${qs}`);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page > totalPages) {
      page = totalPages;
      return loadList();
    }
    updatePager(total, perPage, totalPages);
    $('list').innerHTML = renderRows(rows, lookups);
    $('list')
      .querySelectorAll('button[data-edit]')
      .forEach((b) => {
        b.addEventListener('click', () =>
          startEdit(rows.find((r) => r.id === Number(b.dataset.edit))),
        );
      });
    $('list')
      .querySelectorAll('button[data-del]')
      .forEach((b) => {
        b.addEventListener('click', () =>
          onDelete(Number(b.dataset.del), Number(b.dataset.group) || null),
        );
      });
  } catch (e) {
    showError(e.message);
  }
}

function updatePager(total, perPage, totalPages) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  $('pageInfo').textContent = `${from}–${to} de ${total} · página ${page}/${totalPages}`;
  $('prevPage').disabled = page <= 1;
  $('nextPage').disabled = page >= totalPages;
}

function setAdvanced(which) {
  $('installmentFields').style.display = which === 'installment' ? 'flex' : 'none';
  $('recurringFields').style.display = which === 'recurring' ? 'flex' : 'none';
}

function advancedMode() {
  if ($('installmentFields').style.display === 'flex') return 'installment';
  if ($('recurringFields').style.display === 'flex') return 'recurring';
  return null;
}

function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  setAdvanced(null);
  $('q-date').value = r.date;
  $('q-desc').value = r.description;
  $('q-cat').value = lookups.cats.get(r.category_id)?.name ?? '';
  $('q-card').value = lookups.cards.get(r.card_id) ?? '';
  $('q-amount').value = (r.amount_cents / 100).toFixed(2).replace('.', ',');
  $('q-submit').textContent = 'Salvar';
  $('cancelEdit').style.display = 'inline';
  $('q-desc').focus();
}

function resetForm() {
  editingId = null;
  setAdvanced(null);
  $('q-desc').value = '';
  $('q-cat').value = '';
  $('q-amount').value = '';
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  $('q-submit').textContent = 'Adicionar';
  $('cancelEdit').style.display = 'none';
}

async function onDelete(id, groupId) {
  try {
    if (groupId) {
      if (!confirm('Excluir todo o parcelamento (todas as parcelas)?')) return;
      await api.del(`/api/installment-groups/${groupId}`);
    } else {
      await api.del(`/api/transactions/${id}`);
    }
    if (editingId === id) resetForm();
    loadList();
  } catch (e) {
    showError(e.message);
  }
}

// Erro inline, sem modal (spec §7): a dica sob o campo vira a mensagem e o foco
// vai para lá.
function fieldError(hintId, inputId, msg) {
  $(hintId).textContent = msg;
  $(inputId).focus();
}

// Categoria e cartão que não existem são criados aqui, antes da transação — é o
// que torna o primeiro lançamento possível num banco sem nenhum cartão (§B.3).
async function ensureId(ref, endpoint) {
  if (ref.id !== undefined) return ref.id;
  const created = await api.post(endpoint, { name: ref.create });
  return created.id;
}

async function onSubmit(e) {
  e.preventDefault();
  $('q-cat-hint').textContent = '';
  $('q-card-hint').textContent = '';
  try {
    const catRef = resolveRef($('q-cat').value, state.cats);
    if (!catRef) return fieldError('q-cat-hint', 'q-cat', 'Informe uma categoria');
    const cardRef = resolveRef($('q-card').value, state.cards);
    if (!cardRef) return fieldError('q-card-hint', 'q-card', 'Informe um cartão');
    const amount = parseReais($('q-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fieldError('q-cat-hint', 'q-amount', 'Valor inválido');
    }

    const category_id = await ensureId(catRef, '/api/categories');
    const card_id = await ensureId(cardRef, '/api/cards');
    const base = { category_id, card_id, description: $('q-desc').value };
    const mode = advancedMode();

    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
      });
    } else if (mode === 'installment') {
      await api.post('/api/transactions', {
        ...base,
        installment_total_cents: amount,
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value || $('q-date').value.slice(0, 7),
      });
    } else if (mode === 'recurring') {
      await api.post('/api/recurring', {
        ...base,
        amount_cents: amount,
        day_of_month: Number($('dayOfMonth').value) || Number($('q-date').value.slice(8, 10)),
      });
    } else {
      await api.post('/api/transactions', {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
      });
    }

    // Data e cartão ficam; o resto limpa. O formulário não fecha e o foco volta
    // para a descrição — o primeiro campo que de fato se digita de novo (§B.3).
    sticky.date = $('q-date').value;
    sticky.card = $('q-card').value;
    const catCreated = catRef.create !== undefined;
    const cardCreated = cardRef.create !== undefined;
    resetForm();
    if (catCreated || cardCreated) await loadSelectors();
    $('q-desc').focus();
    await loadList();
  } catch (err) {
    showError(err.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/registrar.html');
  $('month').value = currentMonth();
  $('toggleInstallment').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'installment' ? null : 'installment'),
  );
  $('toggleRecurring').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'recurring' ? null : 'recurring'),
  );
  $('month').addEventListener('change', () => {
    page = 1;
    loadList();
  });
  $('perPage').addEventListener('change', () => {
    page = 1;
    loadList();
  });
  ['filterCategory', 'filterCard'].forEach((id) => {
    $(id).addEventListener('change', () => {
      page = 1;
      loadList();
    });
  });
  $('search').addEventListener('input', () => {
    page = 1;
    loadList();
  });
  $('prevPage').addEventListener('click', () => {
    if (page > 1) {
      page--;
      loadList();
    }
  });
  $('nextPage').addEventListener('click', () => {
    page++;
    loadList();
  });
  $('form').addEventListener('submit', onSubmit);
  $('cancelEdit').addEventListener('click', resetForm);
  loadSelectors().then(loadList);
}
