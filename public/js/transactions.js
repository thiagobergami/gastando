import { api, getPage, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { centsToReais, currentMonth, esc, formatBRL, reaisToCents } from './format.js';

const $ = (id) => document.getElementById(id);
let editingId = null;
let page = 1;

export function renderRows(rows) {
  return rows
    .map(
      (r) => `
    <tr class="border-b border-line">
      <td class="py-3 font-mono text-sm text-ink-mut">${r.date}</td>
      <td class="py-3">${esc(r.description)}
        ${r.installment_no ? `<span class="tag tag-gold ml-2">${r.installment_no}/${r.installment_total}</span>` : ''}</td>
      <td class="py-3 text-right font-mono">${formatBRL(r.amount_cents)}</td>
      <td class="py-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Edit</button>
        <button data-del="${r.id}" data-group="${r.installment_group_id || ''}" class="text-clay text-sm">Delete</button>
      </td>
    </tr>`,
    )
    .join('');
}

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  $('category').innerHTML = cats
    .filter((c) => c.active)
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  $('card').innerHTML = cards
    .filter((c) => c.active)
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  const opt = (c) => `<option value="${c.id}">${esc(c.name)}</option>`;
  $('filterCategory').insertAdjacentHTML(
    'beforeend',
    cats
      .filter((c) => c.active)
      .map(opt)
      .join(''),
  );
  $('filterCard').insertAdjacentHTML(
    'beforeend',
    cards
      .filter((c) => c.active)
      .map(opt)
      .join(''),
  );
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
    $('list').innerHTML = renderRows(rows);
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
  $('pageInfo').textContent = `${from}–${to} of ${total} · page ${page}/${totalPages}`;
  $('prevPage').disabled = page <= 1;
  $('nextPage').disabled = page >= totalPages;
}

function startEdit(r) {
  if (!r) return;
  editingId = r.id;
  $('isInstallment').checked = false;
  $('installmentFields').style.display = 'none';
  $('isInstallment').disabled = true;
  $('amount').disabled = false;
  $('date').value = r.date;
  $('category').value = String(r.category_id);
  $('card').value = String(r.card_id);
  $('amount').value = centsToReais(r.amount_cents);
  $('description').value = r.description;
  $('submitBtn').textContent = 'Save';
  $('cancelEdit').style.display = 'inline';
  $('formCard').scrollIntoView({ block: 'center' });
}

function resetForm() {
  editingId = null;
  $('form').reset();
  $('installmentFields').style.display = 'none';
  $('isInstallment').disabled = false;
  $('amount').disabled = false;
  $('submitBtn').textContent = 'Add';
  $('cancelEdit').style.display = 'none';
}

async function onDelete(id, groupId) {
  try {
    if (groupId) {
      if (!confirm('Delete the entire installment group (all parcelas)?')) return;
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

async function onSubmit(e) {
  e.preventDefault();
  try {
    const base = {
      category_id: Number($('category').value),
      card_id: Number($('card').value),
      description: $('description').value,
    };
    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, {
        ...base,
        date: $('date').value,
        amount_cents: reaisToCents($('amount').value),
      });
    } else if ($('isInstallment').checked) {
      await api.post('/api/transactions', {
        ...base,
        installment_total_cents: reaisToCents($('amount').value),
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value,
      });
    } else {
      await api.post('/api/transactions', {
        ...base,
        date: $('date').value,
        amount_cents: reaisToCents($('amount').value),
      });
    }
    resetForm();
    loadList();
  } catch (err) {
    showError(err.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/transactions.html');
  $('month').value = currentMonth();
  $('isInstallment').addEventListener('change', (e) => {
    $('installmentFields').style.display = e.target.checked ? 'contents' : 'none';
    $('amount').disabled = e.target.checked;
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
  const fab = document.getElementById('fab');
  if (fab) fab.addEventListener('click', () => $('formCard').scrollIntoView({ block: 'start' }));
  loadSelectors().then(loadList);
}
