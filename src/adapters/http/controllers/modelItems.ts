import express from 'express';
import type { makeModelItemUseCases } from '../../../application/use-cases/modelItems';
import {
  createModelItemSchema,
  listModelItemsQuerySchema,
  updateModelItemSchema,
} from '../schemas/modelItems';
import { parse } from '../validate';

type ModelItemUseCases = ReturnType<typeof makeModelItemUseCases>;

export function makeModelItemsController(uc: ModelItemUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { kind } = parse(listModelItemsQuerySchema, req.query);
    res.json(uc.list(kind));
  });

  router.post('/', (req, res) => {
    const input = parse(createModelItemSchema, req.body);
    res.status(201).json(uc.create(input));
  });

  // Sem corpo de resposta: o port não expõe um `findById` (design é
  // deliberadamente minimalista aqui), então o controller não tem como devolver
  // o registro atualizado sem uma segunda consulta que o design não pede. O
  // frontend nunca lê o corpo do PUT — ele já tem o que mandou.
  router.put('/:id', (req, res) => {
    const input = parse(updateModelItemSchema, req.body);
    uc.update(Number(req.params.id), input);
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    uc.remove(Number(req.params.id));
    res.status(204).end();
  });

  return router;
}
