import express from 'express';
import type { makeLimitUseCases } from '../../../application/use-cases/limits';
import { monthQuerySchema } from '../schemas/common';
import { carryDecisionSchema, upsertLimitSchema } from '../schemas/limits';
import { parse } from '../validate';

type LimitUseCases = ReturnType<typeof makeLimitUseCases>;

export function makeLimitsController(uc: LimitUseCases): express.Router {
  const router = express.Router();

  router.get('/suggestions', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.suggestions(month));
  });

  router.get('/', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.listForMonth(month));
  });

  router.put('/', (req, res) => {
    const { month, limit_cents } = parse(upsertLimitSchema, req.body);
    res.json(uc.upsert({ category_id: req.body.category_id, month, limit_cents }));
  });

  router.put('/carry', (req, res) => {
    const { month, carry_forward } = parse(carryDecisionSchema, req.body);
    res.json(uc.setCarryForward({ category_id: req.body.category_id, month, carry_forward }));
  });

  return router;
}
