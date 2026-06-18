import { api, getPage, showError } from './api.js';
import { formatBRL, reaisToCents, centsToReais, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
let editingId = null; // null = add mode; otherwise the transaction id being edited
let page = 1;

$('month').value = currentMonth();
$('isInstallment').addEventListener('change', e => {
  $('installmentFields').style.display = e.target.checked ? 'inline' : 'none';
  $('amount').disabled = e.target.checked;
});
$('month').addEventListener('change', () => { page = 1; loadList(); });
$('perPage').addEventListener('change', () => { page = 1; loadList(); });
$('prevPage').addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
$('nextPage').addEventListener('click', () => { page++; loadList(); });
$('form').addEventListener('submit', onSubmit);
$('cancelEdit').addEventListener('click', resetForm);

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadList() {
  try {
    const perPage = Number($('perPage').value);
    const offset = (page - 1) * perPage;
    const { items: rows, total } = await getPage(
      `/api/transactions?month=${$('month').value}&limit=${perPage}&offset=${offset}`);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page > totalPages) { page = totalPages; return loadList(); }
    updatePager(total, perPage, totalPages);

    $('list').innerHTML = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.description}</td>
        <td class="mono">${formatBRL(r.amount_cents)}</td>
        <td>${r.installment_no ? r.installment_no + '/' + r.installment_total : ''}</td>
        <td>
          <button data-edit="${r.id}">Edit</button>
          <button data-del="${r.id}" data-group="${r.installment_group_id || ''}">Delete</button>
        </td>
      </tr>`).join('');
    $('list').querySelectorAll('button[data-edit]').forEach(b =>
      b.addEventListener('click', () => startEdit(rows.find(r => r.id === Number(b.dataset.edit)))));
    $('list').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', () => onDelete(Number(b.dataset.del), Number(b.dataset.group) || null)));
  } catch (e) { showError(e.message); }
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
  $('date').scrollIntoView({ block: 'center' });
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
  } catch (e) { showError(e.message); }
}

async function onSubmit(e) {
  e.preventDefault();
  try {
    const base = { category_id: Number($('category').value), card_id: Number($('card').value),
      description: $('description').value };

    if (editingId !== null) {
      await api.put(`/api/transactions/${editingId}`, { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
      resetForm();
    } else if ($('isInstallment').checked) {
      await api.post('/api/transactions', { ...base,
        installment_total_cents: reaisToCents($('amount').value || prompt('Total amount (R$)')),
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value });
      resetForm();
    } else {
      await api.post('/api/transactions', { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
      resetForm();
    }
    loadList();
  } catch (err) { showError(err.message); }
}

loadSelectors().then(loadList);
