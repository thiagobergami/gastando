const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveDbPath } = require('../src/paths');

test('DB_PATH env overrides everything', () => {
  const result = resolveDbPath({ env: { DB_PATH: '/custom/my.db' }, isPackaged: true, execPath: '/bin/app' });
  assert.strictEqual(result, '/custom/my.db');
});

test('packaged: db sits next to the executable', () => {
  const result = resolveDbPath({ env: {}, isPackaged: true, execPath: path.join('/opt', 'gastando', 'gastando') });
  assert.strictEqual(result, path.join('/opt', 'gastando', 'data', 'gastando.db'));
});

test('not packaged: db sits under the project root', () => {
  const result = resolveDbPath({ env: {}, isPackaged: false, projectRoot: '/proj' });
  assert.strictEqual(result, path.join('/proj', 'data', 'gastando.db'));
});
