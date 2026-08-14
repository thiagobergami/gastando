const { test } = require('node:test');
const assert = require('node:assert');

const cats = [
  { id: 1, name: 'Mercado', active: 1 },
  { id: 2, name: 'Restaurantes & Delivery', active: 1 },
  { id: 3, name: 'Antiga', active: 0 },
];
const cards = [
  { id: 5, name: 'Nubank', active: 1 },
  { id: 6, name: 'Itaú', active: 1 },
];

test('resolveRef matches an existing name regardless of case and padding', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.deepEqual(resolveRef('Mercado', cats), { id: 1 });
  assert.deepEqual(resolveRef('mercado', cats), { id: 1 });
  assert.deepEqual(resolveRef('  MERCADO  ', cats), { id: 1 });
  assert.deepEqual(resolveRef('Nubank', cards), { id: 5 });
});

test('resolveRef asks for creation when the name is new', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.deepEqual(resolveRef('Farmácia', cats), { create: 'Farmácia' });
  assert.deepEqual(resolveRef('  Farmácia  ', cats), { create: 'Farmácia' });
});

// Excluir uma categoria é soft delete: a linha continua no banco com `active=0`
// e `GET /api/categories` continua devolvendo ela. Casar por nome contra uma
// categoria excluída prenderia o lançamento a algo que o Acompanhar não agrega —
// o dinheiro sumiria do painel e do total do mês, sem aviso nenhum.
test('resolveRef never matches a deleted category or card', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.deepEqual(resolveRef('Antiga', cats), { create: 'Antiga' });
  assert.deepEqual(resolveRef('antiga', cats), { create: 'antiga' });
  assert.deepEqual(resolveRef('Cancelado', [{ id: 9, name: 'Cancelado', active: 0 }]), {
    create: 'Cancelado',
  });
});

test('entryHint warns before reusing the name of a deleted category', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.equal(entryHint('Antiga', cats, 'category'), '↵ cria a categoria Antiga');
});

test('resolveRef returns null for an empty field', async () => {
  const { resolveRef } = await import('../public/js/quickentry.js');
  assert.equal(resolveRef('', cats), null);
  assert.equal(resolveRef('   ', cats), null);
  assert.equal(resolveRef(undefined, cats), null);
});

test('entryHint announces the creation before the submit', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.equal(entryHint('Farmácia', cats, 'category'), '↵ cria a categoria Farmácia');
  assert.equal(entryHint('Inter', cards, 'card'), '↵ cria o cartão Inter');
});

test('entryHint stays quiet when there is nothing to create', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.equal(entryHint('Mercado', cats, 'category'), '');
  assert.equal(entryHint('', cats, 'category'), '');
});

test('entryHint escapes the typed name', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  assert.match(entryHint('<script>', cats, 'category'), /&lt;script&gt;/);
  assert.doesNotMatch(entryHint('<script>', cats, 'category'), /<script>/);
});

test('renderEntryRow lays out the five fields in the Figma order', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '2026-08-06', card: 'Nubank' });
  const order = ['q-date', 'q-desc', 'q-cat', 'q-card', 'q-amount'].map((id) =>
    html.indexOf(`id="${id}"`),
  );
  for (const i of order) assert.ok(i > -1, 'a field is missing');
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    'fields are out of order',
  );
});

test('renderEntryRow keeps date and card sticky between entries', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '2026-08-06', card: 'Nubank' });
  assert.match(html, /id="q-date"[^>]*value="2026-08-06"/);
  assert.match(html, /id="q-card"[^>]*value="Nubank"/);
});

test('renderEntryRow offers only active names for autocomplete', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /<datalist id="cat-list">/);
  assert.match(html, /<datalist id="card-list">/);
  assert.match(html, /value="Mercado"/);
  assert.match(html, /value="Itaú"/);
  assert.doesNotMatch(html, /value="Antiga"/); // inativa
});

test('renderEntryRow uses native datalist, not a custom combobox', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /id="q-cat"[^>]*list="cat-list"/);
  assert.match(html, /id="q-card"[^>]*list="card-list"/);
  assert.doesNotMatch(html, /<select/);
});

test('renderEntryRow has a hint slot under each creatable field', async () => {
  const { renderEntryRow } = await import('../public/js/quickentry.js');
  const html = renderEntryRow(cats, cards, { date: '', card: '' });
  assert.match(html, /id="q-cat-hint"/);
  assert.match(html, /id="q-card-hint"/);
});

test('entryHint knows the noun for a person', async () => {
  const { entryHint } = await import('../public/js/quickentry.js');
  const people = [{ id: 1, name: 'Fulano', active: 1 }];
  assert.equal(entryHint('Ciclano', people, 'person'), '↵ cria a pessoa Ciclano');
});
