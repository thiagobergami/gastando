import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL } from './format.js';

const $ = (id) => document.getElementById(id);
let names = { cats: new Map(), cards: new Map() };

export function renderList(rows, n) {
  if (!rows.length) return `<p class="paper-card text-ink-mut">Nenhum recorrente ainda.</p>`;
  return rows
    .filter((r) => r.active)
    .map(
      (r) => `
    <div class="paper-card flex items-center justify-between">
      <div>
        <div class="font-semibold">${esc(r.description) || 'Recorrente'}</div>
        <div class="text-xs text-ink-mut">${esc(n.cats.get(r.category_id) || '')} · ${esc(n.cards.get(r.card_id) || '')} · dia ${r.day_of_month}</div>
      </div>
      <div class="text-right">
        <div class="font-mono">${formatBRL(r.amount_cents)}</div>
        <button data-del="${r.id}" class="text-clay text-sm">Remover</button>
      </div>
    </div>`,
    )
    .join('');
}

async function load() {
  try {
    const [rows, cats, cards] = await Promise.all([
      api.get('/api/recurring'),
      api.get('/api/categories'),
      api.get('/api/cards'),
    ]);
    names = {
      cats: new Map(cats.map((c) => [c.id, c.name])),
      cards: new Map(cards.map((c) => [c.id, c.name])),
    };
    $('list').innerHTML = renderList(rows, names);
    $('list')
      .querySelectorAll('button[data-del]')
      .forEach((b) => {
        b.addEventListener('click', async () => {
          try {
            await api.del(`/api/recurring/${b.dataset.del}`);
            load();
          } catch (e) {
            showError(e.message);
          }
        });
      });
    $('category').innerHTML = cats
      .filter((c) => c.active)
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join('');
    $('card').innerHTML = cards
      .filter((c) => c.active)
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join('');
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('list')) {
  mountChrome('/recurring.html');
  $('month').value = currentMonth();
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/recurring', {
        description: $('description').value,
        category_id: Number($('category').value),
        card_id: Number($('card').value),
        amount_cents: Math.round(Number($('amount').value) * 100),
        day_of_month: Number($('day').value),
      });
      $('addForm').reset();
      load();
    } catch (err) {
      showError(err.message);
    }
  });
  $('materialize').addEventListener('click', async () => {
    try {
      const r = await api.post('/api/recurring/materialize', { month: $('month').value });
      const changed = r.changed
        .map((c) => `${formatBRL(c.from_cents)}→${formatBRL(c.to_cents)}`)
        .join(', ');
      showError(
        `Criados ${r.created.length}, ignorados ${r.skipped.length}${changed ? ` · alterados: ${changed}` : ''}`,
      );
    } catch (e) {
      showError(e.message);
    }
  });
  load();
}
