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

test('v0.3 redirects the old page names to the verbs', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);

  const t = await request(app).get('/transactions.html').expect(301);
  assert.equal(t.headers.location, '/registrar.html');

  const b = await request(app).get('/bi.html').expect(301);
  assert.equal(b.headers.location, '/analise.html');

  await request(app).get('/registrar.html').expect(200);
  await request(app).get('/analise.html').expect(200);
});
