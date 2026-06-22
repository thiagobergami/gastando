const express = require('express');
const { fail } = require('../validate');
const { makeCategoryRepository } = require('../infra/repositories/categories');
const { makeGroupRepository } = require('../infra/repositories/groups');

module.exports = (db) => {
  const router = express.Router();
  const repo = makeCategoryRepository(db);
  const groups = makeGroupRepository(db);

  router.get('/', (req, res) => {
    res.json(repo.listAll());
  });

  router.post('/', (req, res) => {
    const { group_id, name, examples = '' } = req.body;
    if (!name) fail(400, 'name is required');
    if (!groups.findActiveById(group_id)) fail(400, 'group_id does not exist');
    const sort_order = req.body.sort_order ?? repo.nextSortOrder();
    res.status(201).json(repo.insert({ group_id, name, examples, sort_order }));
  });

  router.put('/:id', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0 } = req.body;
    const active = req.body.active ?? 1;
    if (!name) fail(400, 'name is required');
    if (!groups.findActiveById(group_id)) fail(400, 'group_id does not exist');
    const changes = repo.update(req.params.id, { group_id, name, examples, sort_order, active: active ? 1 : 0 });
    if (changes === 0) fail(404, 'category not found');
    res.json(repo.findById(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    if (repo.deactivate(req.params.id) === 0) fail(404, 'category not found');
    res.status(204).end();
  });

  return router;
};
