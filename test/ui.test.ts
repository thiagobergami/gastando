const { test } = require('node:test');
const assert = require('node:assert');

test('ui helpers', async () => {
  const ui = await import('../public/js/ui.js');

  // currency
  assert.match(ui.currency(85000), /R\$ 850,00/);
  assert.match(ui.currency(85000), /font-mono/);

  // meterBar: under limit → sage (no 'over'), width proportional
  const under = ui.meterBar(50000, 100000, 'ok');
  assert.match(under, /class="meter"/);
  assert.doesNotMatch(under, /over/);
  assert.match(under, /width:50%/);

  // meterBar: over limit → 'over' class, width clamped to 100
  const over = ui.meterBar(120000, 100000, 'over');
  assert.match(over, /meter-fill over/);
  assert.match(over, /width:100%/);

  // meterBar: zero limit → 0% width, no crash
  assert.match(ui.meterBar(0, 0, 'ok'), /width:0%/);

  // statusPill
  assert.match(ui.statusPill('ok'), /pill-ok/);
  assert.match(ui.statusPill('over'), /pill-over/);

  // groupTag
  assert.match(ui.groupTag('Essenciais / semi-fixos'), /tag-sage/);
  assert.match(ui.groupTag('Estilo de vida'), /tag-gold/);
  assert.match(ui.groupTag('Fundos'), /tag-slate/);
  assert.match(ui.groupTag('Folga'), /tag-neutral/);
});

test('statusPill renders a warn pill when approaching', async () => {
  const { statusPill } = await import('../public/js/ui.js');
  assert.match(statusPill('approaching'), /pill-warn/);
  assert.match(statusPill('approaching'), /Close/);
});

test('meterBar marks the approaching fill', async () => {
  const { meterBar } = await import('../public/js/ui.js');
  assert.match(meterBar(85, 100, 'approaching'), /meter-fill approaching/);
  assert.doesNotMatch(meterBar(85, 100, 'approaching'), /over/);
});
