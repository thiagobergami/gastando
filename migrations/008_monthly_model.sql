-- v0.3 §9 passo 3 — o modelo de poupança passa a ter história.
-- `settings` continua sendo o modelo CORRENTE: é ele que alimenta o herói do
-- Acompanhar e o sinal `configured` do §6. Esta tabela é o histórico, escrito
-- na revisão mensal. Nada na Fatia 1 muda.
CREATE TABLE monthly_model (
  month              TEXT PRIMARY KEY,
  income_cents       INTEGER NOT NULL,
  fixed_costs_cents  INTEGER NOT NULL,
  savings_goal_cents INTEGER NOT NULL
);

-- Quem já configurou o modelo ganha UMA linha, ancorada no primeiro mês que ele
-- já registrou — não no mês corrente.
--
-- A diferença não é cosmética. Ancorada no mês corrente, todo mês ANTERIOR ao
-- upgrade continuaria caindo no degrau `settings` da cadeia de resolução, e
-- mudar a renda hoje seguiria reescrevendo o histórico inteiro — exatamente o
-- bug do §A.2 que esta fatia existe para matar. Ancorada no primeiro mês, o
-- passado inteiro resolve por `carry` a partir desta linha e congela no
-- instante do upgrade.
--
-- A linha afirma "você ganhava isto em janeiro", o que é um palpite. Mas o
-- fallback afirmava exatamente o mesmo palpite — só que mutável. Congelado é
-- mais honesto do que mutável, e `source: 'carry'` deixa a herança visível.
--
-- O `MIN` externo protege contra lançamento com data futura: a âncora nunca é
-- posterior ao mês corrente, senão o passado voltaria a cair no fallback.
-- Quem nunca configurou renda não ganha linha nenhuma.
INSERT INTO monthly_model (month, income_cents, fixed_costs_cents, savings_goal_cents)
SELECT MIN(COALESCE((SELECT MIN(strftime('%Y-%m', date)) FROM transactions),
                    strftime('%Y-%m', 'now')),
           strftime('%Y-%m', 'now')),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'monthly_income'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'fixed_costs'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'savings_goal'), 0)
 WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'monthly_income');
