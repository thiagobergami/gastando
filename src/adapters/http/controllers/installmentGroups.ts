import express from 'express';
import type { makeInstallmentUseCases } from '../../../application/use-cases/installments';

type InstallmentUseCases = ReturnType<typeof makeInstallmentUseCases>;

export function makeInstallmentGroupsController(uc: InstallmentUseCases): express.Router {
  const router = express.Router();
  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });
  return router;
}
