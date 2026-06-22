const express = require('express');
const { fail } = require('../validate');
const { makeCardRepository } = require('../infra/repositories/cards');

module.exports = (db) => {
  const router = express.Router();
  const repo = makeCardRepository(db);

  router.get('/', (req, res) => {
    res.json(repo.listAll());
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name) fail(400, 'name is required');
    res.status(201).json(repo.insert({ name }));
  });

  router.put('/:id', (req, res) => {
    const { name, active = 1 } = req.body;
    if (!name) fail(400, 'name is required');
    if (repo.update(req.params.id, { name, active: active ? 1 : 0 }) === 0) fail(404, 'card not found');
    res.json(repo.findById(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    if (repo.deactivate(req.params.id) === 0) fail(404, 'card not found');
    res.status(204).end();
  });

  return router;
};
