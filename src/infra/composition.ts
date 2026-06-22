import type { Db } from './db';

export interface Container {
  db: Db;
  // repositories, use-cases, and controllers are added in later phases
}

export function buildContainer(db: Db): Container {
  return { db };
}
