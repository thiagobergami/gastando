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
buildAppFromDb(db).listen(port, () => {
  console.log(`Gastando listening on :${port}`);
  openBrowser(`http://localhost:${port}`);
});
