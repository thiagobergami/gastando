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

test('groups: delete non-existent returns 404', async () => {
  const { app } = appWith();
  await request(app).delete('/api/groups/99999').expect(404);
});

test('groups: delete is a soft-delete and hides the group from listing', async () => {
  const { app } = appWith();
  const g = await request(app).post('/api/groups')
    .send({ name: 'Temp', color: 'gold' }).expect(201);
  await request(app).delete(`/api/groups/${g.body.id}`).expect(204);
  const list = await request(app).get('/api/groups').expect(200);
  assert.ok(!list.body.some(x => x.id === g.body.id), 'soft-deleted group still listed');
});

test('groups: delete is blocked while it has active categories', async () => {
  const { app, ctx } = appWith();
  // ctx.groupId has the seeded-in-helper active category "Supermercado".
  await request(app).delete(`/api/groups/${ctx.groupId}`).expect(409);
});

test('groups: post without name returns 400', async () => {
  const { app } = appWith();
  await request(app).post('/api/groups').send({ color: 'sage' }).expect(400);
});

test('categories: put updates name and examples', async () => {
  const { app, ctx } = appWith();
  const res = await request(app).put(`/api/categories/${ctx.categoryId}`)
    .send({ group_id: ctx.groupId, name: 'Updated', examples: 'test', sort_order: 0, active: 1 }).expect(200);
  assert.equal(res.body.name, 'Updated');
});

test('categories: put with invalid group_id returns 400', async () => {
  const { app, ctx } = appWith();
  await request(app).put(`/api/categories/${ctx.categoryId}`)
    .send({ group_id: 99999, name: 'Updated', examples: '' }).expect(400);
});

test('cards: create, list, soft-delete', async () => {
  const { app } = appWith();
  const c = await request(app).post('/api/cards').send({ name: 'Itaú' }).expect(201);
  assert.equal(c.body.active, 1);
  await request(app).delete(`/api/cards/${c.body.id}`).expect(204);
  const list = await request(app).get('/api/cards').expect(200);
  assert.equal(list.body.find(x => x.id === c.body.id).active, 0);
});

test('cards: put updates name, post without name returns 400, delete 404', async () => {
  const { app, ctx } = appWith();
  await request(app).post('/api/cards').send({}).expect(400);
  const put = await request(app).put(`/api/cards/${ctx.cardId}`)
    .send({ name: 'Updated Card', active: 1 }).expect(200);
  assert.equal(put.body.name, 'Updated Card');
  await request(app).delete('/api/cards/99999').expect(404);
});

test('limits: set per month and read with carry-forward', async () => {
  const { app, ctx } = appWith();
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 85000 }).expect(200);

  // Same month returns explicit value.
  const june = await request(app).get('/api/limits?month=2026-06').expect(200);
  assert.equal(june.body.find(l => l.category_id === ctx.categoryId).limit_cents, 85000);

  // Later month with no explicit row carries forward June's limit.
  const aug = await request(app).get('/api/limits?month=2026-08').expect(200);
  assert.equal(aug.body.find(l => l.category_id === ctx.categoryId).limit_cents, 85000);

  // Upsert replaces the value for the same (category, month).
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: 90000 }).expect(200);
  const june2 = await request(app).get('/api/limits?month=2026-06').expect(200);
  assert.equal(june2.body.find(l => l.category_id === ctx.categoryId).limit_cents, 90000);

  await request(app).get('/api/limits?month=bad').expect(400);
});

test('limits: put validates category_id and limit_cents', async () => {
  const { app, ctx } = appWith();
  await request(app).put('/api/limits')
    .send({ category_id: 99999, month: '2026-06', limit_cents: 1000 }).expect(400);
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: 'bad', limit_cents: 1000 }).expect(400);
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-06', limit_cents: -1 }).expect(400);
});
