const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');

test('health endpoint responds', async () => {
  const res = await request(createApp({})).get('/api/health').expect(200);
  assert.deepEqual(res.body, { ok: true });
});
