const express = require('express');
const { makeSettingsRepository } = require('../infra/repositories/settings');
const { makeOnboardingUseCases } = require('../application/use-cases/onboarding');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeOnboardingUseCases({ settings: makeSettingsRepository(db) });

  router.get('/', (req, res) => {
    res.json(uc.status());
  });

  router.post('/complete', (req, res) => {
    res.json(uc.complete());
  });

  router.post('/template', (req, res) => {
    res.json(uc.applyTemplate(req.body.template));
  });

  return router;
};
