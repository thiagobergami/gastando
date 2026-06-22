const express = require('express');
const { isMonth, fail } = require('../validate');
const { makeLimitRepository } = require('../infra/repositories/limits');
const { makeCategoryRepository } = require('../infra/repositories/categories');
const { makeLimitUseCases } = require('../application/use-cases/limits');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeLimitUseCases({
    limits: makeLimitRepository(db),
    categories: makeCategoryRepository(db),
  });

  // Resolved limit per active category for a month (carry-forward from prior months).
  router.get('/', (req, res) => {
    const month = req.query.month;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    res.json(uc.listForMonth(month));
  });

  // Upsert a category's limit for a specific month.
  router.put('/', (req, res) => {
    const { category_id, month, limit_cents } = req.body;
    if (!isMonth(month)) fail(400, 'month must be YYYY-MM');
    if (!Number.isInteger(limit_cents) || limit_cents < 0) fail(400, 'limit_cents must be a non-negative integer');
    res.json(uc.upsert({ category_id, month, limit_cents }));
  });

  return router;
};
