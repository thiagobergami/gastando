const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('GET /api/onboarding reports incomplete on a fresh database', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db)).get('/api/onboarding').expect(200);
  assert.deepEqual(res.body, { complete: false });
});

test('POST /api/onboarding/complete sets the flag and persists', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);

  const done = await request(app).post('/api/onboarding/complete').expect(200);
  assert.deepEqual(done.body, { complete: true });

  const after = await request(app).get('/api/onboarding').expect(200);
  assert.deepEqual(after.body, { complete: true });
});

test('POST /api/onboarding/template blank wipes categories and groups', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const res = await request(app).post('/api/onboarding/template')
    .send({ template: 'blank' }).expect(200);
  assert.deepEqual(res.body, { template: 'blank' });
  assert.deepEqual((await request(app).get('/api/categories').expect(200)).body, []);
  assert.deepEqual((await request(app).get('/api/groups').expect(200)).body, []);
});

test('POST /api/onboarding/template suggested keeps existing data', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/onboarding/template').send({ template: 'suggested' }).expect(200);
  assert.ok((await request(app).get('/api/categories').expect(200)).body.length > 0);
});

test('POST /api/onboarding/template rejects an unknown template', async () => {
  const { db } = makeTestDb();
  await request(createApp(db)).post('/api/onboarding/template')
    .send({ template: 'nope' }).expect(400);
});

test('POST /api/onboarding/template is blocked once transactions exist', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  db.prepare('INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)')
    .run('2026-06-01', categoryId, cardId, 1000);
  await request(createApp(db)).post('/api/onboarding/template')
    .send({ template: 'blank' }).expect(409);
});

test('POST /api/onboarding/template is blocked once onboarding is complete', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/onboarding/complete').expect(200);
  await request(app).post('/api/onboarding/template').send({ template: 'blank' }).expect(409);
});
