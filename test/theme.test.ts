const { test } = require('node:test');
const assert = require('node:assert');

test('resolveTheme prefers an explicit stored value', () => {
  const { resolveTheme } = require('../public/js/theme-init.js');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('resolveTheme falls back to OS preference when unset', () => {
  const { resolveTheme } = require('../public/js/theme-init.js');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('', true), 'dark');
});
