const { test } = require('node:test');
const assert = require('node:assert');

test('renderNav ships the three verbs of the loop', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  assert.equal(NAV_ITEMS.length, 3);
  assert.deepEqual(
    NAV_ITEMS.map((i) => i.label),
    ['Registrar', 'Acompanhar', 'Decidir'],
  );

  const html = renderNav('/registrar.html');
  for (const item of NAV_ITEMS) assert.ok(html.includes(item.label), `missing ${item.label}`);
  assert.match(html, /Gastando/);
  assert.match(html, /<header/);
  assert.match(html, /bottom-nav/);
  // a engrenagem leva a Configurações, que saiu da navegação
  assert.match(html, /href="\/settings.html"[^>]*aria-label="Configurações"/);
  // o toggle de tema ainda está aqui — só sai na Task 3
  assert.match(html, /id="theme-toggle"/);
});

test('renderNav marks the active route on every entry', async () => {
  const { renderNav, NAV_ITEMS } = await import('../public/js/chrome.js');
  for (const item of NAV_ITEMS) {
    const html = renderNav(item.route);
    const escaped = item.route.replace(/\//g, '\\/');
    assert.match(
      html,
      new RegExp(`href="${escaped}"[^>]*class="[^"]*active`),
      `route ${item.route} not marked active`,
    );
  }
});

test('renderNav drops the screens that stopped being destinations', async () => {
  const { renderNav } = await import('../public/js/chrome.js');
  const html = renderNav('/');
  for (const gone of ['Parcelas', 'Recorrentes', 'Simular', 'Dashboard', 'Transações', '>BI<']) {
    assert.ok(!html.includes(gone), `nav still shows ${gone}`);
  }
});

test('chrome no longer ships an onboarding guard', async () => {
  const mod = await import('../public/js/chrome.js');
  assert.equal(mod.enforceOnboarding, undefined);
});
