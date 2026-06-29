import express from 'express';
import type { makeRecurringUseCases } from '../../../application/use-cases/recurring';
import { materializeSchema, recurringBodySchema } from '../schemas/recurring';
import { parse } from '../validate';

type RecurringUseCases = ReturnType<typeof makeRecurringUseCases>;

export function makeRecurringController(uc: RecurringUseCases): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(uc.list()));

  router.post('/materialize', (req, res) => {
    const { month } = parse(materializeSchema, req.body);
    res.json(uc.materialize(month));
  });

  router.post('/', (req, res) => {
    parse(recurringBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    parse(recurringBodySchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
