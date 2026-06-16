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

const request = require('supertest');
const { createApp } = require('../src/app');

function appWith() {
  const ctx = makeTestDb();
  return { app: createApp(ctx.db), ctx };
}

test('groups: create, list, update, delete', async () => {
  const { app } = appWith();
  const created = await request(app).post('/api/groups')
    .send({ name: 'Essenciais', color: 'sage', sort_order: 1 }).expect(201);
  assert.equal(created.body.name, 'Essenciais');

  const list = await request(app).get('/api/groups').expect(200);
  assert.ok(list.body.some(g => g.name === 'Essenciais'));

  await request(app).put(`/api/groups/${created.body.id}`)
    .send({ name: 'Essenciais / semi-fixos', color: 'sage', sort_order: 1 }).expect(200);
  await request(app).delete(`/api/groups/${created.body.id}`).expect(204);
});

test('categories: create requires a real group and supports soft-delete', async () => {
  const { app, ctx } = appWith();
  await request(app).post('/api/categories')
    .send({ group_id: 99999, name: 'X' }).expect(400);

  const c = await request(app).post('/api/categories')
    .send({ group_id: ctx.groupId, name: 'Transporte', examples: 'Uber' }).expect(201);
  assert.equal(c.body.active, 1);

  await request(app).delete(`/api/categories/${c.body.id}`).expect(204);
  const after = await request(app).get('/api/categories').expect(200);
  const found = after.body.find(x => x.id === c.body.id);
  assert.equal(found.active, 0);
});
