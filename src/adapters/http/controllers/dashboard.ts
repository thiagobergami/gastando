import express from 'express';
import { parse } from '../validate';
import { monthQuerySchema } from '../schemas/common';
import type { makeDashboardUseCases } from '../../../application/use-cases/dashboard';

type DashboardUseCases = ReturnType<typeof makeDashboardUseCases>;

export function makeDashboardController(uc: DashboardUseCases): express.Router {
  const router = express.Router();
  router.get('/', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.build(month));
  });
  return router;
}
