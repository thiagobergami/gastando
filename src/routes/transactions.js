const express = require('express');
const { isDate, isMonth, isPositiveInt, fail } = require('../validate');
const { makeTransactionRepository } = require('../infra/repositories/transactions');
const { makeCategoryRepository } = require('../infra/repositories/categories');
const { makeCardRepository } = require('../infra/repositories/cards');
const { makeInstallmentRepository } = require('../infra/repositories/installments');
const { makeTransactionUseCases } = require('../application/use-cases/transactions');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeTransactionUseCases({
    transactions: makeTransactionRepository(db),
    categories: makeCategoryRepository(db),
    cards: makeCardRepository(db),
    installments: makeInstallmentRepository(db),
  });

  router.get('/', (req, res) => {
    const { month, category_id, card_id } = req.query;
    const page = {};
    if (month !== undefined) {
      if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
      page.month = month;
    }
    if (category_id !== undefined) page.categoryId = Number(category_id);
    if (card_id !== undefined) page.cardId = Number(card_id);

    page.limit = null;
    page.offset = 0;
    if (req.query.limit !== undefined) {
      page.limit = Number(req.query.limit);
      if (!Number.isInteger(page.limit) || page.limit < 1) fail(400, 'limit must be a positive integer');
    }
    if (req.query.offset !== undefined) {
      page.offset = Number(req.query.offset);
      if (!Number.isInteger(page.offset) || page.offset < 0) fail(400, 'offset must be a non-negative integer');
    }

    const { total, items } = uc.list(page);
    res.set('X-Total-Count', String(total));
    res.json(items);
  });

  router.post('/', (req, res) => {
    if (req.body.installment_count !== undefined || req.body.installment_total_cents !== undefined) {
      const { installment_total_cents, installment_count, first_month } = req.body;
      if (!isPositiveInt(installment_total_cents)) fail(400, 'installment_total_cents must be a positive integer');
      if (!isPositiveInt(installment_count)) fail(400, 'installment_count must be a positive integer');
      if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
    } else {
      if (!isDate(req.body.date)) fail(400, 'date must be YYYY-MM-DD');
      if (!isPositiveInt(req.body.amount_cents)) fail(400, 'amount_cents must be a positive integer');
    }
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    if (!isDate(req.body.date)) fail(400, 'date must be YYYY-MM-DD');
    if (!isPositiveInt(req.body.amount_cents)) fail(400, 'amount_cents must be a positive integer');
    res.json(uc.update(req.params.id, req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(req.params.id);
    res.status(204).end();
  });

  return router;
};
