const { test } = require('node:test');
const assert = require('node:assert');
const { makeTestDb } = require('./helpers');
const { makePersonRepository } = require('../src/infra/repositories/people');

test('insert + listAll round-trips a person, active by default', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  assert.equal(p.name, 'Ciclano');
  assert.equal(p.active, 1);
  const all = repo.listAll();
  // ctx já criou 'Fulano' no fixture — 'Ciclano' se soma a ele.
  assert.deepEqual(all.map((x) => x.name).sort(), ['Ciclano', 'Fulano']);
});

test('listAll includes inactive people — the client filters, same as categories/cards', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  repo.update(p.id, { name: 'Ciclano', active: 0 });
  const all = repo.listAll();
  assert.equal(all.length, 2); // Fulano (fixture) + Ciclano, mesmo inativo
});

test('update changes name and active, and reports 0 changes for an unknown id', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  const changes = repo.update(p.id, { name: 'Beltrano', active: 0 });
  assert.equal(changes, 1);
  const found = repo.findById(p.id);
  assert.equal(found.name, 'Beltrano');
  assert.equal(found.active, 0);
  assert.equal(repo.update(99999, { name: 'x', active: 1 }), 0);
});

test('findById resolves an inactive person — an old transaction still shows the name', () => {
  const ctx = makeTestDb();
  const repo = makePersonRepository(ctx.db);
  const p = repo.insert({ name: 'Ciclano' });
  repo.update(p.id, { name: 'Ciclano', active: 0 });
  const found = repo.findById(p.id);
  assert.equal(found.name, 'Ciclano');
  assert.equal(found.active, 0);
});

const { makePersonUseCases } = require('../src/application/use-cases/people');

function ucFor(ctx) {
  return makePersonUseCases({ people: makePersonRepository(ctx.db) });
}

test('use case create makes a new active person', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  assert.equal(p.name, 'Ciclano');
  assert.equal(p.active, 1);
});

test('use case update edits the person and 404s on an unknown id', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  const updated = uc.update(p.id, { name: 'Beltrano', active: 0 });
  assert.equal(updated.name, 'Beltrano');
  assert.equal(updated.active, 0);
  assert.throws(() => uc.update(99999, { name: 'x' }), /person not found/);
});

test('use case update defaults active to 1 when omitted', () => {
  const ctx = makeTestDb();
  const uc = ucFor(ctx);
  const p = uc.create({ name: 'Ciclano' });
  const updated = uc.update(p.id, { name: 'Ciclano' });
  assert.equal(updated.active, 1);
});

const request = require('supertest');
const { createApp } = require('../src/app');

test('GET /api/people lists everyone, active and inactive', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app).post('/api/people').send({ name: 'Ciclano' }).expect(201);
  await request(app)
    .put(`/api/people/${created.body.id}`)
    .send({ name: 'Ciclano', active: 0 })
    .expect(200);
  const list = await request(app).get('/api/people').expect(200);
  // Fulano (fixture) + Ciclano, mesmo inativo — GET não filtra, como
  // /api/categories e /api/cards hoje.
  assert.equal(list.body.length, 2);
});

test('POST /api/people requires a name', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/people').send({}).expect(400);
  await request(app).post('/api/people').send({ name: '' }).expect(400);
});

test('PUT /api/people/:id updates name and active, 404 on unknown id', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const created = await request(app).post('/api/people').send({ name: 'Ciclano' }).expect(201);
  const updated = await request(app)
    .put(`/api/people/${created.body.id}`)
    .send({ name: 'Beltrano', active: 0 })
    .expect(200);
  assert.equal(updated.body.name, 'Beltrano');
  assert.equal(updated.body.active, 0);
  await request(app).put('/api/people/99999').send({ name: 'x' }).expect(404);
});
