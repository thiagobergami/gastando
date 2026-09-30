const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('excess is flagged but does not carry until chosen for that category and month', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  const app = createApp(db);
  const otherId = Number(
    db.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (0, 'Lazer', 1)").run()
      .lastInsertRowid,
  );
  for (const id of [categoryId, otherId]) {
    await request(app)
      .put('/api/limits')
      .send({ category_id: id, month: '2026-01', limit_cents: 10000 })
      .expect(200);
    db.prepare(
      'INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)',
    ).run('2026-01-10', id, cardId, 13000);
  }

  const january = await request(app).get('/api/limits?month=2026-01').expect(200);
  const flagged = january.body.find((row) => row.category_id === categoryId);
  assert.equal(flagged.overage_cents, 3000);
  assert.equal(flagged.carry_forward, false);

  const before = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  assert.equal(before.body.categories.find((c) => c.category_id === categoryId).carry_in_cents, 0);

  await request(app)
    .put('/api/limits/carry')
    .send({ category_id: categoryId, month: '2026-01', carry_forward: true })
    .expect(200);
  const saved = await request(app).get('/api/limits?month=2026-01').expect(200);
  assert.equal(saved.body.find((row) => row.category_id === categoryId).carry_forward, true);
  const after = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  assert.equal(
    after.body.categories.find((c) => c.category_id === categoryId).carry_in_cents,
    3000,
  );
  assert.equal(after.body.categories.find((c) => c.category_id === otherId).carry_in_cents, 0);

  await request(app)
    .put('/api/limits/carry')
    .send({ category_id: categoryId, month: '2026-01', carry_forward: false })
    .expect(200);
  const disabled = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  assert.equal(
    disabled.body.categories.find((c) => c.category_id === categoryId).carry_in_cents,
    0,
  );
});

test('each exceeded month needs its own choice to pass the remaining excess onward', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/limits')
    .send({ category_id: categoryId, month: '2026-01', limit_cents: 10000 })
    .expect(200);
  const insert = db.prepare(
    'INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)',
  );
  insert.run('2026-01-10', categoryId, cardId, 13000);
  insert.run('2026-02-10', categoryId, cardId, 8000);
  await request(app)
    .put('/api/limits/carry')
    .send({ category_id: categoryId, month: '2026-01', carry_forward: true })
    .expect(200);

  const february = await request(app).get('/api/limits?month=2026-02').expect(200);
  const row = february.body.find((item) => item.category_id === categoryId);
  assert.equal(row.carry_in_cents, 3000);
  assert.equal(row.overage_cents, 1000);
  assert.equal(row.carry_forward, false);
  const marchBefore = await request(app).get('/api/dashboard?month=2026-03').expect(200);
  assert.equal(
    marchBefore.body.categories.find((c) => c.category_id === categoryId).carry_in_cents,
    0,
  );

  await request(app)
    .put('/api/limits/carry')
    .send({ category_id: categoryId, month: '2026-02', carry_forward: true })
    .expect(200);
  const marchAfter = await request(app).get('/api/dashboard?month=2026-03').expect(200);
  assert.equal(
    marchAfter.body.categories.find((c) => c.category_id === categoryId).carry_in_cents,
    1000,
  );
});

test('carry decision requires a real category, valid month and boolean flag', async () => {
  const { db, categoryId } = makeTestDb();
  const app = createApp(db);
  for (const body of [
    { category_id: 999999, month: '2026-01', carry_forward: true },
    { category_id: categoryId, month: 'bad', carry_forward: true },
    { category_id: categoryId, month: '2026-01', carry_forward: 1 },
  ]) {
    await request(app).put('/api/limits/carry').send(body).expect(400);
  }
});
