// test/openBrowser.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { browserCommand, openBrowser } = require('../src/infra/openBrowser');

test('windows uses cmd start', () => {
  assert.deepStrictEqual(browserCommand('win32', 'http://x'), {
    cmd: 'cmd',
    args: ['/c', 'start', '', 'http://x'],
  });
});

test('macOS uses open', () => {
  assert.deepStrictEqual(browserCommand('darwin', 'http://x'), { cmd: 'open', args: ['http://x'] });
});

test('linux uses xdg-open', () => {
  assert.deepStrictEqual(browserCommand('linux', 'http://x'), {
    cmd: 'xdg-open',
    args: ['http://x'],
  });
});

test('NO_OPEN suppresses launch', () => {
  assert.strictEqual(openBrowser('http://x', { platform: 'linux', env: { NO_OPEN: '1' } }), false);
});
