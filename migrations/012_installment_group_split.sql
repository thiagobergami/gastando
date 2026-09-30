ALTER TABLE installment_groups ADD COLUMN split_person_id INTEGER REFERENCES people(id);
ALTER TABLE installment_groups ADD COLUMN split_percent INTEGER
  CHECK (
    (split_person_id IS NULL AND split_percent IS NULL) OR
    (split_person_id IS NOT NULL AND split_percent IS NOT NULL
      AND typeof(split_percent) = 'integer' AND split_percent BETWEEN 1 AND 99)
  );
