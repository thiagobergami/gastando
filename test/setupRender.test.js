const { test } = require('node:test');
const assert = require('node:assert');

test('SETUP_STEPS lists the four wizard steps in order', async () => {
  const { SETUP_STEPS } = await import('../public/js/setup.js');
  assert.deepEqual(SETUP_STEPS, ['Income', 'Fixed costs', 'Savings goal', 'Limits']);
});

test('progressPct maps the active step to a percentage of total', async () => {
  const { progressPct } = await import('../public/js/setup.js');
  assert.equal(progressPct(0, 4), 25);
  assert.equal(progressPct(1, 4), 50);
  assert.equal(progressPct(3, 4), 100);
});

test('isLastStep is true only on the final step', async () => {
  const { isLastStep } = await import('../public/js/setup.js');
  assert.equal(isLastStep(0, 4), false);
  assert.equal(isLastStep(3, 4), true);
});

test('continueLabel switches to the finish label on the last step', async () => {
  const { continueLabel } = await import('../public/js/setup.js');
  assert.equal(continueLabel(0, 4), 'Continue');
  assert.equal(continueLabel(3, 4), 'Start tracking');
});

test('renderStepIndicator marks the active step and lists every label', async () => {
  const { renderStepIndicator, SETUP_STEPS } = await import('../public/js/setup.js');
  const html = renderStepIndicator(1);
  for (const label of SETUP_STEPS) assert.ok(html.includes(label), `missing ${label}`);
  assert.match(html, /Step 2 of 4/);
  assert.match(html, /aria-current="step"/);
});
