const express = require('express');
const { makeSettingsRepository } = require('../infra/repositories/settings');
const { makeSettingsUseCases } = require('../application/use-cases/settings');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeSettingsUseCases({ settings: makeSettingsRepository(db) });

  router.get('/', (req, res) => {
    res.json(uc.get());
  });

  router.put('/', (req, res) => {
    res.json(uc.update(req.body));
  });

  return router;
};
