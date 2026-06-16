const express = require('express');
const { isMonth, fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  // Resolved limit per active category for a month (carry-forward from prior months).
  router.get('/', (req, res) => {
    const month = req.query.month;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    const cats = db.prepare('SELECT id FROM categories WHERE active=1').all();
    const pick = db.prepare(
      `SELECT limit_cents FROM category_limits
       WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1`);
    res.json(cats.map(c => {
      const row = pick.get(c.id, month);
      return { category_id: c.id, month, limit_cents: row ? row.limit_cents : 0 };
    }));
  });

  // Upsert a category's limit for a specific month.
  router.put('/', (req, res) => {
    const { category_id, month, limit_cents } = req.body;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    if (!Number.isInteger(limit_cents) || limit_cents < 0) fail(400, 'limit_cents must be a non-negative integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    db.prepare(
      `INSERT INTO category_limits (category_id, month, limit_cents) VALUES (?, ?, ?)
       ON CONFLICT(category_id, month) DO UPDATE SET limit_cents=excluded.limit_cents`
    ).run(category_id, month, limit_cents);
    res.json({ category_id, month, limit_cents });
  });

  return router;
};
