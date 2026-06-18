const express = require('express');
const { isMonth, fail } = require('../validate');
const { trends, byCard, byGroup, budgetVsActual, installmentForecast } = require('../services/bi');

module.exports = (db) => {
  const router = express.Router();

  function range(req) {
    const { from, to } = req.query;
    if (!isMonth(from) || !isMonth(to)) fail(400, 'from/to must be YYYY-MM');
    if (from > to) fail(400, 'from must be <= to');
    return { from, to };
  }

  router.get('/trends', (req, res) => {
    const { from, to } = range(req);
    res.json(trends(db, from, to));
  });
  router.get('/by-card', (req, res) => {
    const { from, to } = range(req);
    res.json(byCard(db, from, to));
  });
  router.get('/by-group', (req, res) => {
    const { from, to } = range(req);
    res.json(byGroup(db, from, to));
  });
  router.get('/budget-vs-actual', (req, res) => {
    const { from, to } = range(req);
    res.json(budgetVsActual(db, from, to));
  });
  router.get('/installment-forecast', (req, res) => {
    const { from, to } = range(req);
    res.json(installmentForecast(db, from, to));
  });

  return router;
};
