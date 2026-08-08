-- v0.3 §10 — grupos colapsam no atributo `essential` da categoria.
-- Aditiva: a tabela `groups` permanece intacta, só deixa de ser usada.
ALTER TABLE categories ADD COLUMN essential INTEGER NOT NULL DEFAULT 0;

-- Backfill pelo nome do grupo semeado. Limitação conhecida (spec §10): quem
-- renomeou o grupo fica com essential = 0 e corrige em Configurações.
UPDATE categories
   SET essential = 1
 WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'Essenciais%');

-- categories.group_id continua NOT NULL REFERENCES groups(id). Este sentinela
-- é o alvo de toda categoria criada a partir de agora; active = 0 garante que
-- ele nunca apareceria mesmo que algo ainda listasse grupos.
INSERT INTO groups (id, name, color, sort_order, active)
SELECT 0, 'Sem grupo', 'neutral', 0, 0
 WHERE NOT EXISTS (SELECT 1 FROM groups WHERE id = 0);
