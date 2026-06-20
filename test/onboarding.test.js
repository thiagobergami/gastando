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
