const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('GET /api/backup streams a SQLite file', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const res = await request(app).get('/api/backup').expect(200);
  assert.match(res.headers['content-disposition'], /attachment/);
  // SQLite files start with the "SQLite format 3\0" magic header.
  assert.match(res.body.slice(0, 15).toString('utf8'), /SQLite format 3/);
});
