const express = require('express');
const { fail } = require('../validate');

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

  router.post('/template', (req, res) => {
    if (isComplete(db)) fail(409, 'onboarding already complete');
    const { template } = req.body;
    if (template !== 'suggested' && template !== 'blank') fail(400, 'invalid template');
    const txCount = db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
    const igCount = db.prepare('SELECT COUNT(*) AS n FROM installment_groups').get().n;
    if (txCount > 0 || igCount > 0) fail(409, 'cannot reset after data exists');
    if (template === 'blank') {
      db.transaction(() => {
        db.prepare('DELETE FROM category_limits').run();
        db.prepare('DELETE FROM categories').run();
        db.prepare('DELETE FROM groups').run();
      })();
    }
    res.json({ template });
  });

  return router;
};
