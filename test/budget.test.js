const { test } = require('node:test');
const assert = require('node:assert');

test('allocationStatus reports money left when limits fit under the ceiling', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([85000, 52000], 1435000, 377000, 244000);
  assert.equal(s.ceiling, 814000);
  assert.equal(s.allocated, 137000);
  assert.equal(s.remaining, 677000);
  assert.equal(s.over, false);
});

test('allocationStatus flags over-allocation past the ceiling', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([900000], 1435000, 377000, 244000);
  assert.equal(s.allocated, 900000);
  assert.equal(s.remaining, -86000);
  assert.equal(s.over, true);
});

test('allocationStatus treats exactly-at-ceiling as not over', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  const s = allocationStatus([814000], 1435000, 377000, 244000);
  assert.equal(s.remaining, 0);
  assert.equal(s.over, false);
});

test('allocationStatus on a fresh all-zero budget is all zeros', async () => {
  const { allocationStatus } = await import('../public/js/budget.js');
  assert.deepEqual(allocationStatus([], 0, 0, 0),
    { ceiling: 0, allocated: 0, remaining: 0, over: false });
});

test('allocationText shows remaining when within the ceiling', async () => {
  const { allocationStatus, allocationText } = await import('../public/js/budget.js');
  const txt = allocationText(allocationStatus([137000], 1435000, 377000, 244000));
  assert.match(txt, /Allocated R\$ 1\.370,00 of R\$ 8\.140,00/);
  assert.match(txt, /R\$ 6\.770,00 left/);
});

test('allocationText shows the overage when past the ceiling', async () => {
  const { allocationStatus, allocationText } = await import('../public/js/budget.js');
  const txt = allocationText(allocationStatus([900000], 1435000, 377000, 244000));
  assert.match(txt, /R\$ 860,00 over ceiling/);
});

test('allocationPillClass flips between ok and over across the boundary', async () => {
  const { allocationStatus, allocationPillClass } = await import('../public/js/budget.js');
  const within = allocationStatus([100000], 1435000, 377000, 244000);
  const over = allocationStatus([900000], 1435000, 377000, 244000);
  assert.equal(allocationPillClass(within), 'pill pill-ok');
  assert.equal(allocationPillClass(over), 'pill pill-over');
});
