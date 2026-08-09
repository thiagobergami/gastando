import express from 'express';
import type { makeModelUseCases } from '../../../application/use-cases/model';
import { monthQuerySchema } from '../schemas/common';
import { putMonthlyModelSchema } from '../schemas/monthlyModel';
import { parse } from '../validate';

type ModelUseCases = ReturnType<typeof makeModelUseCases>;

export function makeMonthlyModelController(uc: ModelUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.resolve(month));
  });

  router.put('/', (req, res) => {
    const { month, ...input } = parse(putMonthlyModelSchema, req.body);
    res.json(uc.set(month, input));
  });

  return router;
}
