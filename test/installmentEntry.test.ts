import assert from 'node:assert/strict';
import { test } from 'node:test';

test('entry supports installment and split, keeping recurring exclusive', async () => {
  const { toggleEntryOption } = await import('../public/js/installmentEntry.js');
  const both = toggleEntryOption({ installment: true, recurring: false, split: false }, 'split');
  assert.deepEqual(both, { installment: true, recurring: false, split: true });
  assert.deepEqual(toggleEntryOption(both, 'recurring'), {
    installment: false,
    recurring: true,
    split: false,
  });
  assert.deepEqual(
    toggleEntryOption({ installment: false, recurring: true, split: false }, 'split'),
    { installment: false, recurring: false, split: true },
  );
});

test('preview ignores stale replies and clears on reset or current failure', async () => {
  const { createSplitPreviewLoader } = await import('../public/js/installmentEntry.js');
  const requests: any[] = [];
  const published: any[] = [];
  const loader = createSplitPreviewLoader(
    () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    (p) => published.push(p),
  );
  const a = loader.load({});
  const b = loader.load({});
  requests[1].resolve({ total_receivable_cents: 50 });
  await b;
  requests[0].resolve({ total_receivable_cents: 20 });
  await a;
  assert.equal(published.at(-1).total_receivable_cents, 50);
  const c = loader.load({});
  loader.clear();
  requests[2].resolve({ total_receivable_cents: 30 });
  await c;
  assert.equal(published.at(-1), null);
  const d = loader.load({});
  requests[3].reject(new Error('offline'));
  await d;
  assert.equal(published.at(-1), null);
});

test('purchase editor preserves the current inactive person before resolving other names', async () => {
  const { resolvePurchasePerson } = await import('../public/js/installmentEntry.js');
  const people = [
    { id: 7, name: 'Ana', active: 0 },
    { id: 8, name: 'Ana', active: 1 },
  ];
  assert.deepEqual(resolvePurchasePerson(' Ana ', people, 7), { id: 7 });
  assert.deepEqual(resolvePurchasePerson('Bia', people, 7), { create: 'Bia' });
  assert.deepEqual(resolvePurchasePerson('Ana', people, null), { id: 8 });
});
