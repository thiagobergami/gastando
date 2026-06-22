const express = require('express');
const { fail } = require('../validate');
const { makeSettingsRepository } = require('../infra/repositories/settings');

const KEY = 'onboarding_complete';

module.exports = (db) => {
  const router = express.Router();
  const repo = makeSettingsRepository(db);

  const isComplete = () => repo.get(KEY) === '1';

  router.get('/', (req, res) => {
    res.json({ complete: isComplete() });
  });

  router.post('/complete', (req, res) => {
    repo.set(KEY, '1');
    res.json({ complete: true });
  });

  router.post('/template', (req, res) => {
    if (isComplete()) fail(409, 'onboarding already complete');
    const { template } = req.body;
    if (template !== 'suggested' && template !== 'blank') fail(400, 'invalid template');
    if (repo.countTransactions() > 0 || repo.countInstallmentGroups() > 0) fail(409, 'cannot reset after data exists');
    if (template === 'blank') repo.wipeCategoryData();
    res.json({ template });
  });

  return router;
};
