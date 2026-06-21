const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM groups WHERE active=1 ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { name, color = 'neutral' } = req.body;
    if (!name) fail(400, 'name is required');
    const sort_order = req.body.sort_order ??
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM groups WHERE active=1').get().n;
    const r = db.prepare(
      'INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)'
    ).run(name, color, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM groups WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'UPDATE groups SET name=?, color=?, sort_order=? WHERE id=? AND active=1'
    ).run(name, color, sort_order, req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const active = db.prepare(
      'SELECT COUNT(*) AS n FROM categories WHERE group_id=? AND active=1').get(req.params.id).n;
    if (active > 0) fail(409, 'group has categories; remove them first');
    const r = db.prepare('UPDATE groups SET active=0 WHERE id=? AND active=1').run(req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.status(204).end();
  });

  return router;
};
