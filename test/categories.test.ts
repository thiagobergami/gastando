const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('POST /api/categories creates without a group and defaults to non-essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db))
    .post('/api/categories')
    .send({ name: 'Farmácia' })
    .expect(201);
  assert.equal(res.body.name, 'Farmácia');
  assert.equal(res.body.essential, 0);
  assert.equal(res.body.group_id, 0);
});

test('POST /api/categories honours essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db))
    .post('/api/categories')
    .send({ name: 'Moradia & Contas', essential: 1 })
    .expect(201);
  assert.equal(res.body.essential, 1);
});

test('POST /api/categories rejects an essential outside 0/1', async () => {
  const { db } = makeTestDb();
  await request(createApp(db))
    .post('/api/categories')
    .send({ name: 'X', essential: 2 })
    .expect(400);
});

test('PUT /api/categories/:id flips essential', async () => {
  const { db, categoryId } = makeTestDb();
  const res = await request(createApp(db))
    .put(`/api/categories/${categoryId}`)
    .send({ name: 'Supermercado', essential: 0 })
    .expect(200);
  assert.equal(res.body.essential, 0);
});

test('GET /api/categories exposes essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db)).get('/api/categories').expect(200);
  assert.equal(res.body[0].essential, 1);
});
