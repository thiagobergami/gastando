const express = require('express');

const KEY = 'onboarding_complete';

function isComplete(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(KEY);
  return row ? row.value === '1' : false;
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ complete: isComplete(db) });
  });

  router.post('/complete', (req, res) => {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(KEY, '1');
    res.json({ complete: true });
  });

  return router;
};
