import express from 'express';
import type { makeOnboardingUseCases } from '../../../application/use-cases/onboarding';

type OnboardingUseCases = ReturnType<typeof makeOnboardingUseCases>;

export function makeOnboardingController(uc: OnboardingUseCases): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => res.json(uc.status()));
  router.post('/complete', (_req, res) => res.json(uc.complete()));
  router.post('/template', (req, res) => res.json(uc.applyTemplate(req.body.template)));
  return router;
}
