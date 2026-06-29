CREATE TABLE recurring_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  amount_cents INTEGER NOT NULL,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN recurring_template_id INTEGER REFERENCES recurring_templates(id);
CREATE INDEX idx_tx_recurring ON transactions(recurring_template_id);
