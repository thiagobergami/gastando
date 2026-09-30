import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL } from './format.js';
import { resolvePurchasePerson } from './installmentEntry.js';

let editingPersonId = null;
let selectors = { cats: [], cards: [], people: [] };
const $ = (id) => document.getElementById(id);

export function renderGroups(rows) {
  if (!rows.length) {
    return `<p class="paper-card text-ink-mut">Nenhum parcelamento ainda.</p>`;
  }
  return rows
    .map(
      (r) => `
    <div class="paper-card" data-row="${r.id}">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold">${esc(r.description) || 'Parcelamento'}</div>
          <div class="text-xs text-ink-mut mt-0.5">${esc(r.category_name)} · ${esc(r.card_name)}</div>
        </div>
        <span class="tag tag-gold">${r.paid_count}/${r.total_count}</span>
      </div>
${r.split_person_id ? `<div class="text-sm text-sage mt-3">${r.split_percent}% ${esc(r.split_person_name)}</div>` : ''}
      <div class="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><div class="text-ink-mut text-xs">Mensal</div><div class="font-mono">${formatBRL(r.monthly_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Restante</div><div class="font-mono">${formatBRL(r.remaining_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Próximo</div><div class="font-mono">${r.next_month || '—'}</div></div>
      </div>
      <div class="mt-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Editar</button>
        ${r.remaining_count > 0 ? `<button data-payoff="${r.id}" class="text-sage text-sm mr-2">Quitar antecipado</button>` : ''}
        <button data-del="${r.id}" class="text-clay text-sm">Excluir</button>
      </div>
    </div>`,
    )
    .join('');
}

async function load() {
  try {
    const rows = await api.get(`/api/installment-groups?month=${$('month').value}`);
    $('list').innerHTML = renderGroups(rows);
    wire(rows);
    const groupId = Number(new URLSearchParams(location.search).get('group'));
    if (groupId && !$('editId').value) {
      const row = rows.find((r) => r.id === groupId);
      if (row) startEdit(row);
      else showError('Compra parcelada não encontrada.');
    }
  } catch (e) {
    showError(e.message);
  }
}

function wire(rows) {
  $('list')
    .querySelectorAll('button[data-del]')
    .forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta compra, todas as parcelas e os valores a receber?')) return;
        try {
          await api.del(`/api/installment-groups/${b.dataset.del}`);
          load();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  $('list')
    .querySelectorAll('button[data-payoff]')
    .forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Quitar antecipado? As parcelas restantes vão para este mês.')) return;
        try {
          await api.post(`/api/installment-groups/${b.dataset.payoff}/payoff`, {
            month: $('month').value,
          });
          load();
        } catch (e) {
          showError(e.message);
        }
      });
    });
  $('list')
    .querySelectorAll('button[data-edit]')
    .forEach((b) => {
      b.addEventListener('click', () =>
        startEdit(rows.find((r) => r.id === Number(b.dataset.edit))),
      );
    });
}

function startEdit(r) {
  if (!r) return;
  editingPersonId = r.split_person_id;
  $('editId').value = r.id;
  $('e_description').value = r.description;
  for (const [id, list, value] of [
    ['e_category', selectors.cats, r.category_id],
    ['e_card', selectors.cards, r.card_id],
  ]) {
    $(id).innerHTML = list
      .filter((item) => item.active || item.id === value)
      .map((item) => `<option value="${item.id}">${esc(item.name)}</option>`)
      .join('');
    $(id).value = value;
  }
  $('e_person').value = r.split_person_name ?? '';
  $('e_percent').value = r.split_percent ?? '';
  $('e_people').innerHTML = selectors.people
    .filter((p) => p.active || p.id === r.split_person_id)
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join('');
  $('e_split_hint').textContent = r.has_individual_splits
    ? 'Esta compra tem divisões individuais. Remova-as em Registrar antes de dividir a compra inteira.'
    : 'A divisão se aplica a todas as parcelas, inclusive as de meses anteriores. Limpe pessoa e porcentagem para remover.';
  $('e_total').value = (r.total_cents / 100).toFixed(2);
  $('e_count').value = r.total_count;
  $('e_firstMonth').value = r.first_month;
  $('editCard').style.display = 'block';
  $('editCard').scrollIntoView({ block: 'center' });
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/parcelas.html');
  $('month').value = currentMonth();
  $('month').addEventListener('change', load);
  $('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = $('e_person').value.trim();
      const percentText = $('e_percent').value;
      const split_percent = percentText === '' ? null : Number(percentText);
      if (
        !!name !== (split_percent !== null) ||
        (split_percent !== null &&
          (!Number.isInteger(split_percent) || split_percent < 1 || split_percent > 99))
      ) {
        throw new Error('Informe pessoa e porcentagem (1 a 99) juntas, ou limpe ambas.');
      }
      let split_person_id = null;
      if (name) {
        const person = resolvePurchasePerson(name, selectors.people, editingPersonId);
        if (person.id) split_person_id = person.id;
        else {
          const created = await api.post('/api/people', { name: person.create });
          selectors.people.push(created);
          split_person_id = created.id;
        }
      }
      await api.put(`/api/installment-groups/${$('editId').value}`, {
        category_id: Number($('e_category').value),
        card_id: Number($('e_card').value),
        description: $('e_description').value,
        total_cents: Math.round(Number($('e_total').value) * 100),
        count: Number($('e_count').value),
        first_month: $('e_firstMonth').value,
        split_person_id,
        split_percent,
      });
      $('editCard').style.display = 'none';
      load();
    } catch (err) {
      showError(err.message);
    }
  });
  Promise.all([api.get('/api/categories'), api.get('/api/cards'), api.get('/api/people')])
    .then(([cats, cards, people]) => {
      selectors = { cats, cards, people };
      return load();
    })
    .catch((e) => showError(e.message));
}
