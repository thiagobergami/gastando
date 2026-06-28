import type { Request } from 'express';
import express from 'express';
import type { makeBiUseCases } from '../../../application/use-cases/bi';
import { biCategoryRangeSchema, biRangeSchema } from '../schemas/bi';
import { parse } from '../validate';

type BiUseCases = ReturnType<typeof makeBiUseCases>;

export function makeBiController(uc: BiUseCases): express.Router {
  const router = express.Router();

  const range = (req: Request) => parse(biRangeSchema, req.query);

  router.get('/trends', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.trends(from, to));
  });
  router.get('/by-card', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.byCard(from, to));
  });
  router.get('/by-group', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.byGroup(from, to));
  });
  router.get('/budget-vs-actual', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.budgetVsActual(from, to));
  });
  router.get('/installment-forecast', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.installmentForecast(from, to));
  });

  router.get('/category-trend', (req, res) => {
    const { category_id, from, to } = parse(biCategoryRangeSchema, req.query);
    res.json(uc.categoryTrend(category_id, from, to));
  });

  return router;
}
