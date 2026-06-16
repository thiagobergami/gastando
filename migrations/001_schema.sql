CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'neutral',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  name TEXT NOT NULL,
  examples TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE category_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  limit_cents INTEGER NOT NULL,
  UNIQUE (category_id, month)
);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE installment_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL DEFAULT '',
  total_cents INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  first_month TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  installment_group_id INTEGER REFERENCES installment_groups(id),
  installment_no INTEGER,
  installment_total INTEGER
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_tx_category ON transactions(category_id);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_group ON transactions(installment_group_id);
