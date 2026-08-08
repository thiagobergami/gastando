const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('health endpoint responds', async () => {
  const res = await request(createApp({})).get('/api/health').expect(200);
  assert.deepEqual(res.body, { ok: true });
});

test('v0.3 retires the groups and onboarding endpoints', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/groups').expect(404);
  await request(app).get('/api/onboarding').expect(404);
  await request(app).post('/api/onboarding/complete').expect(404);
  await request(app).get('/api/bi/by-group?from=2026-01&to=2026-02').expect(404);
});
