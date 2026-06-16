const express = require('express');
const { isMonth, fail } = require('../validate');
const { trends } = require('../services/bi');

module.exports = (db) => {
  const router = express.Router();
  router.get('/trends', (req, res) => {
    const { from, to } = req.query;
    if (!isMonth(from) || !isMonth(to)) fail(400, 'from/to must be YYYY-MM');
    if (from > to) fail(400, 'from must be <= to');
    res.json(trends(db, from, to));
  });
  return router;
};
