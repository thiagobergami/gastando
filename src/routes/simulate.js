const express = require('express');
const { isMonth, isPositiveInt, fail } = require('../validate');
const { simulatePurchase } = require('../services/simulate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const category_id = Number(req.query.category_id);
    const total_cents = Number(req.query.total_cents);
    const count = req.query.count === undefined ? 1 : Number(req.query.count);
    const { first_month } = req.query;

    if (!isMonth(first_month)) fail(400, 'first_month must be YYYY-MM');
    if (!isPositiveInt(total_cents)) fail(400, 'total_cents must be a positive integer');
    if (!isPositiveInt(count)) fail(400, 'count must be a positive integer');

    const result = simulatePurchase(db, { category_id, total_cents, count, first_month });
    if (!result) fail(404, 'category not found');
    res.json(result);
  });

  return router;
};
