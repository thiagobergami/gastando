const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM cards ORDER BY id').all());
  });

  router.post('/', (req, res) => {
    const { name } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare('INSERT INTO cards (name) VALUES (?)').run(name);
    res.status(201).json(db.prepare('SELECT * FROM cards WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, active = 1 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare('UPDATE cards SET name=?, active=? WHERE id=?')
      .run(name, active ? 1 : 0, req.params.id);
    if (r.changes === 0) fail(404, 'card not found');
    res.json(db.prepare('SELECT * FROM cards WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('UPDATE cards SET active=0 WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'card not found');
    res.status(204).end();
  });

  return router;
};
