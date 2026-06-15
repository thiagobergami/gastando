const path = require('path');
const { openDatabase, runMigrations } = require('./db');
const { createApp } = require('./app');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'gastando.db');
const db = openDatabase(dbPath);
runMigrations(db);

const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`Gastando listening on :${port}`));
