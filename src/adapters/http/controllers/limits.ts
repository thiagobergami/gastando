import express from 'express';
import { parse } from '../validate';
import { monthQuerySchema } from '../schemas/common';
import { upsertLimitSchema } from '../schemas/limits';
import type { makeLimitUseCases } from '../../../application/use-cases/limits';

type LimitUseCases = ReturnType<typeof makeLimitUseCases>;

export function makeLimitsController(uc: LimitUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.listForMonth(month));
  });

  router.put('/', (req, res) => {
    const { month, limit_cents } = parse(upsertLimitSchema, req.body);
    res.json(uc.upsert({ category_id: req.body.category_id, month, limit_cents }));
  });

  return router;
}
