INSERT INTO groups (id, name, color, sort_order) VALUES
  (1, 'Essenciais / semi-fixos', 'sage', 1),
  (2, 'Estilo de vida', 'gold', 2),
  (3, 'Fundos', 'slate', 3),
  (4, 'Folga', 'neutral', 4);

INSERT INTO categories (id, group_id, name, examples, sort_order, active) VALUES
  (1, 1, 'Supermercado', 'Pão de Açúcar, Assaí', 1, 1),
  (2, 1, 'Transporte', 'Uber, Abastece Aí, NuTag, Metrô', 2, 1),
  (3, 1, 'Assinaturas & Serviços', 'Apple, Claude, Disney+, Seguro celular', 3, 1),
  (4, 1, 'Pet (Border Collie)', 'Lelupets, ração, veterinário', 4, 1),
  (5, 1, 'Saúde & Farmácia', 'Droga Raia, farmácia', 5, 1),
  (6, 2, 'Restaurantes & Delivery', 'iFood, Guacamole, hambúrgueres', 6, 1),
  (7, 2, 'Jogos', 'Steam, PlayStation, Oculus', 7, 1),
  (8, 2, 'Hobbies criativos', 'Show da Música, Caçula, materiais de arte', 8, 1),
  (9, 2, 'Esportes & Vestuário', 'Tennislab, Nike, Marc4', 9, 1),
  (10, 2, 'Lazer & Eventos', 'Ingressos, rolês, cinema', 10, 1),
  (11, 2, 'Compras gerais (Marketplace)', 'Mercado Livre, Amazon, Mercado Pago', 11, 1),
  (12, 3, 'Viagens', 'Avianca, Hotels.com', 12, 1),
  (13, 3, 'Casa & Manutenção', 'Ferragens, móveis, reforma', 13, 1),
  (14, 3, 'Educação & Cursos', 'PUC-Rio, cursos', 14, 1),
  (15, 4, 'Imprevistos / Folga', 'Margem de segurança', 15, 1);

INSERT INTO category_limits (category_id, month, limit_cents) VALUES
  (1, '2026-06', 85000),
  (2, '2026-06', 52000),
  (3, '2026-06', 45000),
  (4, '2026-06', 25000),
  (5, '2026-06', 18000),
  (6, '2026-06', 65000),
  (7, '2026-06', 35000),
  (8, '2026-06', 55000),
  (9, '2026-06', 35000),
  (10, '2026-06', 20000),
  (11, '2026-06', 100000),
  (12, '2026-06', 65000),
  (13, '2026-06', 30000),
  (14, '2026-06', 22000),
  (15, '2026-06', 45000);

INSERT INTO cards (name) VALUES ('Nubank'), ('Mercado Pago'), ('Itaú');

INSERT INTO settings (key, value) VALUES
  ('monthly_income', '1435000'),
  ('fixed_costs', '377000'),
  ('savings_goal', '244000');
