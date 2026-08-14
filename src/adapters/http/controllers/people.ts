import express from 'express';
import type { makePersonUseCases } from '../../../application/use-cases/people';
import { nameBodySchema } from '../schemas/common';
import { parse } from '../validate';

type PersonUseCases = ReturnType<typeof makePersonUseCases>;

export function makePeopleController(uc: PersonUseCases): express.Router {
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

  return router;
}
