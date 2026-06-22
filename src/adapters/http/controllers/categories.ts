import express from 'express';
import { parse } from '../validate';
import { nameBodySchema } from '../schemas/common';
import type { makeCategoryUseCases } from '../../../application/use-cases/categories';

type CategoryUseCases = ReturnType<typeof makeCategoryUseCases>;

export function makeCategoriesController(uc: CategoryUseCases): express.Router {
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
