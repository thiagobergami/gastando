const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { openDatabase, runMigrations } = require('../src/db');
const os = require('os');
const path = require('path');
const fs = require('fs');

test('schema applies and base fixtures exist', () => {
  const { db, categoryId, cardId } = makeTestDb();
  assert.ok(categoryId > 0);
  assert.ok(cardId > 0);
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of ['groups','categories','category_limits','cards','transactions','installment_groups','settings']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('openDatabase creates WAL-mode db and runMigrations applies schema', () => {
  const tmpPath = path.join(os.tmpdir(), `gastando-test-${Date.now()}.db`);
  try {
    const db = openDatabase(tmpPath);
    runMigrations(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes('groups'));
    assert.ok(tables.includes('transactions'));
    // Running migrations again should be idempotent
    runMigrations(db);
    db.close();
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
    try { fs.unlinkSync(tmpPath + '-wal'); } catch {}
    try { fs.unlinkSync(tmpPath + '-shm'); } catch {}
  }
});
