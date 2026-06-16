const express = require('express');

const KEYS = ['monthly_income', 'fixed_costs', 'savings_goal'];

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const out = {};
    for (const k of KEYS) {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
      out[k] = row ? Number(row.value) : 0;
    }
    res.json(out);
  });

  router.put('/', (req, res) => {
    const set = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    db.transaction(() => {
      for (const k of KEYS) {
        if (req.body[k] !== undefined) set.run(k, String(Math.trunc(req.body[k])));
      }
    })();
    const out = {};
    for (const k of KEYS) {
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
      out[k] = row ? Number(row.value) : 0;
    }
    res.json(out);
  });

  return router;
};
