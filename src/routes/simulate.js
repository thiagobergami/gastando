const express = require('express');
const { isMonth, isPositiveInt, fail } = require('../validate');
const { makeCategoryRepository } = require('../infra/repositories/categories');
const { makeLimitRepository } = require('../infra/repositories/limits');
const { makeSimulateUseCases } = require('../application/use-cases/simulate');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeSimulateUseCases({
    categories: makeCategoryRepository(db),
    limits: makeLimitRepository(db),
  });

  router.get('/', (req, res) => {
    const category_id = Number(req.query.category_id);
    const total_cents = Number(req.query.total_cents);
    const count = req.query.count === undefined ? 1 : Number(req.query.count);
    const { first_month } = req.query;

    if (!isPositiveInt(category_id)) fail(400, 'category_id must be a positive integer');
    if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
    if (!isPositiveInt(total_cents)) fail(400, 'total_cents must be a positive integer');
    if (!isPositiveInt(count)) fail(400, 'count must be a positive integer');

    const result = uc.simulate({ category_id, total_cents, count, first_month });
    if (!result) fail(404, 'category not found');
    res.json(result);
  });

  return router;
};
