const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM groups ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)'
    ).run(name, color, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM groups WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'UPDATE groups SET name=?, color=?, sort_order=? WHERE id=?'
    ).run(name, color, sort_order, req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.status(204).end();
  });

  return router;
};
