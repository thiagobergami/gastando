import express from 'express';
import type { makeCardUseCases } from '../../../application/use-cases/cards';
import { statementConfigSchema } from '../schemas/cards';
import { MONTH_RE, nameBodySchema } from '../schemas/common';
import { parse } from '../validate';

type CardUseCases = ReturnType<typeof makeCardUseCases>;

export function makeCardsController(uc: CardUseCases): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(uc.list()));

  router.post('/', (req, res) => {
    parse(nameBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.get('/:id/statement', (req, res) => {
    const q = req.query.month;
    const month = (typeof q === 'string' && MONTH_RE.test(q)) ? q : new Date().toISOString().slice(0, 7);
    res.json(uc.statement(Number(req.params.id), month));
  });

  router.put('/:id/statement-config', (req, res) => {
    const body = parse(statementConfigSchema, req.body);
    res.json(uc.setConfig(Number(req.params.id), { closing_day: body.closing_day ?? null, due_day: body.due_day ?? null }));
  });

  router.put('/:id', (req, res) => {
    parse(nameBodySchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
