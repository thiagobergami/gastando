// Migration shim: atomic persistence now lives in the InstallmentRepository;
// pure splitCents lives in src/domain/services/installments.ts. These wrappers
// keep the existing route imports working until Phase 4/5 wire repos directly.
const { splitCents } = require('../domain/services/installments');
const { makeInstallmentRepository } = require('../infra/repositories/installments');

function createInstallmentPurchase(db, p) {
  return makeInstallmentRepository(db).createPurchase(p);
}

function deleteInstallmentGroup(db, id) {
  makeInstallmentRepository(db).remove(id);
}

module.exports = { splitCents, createInstallmentPurchase, deleteInstallmentGroup };
