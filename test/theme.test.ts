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

test('applyTheme writes the attribute and persists the choice', async () => {
  const { applyTheme } = await import('../public/js/settings.js');
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  const saved = {};
  const storage = { setItem: (k, v) => (saved[k] = v) };

  assert.equal(applyTheme('dark', doc, storage), 'dark');
  assert.equal(attrs['data-theme'], 'dark');
  assert.equal(saved.theme, 'dark');
});

test('applyTheme survives a storage that throws (private mode)', async () => {
  const { applyTheme } = await import('../public/js/settings.js');
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  const storage = {
    setItem() {
      throw new Error('denied');
    },
  };

  assert.equal(applyTheme('light', doc, storage), 'light');
  assert.equal(attrs['data-theme'], 'light');
});

test('chrome no longer owns the theme toggle', async () => {
  const { renderNav } = await import('../public/js/chrome.js');
  assert.doesNotMatch(renderNav('/'), /theme-toggle/);
});
