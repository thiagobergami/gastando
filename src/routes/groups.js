const express = require('express');
const { fail } = require('../validate');
const { makeGroupRepository } = require('../infra/repositories/groups');

module.exports = (db) => {
  const router = express.Router();
  const repo = makeGroupRepository(db);

  router.get('/', (req, res) => {
    res.json(repo.listActive());
  });

  router.post('/', (req, res) => {
    const { name, color = 'neutral' } = req.body;
    if (!name) fail(400, 'name is required');
    const sort_order = req.body.sort_order ?? repo.nextSortOrder();
    res.status(201).json(repo.insert({ name, color, sort_order }));
  });

  router.put('/:id', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    if (repo.update(req.params.id, { name, color, sort_order }) === 0) fail(404, 'group not found');
    res.json(repo.findById(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    if (repo.countActiveCategories(req.params.id) > 0) fail(409, 'group has categories; remove them first');
    if (repo.deactivate(req.params.id) === 0) fail(404, 'group not found');
    res.status(204).end();
  });

  return router;
};
