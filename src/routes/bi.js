const express = require('express');
const { isMonth, fail } = require('../validate');
const { makeReportRepository } = require('../infra/repositories/reports');
const { makeLimitRepository } = require('../infra/repositories/limits');
const { makeCategoryRepository } = require('../infra/repositories/categories');
const { makeCardRepository } = require('../infra/repositories/cards');
const { makeGroupRepository } = require('../infra/repositories/groups');
const { makeBiUseCases } = require('../application/use-cases/bi');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeBiUseCases({
    reports: makeReportRepository(db),
    limits: makeLimitRepository(db),
    categories: makeCategoryRepository(db),
    cards: makeCardRepository(db),
    groups: makeGroupRepository(db),
  });

  function range(req) {
    const { from, to } = req.query;
    if (!isMonth(from) || !isMonth(to)) fail(400, 'from/to must be YYYY-MM');
    if (from > to) fail(400, 'from must be <= to');
    return { from, to };
  }

  router.get('/trends', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.trends(from, to));
  });
  router.get('/by-card', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.byCard(from, to));
  });
  router.get('/by-group', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.byGroup(from, to));
  });
  router.get('/budget-vs-actual', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.budgetVsActual(from, to));
  });
  router.get('/installment-forecast', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.installmentForecast(from, to));
  });

  return router;
};
