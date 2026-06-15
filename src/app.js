const express = require('express');
const path = require('path');
const { errorHandler } = require('./errorHandler');

function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Routes mounted in later tasks:
  // app.use('/api/groups', require('./routes/groups')(db));
  // ...

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
