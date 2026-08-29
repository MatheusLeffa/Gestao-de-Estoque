-- InsumoSync: Realistic Seed Data for Demo & Academic Validation
-- Author: qa-devops-agent / cloud-db-architect
-- Project: sqncxfboizrudyetetxi

-- 1. Insert Model Restaurant
INSERT INTO restaurants (id, name, address, is_active)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Bistrô Paris 6 — Unidade Jardins', 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address;

-- 2. Insert Insumos (Products) across categories
-- Note: Some items have low stock to test low-stock alert badges!
INSERT INTO products (id, name, category, unit, current_stock, min_stock_alert)
VALUES
    -- Carnes & Aves
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01', 'Filé Mignon Bovino (Peça Limpa)', 'Carnes & Aves', 'KG', 45.0, 15.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02', 'Peito de Frango Desossado', 'Carnes & Aves', 'KG', 60.0, 20.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03', 'Salmão Fresco em Filé', 'Carnes & Aves', 'KG', 4.0, 10.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04', 'Camarão Rosa GG (Limpo)', 'Carnes & Aves', 'KG', 18.0, 8.0),

    -- Hortifrúti
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05', 'Tomate Italiano Selecionado', 'Hortifrúti', 'KG', 35.0, 12.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06', 'Cebola Roxa Especial', 'Hortifrúti', 'KG', 25.0, 10.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07', 'Alface Americana Orgânica', 'Hortifrúti', 'CX', 3.0, 5.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08', 'Batata Asterix para Fritura', 'KG', 80.0, 25.0),

    -- Laticínios
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b09', 'Queijo Muçarela de Búfala', 'Laticínios', 'KG', 15.0, 6.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b10', 'Queijo Parmesão Grana Padano', 'Laticínios', 'KG', 8.0, 3.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'Manteiga Extra sem Sal', 'Laticínios', 'KG', 2.5, 5.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12', 'Creme de Leite Fresco Pasteurizado', 'Laticínios', 'L', 30.0, 10.0),

    -- Mercearia & Temperos
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13', 'Azeite de Oliva Extra Virgem 0.2%', 'Mercearia & Temperos', 'L', 24.0, 8.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b14', 'Arroz Arbóreo Italiano para Risoto', 'Mercearia & Temperos', 'KG', 50.0, 15.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15', 'Farinha de Trigo Italiana 00', 'Mercearia & Temperos', 'KG', 100.0, 30.0),

    -- Bebidas & Embalagens
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b16', 'Água Mineral San Pellegrino 500ml', 'Bebidas & Embalagens', 'CX', 12.0, 5.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b17', 'Embalagem Kraft Delivery Box G', 'Bebidas & Embalagens', 'PCT', 20.0, 10.0)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    current_stock = EXCLUDED.current_stock,
    min_stock_alert = EXCLUDED.min_stock_alert;

-- 3. Insert Initial Orders for Dashboard demonstration
INSERT INTO orders (id, restaurant_id, status, delay_reason, completion_type, notes, created_at, updated_at)
VALUES
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ABERTO', NULL, NULL, 'Reposição urgente para o almoço de domingo', now() - interval '25 minutes', now() - interval '25 minutes'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'EM_TRANSITO', NULL, NULL, 'Pedido de hortifrúti da manhã', now() - interval '2 hours', now() - interval '45 minutes'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'CONCLUIDO_TOTAL', NULL, 'TOTAL', 'Pedido recebido com sucesso', now() - interval '1 day', now() - interval '22 hours'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c04', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'CONCLUIDO_PARCIAL', 'Transporte Indisponível', 'PARCIAL', 'Faltaram 2 caixas de alface devido a atraso no furgão', now() - interval '2 days', now() - interval '40 hours')
ON CONFLICT (id) DO NOTHING;

-- Order Items for Order 1
INSERT INTO order_items (id, order_id, product_id, requested_qty, approved_qty)
VALUES
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01', 10.0, 10.0),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05', 15.0, 15.0)
ON CONFLICT DO NOTHING;

-- Order Status Logs
INSERT INTO order_status_logs (id, order_id, from_status, to_status, reason, created_at)
VALUES
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', NULL, 'ABERTO', 'Criação do pedido com reserva atômica de estoque', now() - interval '25 minutes'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', NULL, 'ABERTO', 'Criação do pedido', now() - interval '2 hours'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'ABERTO', 'EM_ANALISE', 'Separação iniciada no depósito', now() - interval '90 minutes'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'EM_ANALISE', 'EM_TRANSITO', 'Despachado com motorista Carlos', now() - interval '45 minutes')
ON CONFLICT DO NOTHING;
