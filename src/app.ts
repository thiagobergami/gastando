import express from 'express';
import path from 'path';
import { buildContainer, Container } from './infra/composition';
import type { Db } from './infra/db';

// Existing JS route factories still work via require during the migration;
// they are replaced by typed controllers in Phase 5.
const groups = require('./routes/groups');
const categories = require('./routes/categories');
const cards = require('./routes/cards');
const limits = require('./routes/limits');
const transactions = require('./routes/transactions');
const installmentGroups = require('./routes/installmentGroups');
const settings = require('./routes/settings');
const onboarding = require('./routes/onboarding');
const dashboard = require('./routes/dashboard');
const bi = require('./routes/bi');
const simulate = require('./routes/simulate');
const { errorHandler } = require('./adapters/http/error-mapper');

// Accept either a Container or a raw Db. A Container has a `db` property; a
// better-sqlite3 Db does not — that distinguishes the two without importing the
// class, and treats a bare stub object (used by the health test) as a raw db.
function asContainer(arg: Container | Db): Container {
  return 'db' in arg ? (arg as Container) : buildContainer(arg as Db);
}

export function createApp(arg: Container | Db): express.Express {
  const container = asContainer(arg);
  const db = container.db;
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/groups', groups(db));
  app.use('/api/categories', categories(db));
  app.use('/api/cards', cards(db));
  app.use('/api/limits', limits(db));
  app.use('/api/transactions', transactions(db));
  app.use('/api/installment-groups', installmentGroups(db));
  app.use('/api/settings', settings(db));
  app.use('/api/onboarding', onboarding(db));
  app.use('/api/dashboard', dashboard(db));
  app.use('/api/bi', bi(db));
  app.use('/api/simulate', simulate(db));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);

  return app;
}

export function buildAppFromDb(db: Db): express.Express {
  return createApp(buildContainer(db));
}
