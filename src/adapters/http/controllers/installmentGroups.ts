import express from 'express';
import type { makeInstallmentUseCases } from '../../../application/use-cases/installments';
import { MONTH_RE } from '../schemas/common';
import { updateInstallmentSchema } from '../schemas/installments';
import { parse } from '../validate';

type InstallmentUseCases = ReturnType<typeof makeInstallmentUseCases>;

export function makeInstallmentGroupsController(uc: InstallmentUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const q = req.query.month;
    const month =
      typeof q === 'string' && MONTH_RE.test(q) ? q : new Date().toISOString().slice(0, 7);
    res.json(uc.list(month));
  });

  router.put('/:id', (req, res) => {
    const body = parse(updateInstallmentSchema, req.body);
    uc.update(Number(req.params.id), { ...body, description: body.description ?? '' });
    res.status(204).end();
  });

  router.post('/:id/payoff', (req, res) => {
    const m = req.body.month;
    const month =
      typeof m === 'string' && MONTH_RE.test(m) ? m : new Date().toISOString().slice(0, 7);
    uc.payOff(Number(req.params.id), month);
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
