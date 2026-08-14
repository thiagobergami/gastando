CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN split_person_id INTEGER REFERENCES people(id);
ALTER TABLE transactions ADD COLUMN split_percent INTEGER;      -- 1–99, inteiro
ALTER TABLE transactions ADD COLUMN split_received INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_tx_split_person ON transactions(split_person_id);
