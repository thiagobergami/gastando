const express = require('express');
const { makeInstallmentRepository } = require('../infra/repositories/installments');
const { makeInstallmentUseCases } = require('../application/use-cases/installments');

module.exports = (db) => {
  const router = express.Router();
  const uc = makeInstallmentUseCases({ installments: makeInstallmentRepository(db) });
  router.delete('/:id', (req, res) => {
    uc.remove(req.params.id);
    res.status(204).end();
  });
  return router;
};
