const express = require('express');
const { deleteInstallmentGroup } = require('../services/installments');

module.exports = (db) => {
  const router = express.Router();
  router.delete('/:id', (req, res) => {
    deleteInstallmentGroup(db, req.params.id);
    res.status(204).end();
  });
  return router;
};
