import express from 'express';
import type { makeCardUseCases } from '../../../application/use-cases/cards';
import { nameBodySchema } from '../schemas/common';
import { parse } from '../validate';

type CardUseCases = ReturnType<typeof makeCardUseCases>;

export function makeCardsController(uc: CardUseCases): express.Router {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(uc.list()));

  router.post('/', (req, res) => {
    parse(nameBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
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
