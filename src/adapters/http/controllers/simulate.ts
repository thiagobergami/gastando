import express from 'express';
import { MONTH_RE } from '../schemas/common';
import { AppError } from '../../../domain/errors';
import type { makeSimulateUseCases } from '../../../application/use-cases/simulate';

type SimulateUseCases = ReturnType<typeof makeSimulateUseCases>;

const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;

export function makeSimulateController(uc: SimulateUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const category_id = Number(req.query.category_id);
    const total_cents = Number(req.query.total_cents);
    const count = req.query.count === undefined ? 1 : Number(req.query.count);
    const first_month = req.query.first_month;

    if (!isPositiveInt(category_id))
      throw new AppError(400, 'category_id must be a positive integer');
    if (!MONTH_RE.test(String(first_month))) throw new AppError(400, 'first_month must be YYYY-MM');
    if (!isPositiveInt(total_cents))
      throw new AppError(400, 'total_cents must be a positive integer');
    if (!isPositiveInt(count)) throw new AppError(400, 'count must be a positive integer');

    const result = uc.simulate({
      category_id,
      total_cents,
      count,
      first_month: String(first_month),
    });
    if (!result) throw new AppError(404, 'category not found');
    res.json(result);
  });

  return router;
}
