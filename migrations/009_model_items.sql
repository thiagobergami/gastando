-- migrations/009_model_items.sql
CREATE TABLE model_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'fixed_cost')),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_model_items_kind ON model_items(kind, sort_order);
