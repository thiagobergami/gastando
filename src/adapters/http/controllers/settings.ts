import express from 'express';
import type { makeSettingsUseCases } from '../../../application/use-cases/settings';

type SettingsUseCases = ReturnType<typeof makeSettingsUseCases>;

export function makeSettingsController(uc: SettingsUseCases): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => res.json(uc.get()));
  router.put('/', (req, res) => res.json(uc.update(req.body)));
  return router;
}
