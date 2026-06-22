const express = require('express');
const { fail } = require('../validate');
const { makeGroupRepository } = require('../infra/repositories/groups');
const { makeGroupUseCases } = require('../application/use-cases/groups');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeGroupUseCases({ groups: makeGroupRepository(db) });

  router.get('/', (req, res) => {
    res.json(uc.list());
  });

  router.post('/', (req, res) => {
    if (!req.body.name) fail(400, 'name is required');
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    if (!req.body.name) fail(400, 'name is required');
    res.json(uc.update(req.params.id, req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
