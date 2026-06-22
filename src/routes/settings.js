const express = require('express');
const { makeSettingsRepository } = require('../infra/repositories/settings');

const KEYS = ['monthly_income', 'fixed_costs', 'savings_goal'];

module.exports = (db) => {
  const router = express.Router();
  const repo = makeSettingsRepository(db);

  const readAll = () => {
    const out = {};
    for (const k of KEYS) {
      const v = repo.get(k);
      out[k] = v !== undefined ? Number(v) : 0;
    }
    return out;
  };

  router.get('/', (req, res) => {
    res.json(readAll());
  });

  router.put('/', (req, res) => {
    const entries = KEYS
      .filter(k => req.body[k] !== undefined)
      .map(k => [k, String(Math.trunc(req.body[k]))]);
    repo.setMany(entries);
    res.json(readAll());
  });

  return router;
};
