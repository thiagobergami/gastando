import { esc } from './format.js';

// Categoria e cartão são `<input list>` + `<datalist>`: o autocomplete é o nativo
// do browser, então Tab e Enter funcionam sem código de gerência de foco e não há
// widget próprio com ARIA e navegação por setas para manter (design §B.3).
const NOUN = {
  category: { article: 'a', word: 'categoria' },
  card: { article: 'o', word: 'cartão' },
};

export function resolveRef(name, items) {
  const typed = String(name ?? '').trim();
  if (!typed) return null;
  const hit = items.find((i) => i.name.toLowerCase() === typed.toLowerCase());
  return hit ? { id: hit.id } : { create: typed };
}

export function entryHint(name, items, kind) {
  const ref = resolveRef(name, items);
  if (!ref || ref.create === undefined) return '';
  const { article, word } = NOUN[kind];
  return `↵ cria ${article} ${word} ${esc(ref.create)}`;
}

const options = (items) =>
  items
    .filter((i) => i.active)
    .map((i) => `<option value="${esc(i.name)}"></option>`)
    .join('');

export function renderEntryRow(cats, cards, sticky) {
  const date = esc(sticky?.date ?? '');
  const card = esc(sticky?.card ?? '');
  return `
    <div class="flex flex-wrap items-end gap-3">
      <label class="field w-32"><span>Data</span>
        <input type="date" id="q-date" value="${date}" required /></label>
      <label class="field flex-1 min-w-[14rem]"><span>Descrição</span>
        <input type="text" id="q-desc" autocomplete="off" required /></label>
      <label class="field w-44"><span>Categoria</span>
        <input type="text" id="q-cat" list="cat-list" autocomplete="off" required /></label>
      <label class="field w-40"><span>Cartão</span>
        <input type="text" id="q-card" list="card-list" autocomplete="off" value="${card}" required /></label>
      <label class="field w-36"><span>Valor</span>
        <input type="text" id="q-amount" inputmode="decimal" class="font-mono" required /></label>
      <button type="submit" id="q-submit" class="btn-primary">Adicionar</button>
    </div>
    <div class="flex flex-wrap gap-6 text-xs text-clay mt-2 min-h-[1rem]">
      <span id="q-cat-hint"></span>
      <span id="q-card-hint"></span>
    </div>
    <datalist id="cat-list">${options(cats)}</datalist>
    <datalist id="card-list">${options(cards)}</datalist>`;
}
