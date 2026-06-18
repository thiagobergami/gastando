const express = require('express');
const { isDate, isMonth, isPositiveInt, fail } = require('../validate');
const { createInstallmentPurchase } = require('../services/installments');

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

    let limit = null, offset = 0;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1) fail(400, 'limit must be a positive integer');
    }
    if (req.query.offset !== undefined) {
      offset = Number(req.query.offset);
      if (!Number.isInteger(offset) || offset < 0) fail(400, 'offset must be a non-negative integer');
    }

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM transactions ${clause}`).get(...args).n;
    res.set('X-Total-Count', String(total));

    let sql = `SELECT * FROM transactions ${clause} ORDER BY date DESC, id DESC`;
    if (limit !== null) { sql += ' LIMIT ? OFFSET ?'; args.push(limit, offset); }
    res.json(db.prepare(sql).all(...args));
  });

  router.post('/', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;

    // Installment purchase path.
    if (req.body.installment_count !== undefined || req.body.installment_total_cents !== undefined) {
      const { installment_total_cents, installment_count, first_month } = req.body;
      if (!isPositiveInt(installment_total_cents)) fail(400, 'installment_total_cents must be a positive integer');
      if (!isPositiveInt(installment_count)) fail(400, 'installment_count must be a positive integer');
      if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
      if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
      if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
      const groupId = createInstallmentPurchase(db, {
        category_id, card_id, description,
        total_cents: installment_total_cents, count: installment_count, first_month,
      });
      const first = db.prepare(
        'SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1').get(groupId);
      return res.status(201).json({ ...first, installment_group_id: groupId });
    }

    // Single-shot transaction path.
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
