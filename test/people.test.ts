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
  assert.deepEqual(
    all.map((x) => x.name).sort(),
    ['Ciclano', 'Fulano'],
  );
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
