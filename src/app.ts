import path from 'node:path';
import express from 'express';
import { errorHandler } from './adapters/http/error-mapper';
import { buildContainer, type Container } from './infra/composition';
import type { Db } from './infra/db';

// Accept either a Container or a raw Db. A Container has a `db` property; a
// better-sqlite3 Db does not — that distinguishes the two without importing the
// class, and treats a bare stub object (used by the health test) as a raw db.
function asContainer(arg: Container | Db): Container {
  return 'db' in arg ? (arg as Container) : buildContainer(arg as Db);
}

export function createApp(arg: Container | Db): express.Express {
  const { controllers } = asContainer(arg);
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/groups', controllers.groups);
  app.use('/api/categories', controllers.categories);
  app.use('/api/cards', controllers.cards);
  app.use('/api/limits', controllers.limits);
  app.use('/api/transactions', controllers.transactions);
  app.use('/api/installment-groups', controllers.installmentGroups);
  app.use('/api/settings', controllers.settings);
  app.use('/api/onboarding', controllers.onboarding);
  app.use('/api/dashboard', controllers.dashboard);
  app.use('/api/bi', controllers.bi);
  app.use('/api/simulate', controllers.simulate);

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);

  return app;
}

export function buildAppFromDb(db: Db): express.Express {
  return createApp(buildContainer(db));
}
