-- InsumoSync: Database Initialization Schema
-- Author: cloud-db-architect
-- Project: sqncxfboizrudyetetxi

-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Table: restaurants
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Table: products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock_alert NUMERIC NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table: orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ABERTO',
    delay_reason TEXT,
    completion_type TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Table: order_items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    requested_qty NUMERIC NOT NULL CHECK (requested_qty > 0),
    approved_qty NUMERIC,
    delivered_qty NUMERIC
);

-- 5. Table: order_status_logs (Audit Trail)
CREATE TABLE IF NOT EXISTS order_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Table: stock_movements (Stock Audit Trail)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'ENTRADA_MANUAL', 'SAIDA_PEDIDO', 'ESTORNO_CANCELAMENTO'
    quantity NUMERIC NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order_id ON order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies for MVP Demo & Academic Switcher
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public read access to restaurants" ON restaurants;
    CREATE POLICY "Allow public read access to restaurants" ON restaurants FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Allow public read access to products" ON products;
    CREATE POLICY "Allow public read access to products" ON products FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Allow public manage products" ON products;
    CREATE POLICY "Allow public manage products" ON products FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage orders" ON orders;
    CREATE POLICY "Allow public manage orders" ON orders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage order_items" ON order_items;
    CREATE POLICY "Allow public manage order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage order_status_logs" ON order_status_logs;
    CREATE POLICY "Allow public manage order_status_logs" ON order_status_logs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage stock_movements" ON stock_movements;
    CREATE POLICY "Allow public manage stock_movements" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
END $$;

-- Enable Realtime for orders, products and order_status_logs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE products;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'order_status_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_status_logs;
    END IF;
END $$;
