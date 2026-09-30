CREATE TABLE category_carry_decisions (
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  carry_forward INTEGER NOT NULL CHECK (carry_forward IN (0, 1)),
  PRIMARY KEY (category_id, month)
);
