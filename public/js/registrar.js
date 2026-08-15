import { api, getPage, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL, parseReais, shortDate } from './format.js';
import { entryHint, renderEntryRow, resolveRef } from './quickentry.js';

const $ = (id) => document.getElementById(id);
let editingId = null;
let page = 1;
const lookups = { cats: new Map(), cards: new Map(), people: new Map() };
// Data e cartão persistem entre lançamentos: o caso comum é lançar vários gastos
// do mesmo cartão, no mesmo dia (spec §7).
const sticky = { date: new Date().toISOString().slice(0, 10), card: '' };
const state = { cats: [], cards: [], people: [] };

export function renderRows(rows, refs = { cats: new Map(), cards: new Map(), people: new Map() }) {
  return rows
    .map((r) => {
      const cardName = refs.cards.get(r.card_id) ?? '';
      const splitTag = r.split_person_id
        ? `<span class="tag tag-sage ml-2">${r.split_percent}% ${esc(refs.people?.get(r.split_person_id) ?? '')}</span>`
        : '';
      return `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${shortDate(r.date)}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}${splitTag}</td>
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

// Preencher um campo por código não dispara `input`, então a dica precisa ser
// recalculada à mão — sem isso, editar um lançamento cuja categoria foi excluída
// criaria uma categoria nova sem o usuário ver o aviso.
function refreshHints() {
  $('q-cat-hint').textContent = entryHint($('q-cat').value, state.cats, 'category');
  $('q-card-hint').textContent = entryHint($('q-card').value, state.cards, 'card');
}

function mountEntryRow() {
  $('entryRow').innerHTML = renderEntryRow(state.cats, state.cards, sticky);
  $('q-cat').addEventListener('input', refreshHints);
  $('q-card').addEventListener('input', refreshHints);
}

async function loadSelectors() {
  const [cats, cards, people] = await Promise.all([
    api.get('/api/categories'),
    api.get('/api/cards'),
    api.get('/api/people'),
  ]);
  state.cats = cats;
  state.cards = cards;
  state.people = people;
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
  lookups.people = new Map(people.map((p) => [p.id, p.name]));
  mountEntryRow();
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  const active = (list) =>
    list
      .filter((c) => c.active)
      .map(opt)
      .join('');
  $('filterCategory').innerHTML = `<option value="">Todas as categorias</option>${active(cats)}`;
  $('filterCard').innerHTML = `<option value="">Todos os cartões</option>${active(cards)}`;
  $('person-list').innerHTML = people
    .filter((p) => p.active)
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join('');
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
  $('splitFields').style.display = which === 'split' ? 'flex' : 'none';
}

function advancedMode() {
  if ($('installmentFields').style.display === 'flex') return 'installment';
  if ($('recurringFields').style.display === 'flex') return 'recurring';
  if ($('splitFields').style.display === 'flex') return 'split';
  return null;
}

function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  if (r.split_person_id) {
    setAdvanced('split');
    $('q-person').value = lookups.people.get(r.split_person_id) ?? '';
    $('splitPercent').value = r.split_percent;
  } else {
    setAdvanced(null);
    $('q-person').value = '';
    $('splitPercent').value = '';
  }
  $('q-date').value = r.date;
  $('q-desc').value = r.description;
  $('q-cat').value = lookups.cats.get(r.category_id)?.name ?? '';
  $('q-card').value = lookups.cards.get(r.card_id) ?? '';
  $('q-amount').value = (r.amount_cents / 100).toFixed(2).replace('.', ',');
  $('q-submit').textContent = 'Salvar';
  $('cancelEdit').style.display = 'inline';
  refreshHints();
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
  $('q-person').value = '';
  $('splitPercent').value = '';
  $('q-person-hint').textContent = '';
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
  $('q-person-hint').textContent = '';
  try {
    const catRef = resolveRef($('q-cat').value, state.cats);
    if (!catRef) return fieldError('q-cat-hint', 'q-cat', 'Informe uma categoria');
    const cardRef = resolveRef($('q-card').value, state.cards);
    if (!cardRef) return fieldError('q-card-hint', 'q-card', 'Informe um cartão');
    const amount = parseReais($('q-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fieldError('q-cat-hint', 'q-amount', 'Valor inválido');
    }

    const mode = advancedMode();
    let personRef = null;
    let splitPercent = null;
    if (mode === 'split') {
      personRef = resolveRef($('q-person').value, state.people);
      if (!personRef) return fieldError('q-person-hint', 'q-person', 'Informe uma pessoa');
      splitPercent = Number($('splitPercent').value);
      if (!Number.isInteger(splitPercent) || splitPercent < 1 || splitPercent > 99) {
        return fieldError('q-person-hint', 'splitPercent', 'Porcentagem inválida (1 a 99)');
      }
    }

    const category_id = await ensureId(catRef, '/api/categories');
    const card_id = await ensureId(cardRef, '/api/cards');
    const split_person_id = personRef ? await ensureId(personRef, '/api/people') : null;
    const split_percent = mode === 'split' ? splitPercent : null;
    const base = { category_id, card_id, description: $('q-desc').value };

    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, {
        ...base,
        date: $('q-date').value,
        amount_cents: amount,
        split_person_id,
        split_percent,
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
        split_person_id,
        split_percent,
      });
    }

    // Data e cartão ficam; o resto limpa. O formulário não fecha e o foco volta
    // para a descrição — o primeiro campo que de fato se digita de novo (§B.3).
    sticky.date = $('q-date').value;
    sticky.card = $('q-card').value;
    const catCreated = catRef.create !== undefined;
    const cardCreated = cardRef.create !== undefined;
    const personCreated = personRef ? personRef.create !== undefined : false;
    resetForm();
    if (catCreated || cardCreated || personCreated) await loadSelectors();
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
  $('toggleSplit').addEventListener('click', () =>
    setAdvanced(advancedMode() === 'split' ? null : 'split'),
  );
  $('q-person').addEventListener('input', () => {
    $('q-person-hint').textContent = entryHint($('q-person').value, state.people, 'person');
  });
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
