const express = require('express');
const { isDate, isMonth, isPositiveInt, fail } = require('../validate');
const { createInstallmentPurchase } = require('../services/installments');
const { makeTransactionRepository } = require('../infra/repositories/transactions');

module.exports = (db) => {
  const router = express.Router();
  const repo = makeTransactionRepository(db);

  router.get('/', (req, res) => {
    const { month, category_id, card_id } = req.query;
    const filter = {};
    if (month !== undefined) {
      if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
      filter.month = month;
    }
    if (category_id !== undefined) filter.categoryId = Number(category_id);
    if (card_id !== undefined) filter.cardId = Number(card_id);

    let limit = null, offset = 0;
    if (req.query.limit !== undefined) {
      limit = Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1) fail(400, 'limit must be a positive integer');
    }
    if (req.query.offset !== undefined) {
      offset = Number(req.query.offset);
      if (!Number.isInteger(offset) || offset < 0) fail(400, 'offset must be a non-negative integer');
    }

    res.set('X-Total-Count', String(repo.count(filter)));
    res.json(repo.list({ ...filter, limit, offset }));
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
      const first = repo.firstByGroup(groupId);
      return res.status(201).json({ ...first, installment_group_id: groupId });
    }

    // Single-shot transaction path.
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    res.status(201).json(repo.insert({ date, category_id, card_id, amount_cents, description }));
  });

  router.put('/:id', (req, res) => {
    const { date, category_id, card_id, amount_cents, description = '' } = req.body;
    if (!isDate(date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(amount_cents)) fail(400, 'amount_cents must be a positive integer');
    if (!db.prepare('SELECT id FROM categories WHERE id=?').get(category_id)) fail(400, 'category_id does not exist');
    if (!db.prepare('SELECT id FROM cards WHERE id=?').get(card_id)) fail(400, 'card_id does not exist');
    const changes = repo.update(req.params.id, { date, category_id, card_id, amount_cents, description });
    if (changes === 0) fail(404, 'transaction not found');
    res.json(repo.findById(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    if (repo.remove(req.params.id) === 0) fail(404, 'transaction not found');
    res.status(204).end();
  });

  return router;
};
