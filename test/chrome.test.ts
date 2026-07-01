const { test } = require('node:test');
const assert = require('node:assert');

test('renderNav', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  assert.equal(NAV_ITEMS.length, 7);

  const html = renderNav('/transactions.html');
  // all five labels present
  for (const item of NAV_ITEMS) assert.ok(html.includes(item.label), `missing ${item.label}`);
  // wordmark present
  assert.match(html, /Gastando/);
  // both a desktop header and a mobile bottom-nav exist
  assert.match(html, /<header/);
  assert.match(html, /bottom-nav/);
  // active route marked
  assert.match(html, /href="\/transactions.html"[^>]*class="[^"]*active/);
  // pt-BR nav labels
  assert.match(html, /Transações/);
  assert.match(html, /Configurações/);
  assert.match(html, /Recorrentes/);
  assert.match(html, />Dashboard</); // stays English
  // theme toggle button
  assert.match(html, /id="theme-toggle"/);
});
