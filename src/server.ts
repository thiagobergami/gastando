import fs from 'node:fs';
import path from 'node:path';
import { buildAppFromDb } from './app';
import { openDatabase, runMigrations } from './infra/db';
import { openBrowser } from './infra/openBrowser';
import { resolveDbPath } from './infra/paths';

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);
runMigrations(db);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
buildAppFromDb(db).listen(port, host, () => {
  console.log(`Gastando listening on http://${host}:${port}`);
  openBrowser(`http://localhost:${port}`);
});
