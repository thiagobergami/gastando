const express = require('express');
const { isMonth, fail } = require('../validate');
const { buildDashboard } = require('../services/dashboard');

module.exports = (db) => {
  const router = express.Router();
  router.get('/', (req, res) => {
    if (!isMonth(req.query.month)) fail(400, 'month must be YYYY-MM');
    res.json(buildDashboard(db, req.query.month));
  });
  return router;
};
