const express = require('express');
const { isDate, isMonth, isPositiveInt, fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month, category_id, card_id } = req.query;
    const where = [];
    const args = [];
    if (month !== undefined) {
      if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
      where.push("strftime('%Y-%m', date) = ?"); args.push(month);
    }
    if (category_id !== undefined) { where.push('category_id = ?'); args.push(Number(category_id)); }
    if (card_id !== undefined) { where.push('card_id = ?'); args.push(Number(card_id)); }
    const sql = `SELECT * FROM transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date DESC, id DESC`;
    res.json(db.prepare(sql).all(...args));
  });

  router.post('/', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    const r = db.prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description)
       VALUES (?, ?, ?, ?, ?)`
    ).run(date, category_id, card_id, amount_cents, description);
    res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    const r = db.prepare(
      `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=? WHERE id=?`
    ).run(date, category_id, card_id, amount_cents, description, req.params.id);
    if (r.changes === 0) fail(404, 'transaction not found');
    res.json(db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const r = db.prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    if (r.changes === 0) fail(404, 'transaction not found');
    res.status(204).end();
  });

  return router;
};
