import { api, showError } from './api.js';
import { formatBRL, reaisToCents, currentMonth } from './format.js';

const $ = id => document.getElementById(id);
$('month').value = currentMonth();
$('isInstallment').addEventListener('change', e => {
  $('installmentFields').style.display = e.target.checked ? 'inline' : 'none';
  $('amount').disabled = e.target.checked;
});
$('month').addEventListener('change', loadList);
$('form').addEventListener('submit', onSubmit);

async function loadSelectors() {
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  $('category').innerHTML = cats.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('card').innerHTML = cards.filter(c => c.active).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadList() {
  try {
    const rows = await api.get(`/api/transactions?month=${$('month').value}`);
    $('list').innerHTML = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${r.description}</td>
        <td class="mono">${formatBRL(r.amount_cents)}</td>
        <td>${r.installment_no ? r.installment_no + '/' + r.installment_total : ''}</td>
        <td><button data-del="${r.id}" ${r.installment_group_id ? 'disabled title="delete via group"' : ''}>×</button></td>
      </tr>`).join('');
    $('list').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/transactions/${b.dataset.del}`); loadList(); }
        catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

async function onSubmit(e) {
  e.preventDefault();
  try {
    const base = { category_id: Number($('category').value), card_id: Number($('card').value),
      description: $('description').value };
    if ($('isInstallment').checked) {
      await api.post('/api/transactions', { ...base,
        installment_total_cents: reaisToCents($('amount').value || prompt('Total amount (R$)')),
        installment_count: Number($('count').value),
        first_month: $('firstMonth').value });
    } else {
      await api.post('/api/transactions', { ...base,
        date: $('date').value, amount_cents: reaisToCents($('amount').value) });
    }
    $('form').reset(); $('installmentFields').style.display = 'none'; $('amount').disabled = false;
    loadList();
  } catch (err) { showError(err.message); }
}

loadSelectors().then(loadList);
