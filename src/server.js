// src/server.js
const fs = require('fs');
const path = require('path');
const { openDatabase, runMigrations } = require('./db');
const { createApp } = require('./app');
const { resolveDbPath } = require('./infra/paths');
const { openBrowser } = require('./infra/openBrowser');

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);
runMigrations(db);

const port = process.env.PORT || 3000;
createApp(db).listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`Gastando listening on :${port}`);
  openBrowser(url);
});
