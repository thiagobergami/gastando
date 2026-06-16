const express = require('express');
const path = require('path');
const { errorHandler } = require('./errorHandler');

function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/groups', require('./routes/groups')(db));
  app.use('/api/categories', require('./routes/categories')(db));
  app.use('/api/cards', require('./routes/cards')(db));
  app.use('/api/limits', require('./routes/limits')(db));
  app.use('/api/transactions', require('./routes/transactions')(db));
  app.use('/api/installment-groups', require('./routes/installmentGroups')(db));
  app.use('/api/settings', require('./routes/settings')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
