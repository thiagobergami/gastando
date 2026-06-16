const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const group = db.prepare('SELECT id FROM groups WHERE id=?').get(group_id);
    if (!group) fail(400, 'group_id does not exist');
    const r = db.prepare(
      'INSERT INTO categories (group_id, name, examples, sort_order) VALUES (?, ?, ?, ?)'
    ).run(group_id, name, examples, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0 } = req.body;
    const active = req.body.active ?? 1;
    if (!name) fail(400, 'name is required');
    if (!db.prepare('SELECT id FROM groups WHERE id=?').get(group_id)) fail(400, 'group_id does not exist');
    const r = db.prepare(
      'UPDATE categories SET group_id=?, name=?, examples=?, sort_order=?, active=? WHERE id=?'
    ).run(group_id, name, examples, sort_order, active ? 1 : 0, req.params.id);
    if (r.changes === 0) fail(404, 'category not found');
    res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE categories SET active=0 WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'category not found');
    res.status(204).end();
  });

  return router;
};
