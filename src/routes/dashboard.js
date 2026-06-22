const express = require('express');
const { isMonth, fail } = require('../validate');
const { makeReportRepository } = require('../infra/repositories/reports');
const { makeLimitRepository } = require('../infra/repositories/limits');
const { makeSettingsRepository } = require('../infra/repositories/settings');
const { makeDashboardUseCases } = require('../application/use-cases/dashboard');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeDashboardUseCases({
    reports: makeReportRepository(db),
    limits: makeLimitRepository(db),
    settings: makeSettingsRepository(db),
  });
  router.get('/', (req, res) => {
    if (!isMonth(req.query.month)) fail(400, 'month must be YYYY-MM');
    res.json(uc.build(req.query.month));
  });
  return router;
};
