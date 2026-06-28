import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL } from './format.js';

const $ = (id) => document.getElementById(id);

export function renderGroups(rows) {
  if (!rows.length) {
    return `<p class="paper-card text-ink-mut">No installment purchases yet.</p>`;
  }
  return rows
    .map(
      (r) => `
    <div class="paper-card" data-row="${r.id}">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold">${esc(r.description) || 'Installment'}</div>
          <div class="text-xs text-ink-mut mt-0.5">${esc(r.category_name)} · ${esc(r.card_name)}</div>
        </div>
        <span class="tag tag-gold">${r.paid_count}/${r.total_count}</span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><div class="text-ink-mut text-xs">Monthly</div><div class="font-mono">${formatBRL(r.monthly_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Remaining</div><div class="font-mono">${formatBRL(r.remaining_cents)}</div></div>
        <div><div class="text-ink-mut text-xs">Next</div><div class="font-mono">${r.next_month || '—'}</div></div>
      </div>
      <div class="mt-3 text-right">
        <button data-edit="${r.id}" class="text-sage text-sm mr-2">Edit</button>
        ${r.remaining_count > 0 ? `<button data-payoff="${r.id}" class="text-sage text-sm mr-2">Pay off early</button>` : ''}
        <button data-del="${r.id}" class="text-clay text-sm">Delete</button>
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
  } catch (e) {
    showError(e.message);
  }
}

function wire(rows) {
  $('list')
    .querySelectorAll('button[data-del]')
    .forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this installment group (all parcelas)?')) return;
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
        if (!confirm('Pay off early? Remaining parcelas move into this month.')) return;
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
  $('editId').value = r.id;
  $('e_description').value = r.description;
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
      await api.put(`/api/installment-groups/${$('editId').value}`, {
        category_id: Number($('e_category').value),
        card_id: Number($('e_card').value),
        description: $('e_description').value,
        total_cents: Math.round(Number($('e_total').value) * 100),
        count: Number($('e_count').value),
        first_month: $('e_firstMonth').value,
      });
      $('editCard').style.display = 'none';
      load();
    } catch (err) {
      showError(err.message);
    }
  });
  // populate category/card selects in the edit form
  Promise.all([api.get('/api/categories'), api.get('/api/cards')])
    .then(([cats, cards]) => {
      $('e_category').innerHTML = cats
        .filter((c) => c.active)
        .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
        .join('');
      $('e_card').innerHTML = cards
        .filter((c) => c.active)
        .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
        .join('');
    })
    .catch((e) => showError(e.message));
  load();
}
