import fs from 'fs';
import path from 'path';
import { openDatabase, runMigrations } from './infra/db';
import { buildAppFromDb } from './app';
import { resolveDbPath } from './infra/paths';
import { openBrowser } from './infra/openBrowser';

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
