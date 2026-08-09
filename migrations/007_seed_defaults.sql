-- v0.3 §6 — conjunto padrão brasileiro enxuto, para bancos novos.
--
-- A trava é uma tabela temporária avaliada UMA vez, antes do INSERT: se já
-- existe qualquer categoria, este arquivo não faz nada. Isso o torna seguro
-- para instalações existentes, que rodam 007 pela primeira vez com dados dentro.
--
-- Sem `examples` (os antigos eram estabelecimentos pessoais), sem limites
-- (nascem na primeira revisão mensal), sem cartões (o primeiro nasce no
-- primeiro lançamento) e sem renda/custos/meta (nascem no passo 3 do Decidir).
CREATE TEMP TABLE v03_seed_gate AS SELECT (SELECT COUNT(*) FROM categories) = 0 AS ok;

INSERT INTO categories (group_id, name, examples, sort_order, active, essential)
SELECT 0, d.column1, '', d.column2, 1, d.column3
  FROM (VALUES
         ('Mercado',                 1, 1),
         ('Transporte',              2, 1),
         ('Moradia & Contas',        3, 1),
         ('Saúde',                   4, 1),
         ('Assinaturas',             5, 1),
         ('Restaurantes & Delivery', 6, 0),
         ('Lazer',                   7, 0),
         ('Outros',                  8, 0)
       ) d,
       v03_seed_gate g
 WHERE g.ok;

DROP TABLE v03_seed_gate;
