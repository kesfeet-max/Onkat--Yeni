-- ============================================================
-- ONKATI TAM MİGRASYON (TEK DOSYA - BUNU ÇALIŞTIRIN)
-- Çakışma-güvenli: Her politika önce DROP edilir, sonra CREATE edilir
-- Supabase Dashboard > SQL Editor'de çalıştırın
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABLO: store_customer_balances (İzole Cüzdan)
-- ============================================================
CREATE TABLE IF NOT EXISTS store_customer_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_scb_customer ON store_customer_balances(customer_id);
CREATE INDEX IF NOT EXISTS idx_scb_merchant ON store_customer_balances(merchant_id);
CREATE INDEX IF NOT EXISTS idx_scb_customer_merchant ON store_customer_balances(customer_id, merchant_id);

-- ============================================================
-- 2. RLS: customers tablosu
-- ============================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchants_limited_customer_view" ON customers;
DROP POLICY IF EXISTS "customers_view_own" ON customers;
DROP POLICY IF EXISTS "customers_select_own" ON customers;
DROP POLICY IF EXISTS "Enable read access for all users" ON customers;
DROP POLICY IF EXISTS "allow_read_all" ON customers;
DROP POLICY IF EXISTS "customer_read_own_record" ON customers;
DROP POLICY IF EXISTS "merchant_read_related_customers" ON customers;
DROP POLICY IF EXISTS "public_read_customers" ON customers;
DROP POLICY IF EXISTS "Users can view own customer profile" ON customers;
DROP POLICY IF EXISTS "Customers can view own profile" ON customers;
DROP POLICY IF EXISTS "customers_insert_own" ON customers;
DROP POLICY IF EXISTS "customers_update_own" ON customers;

CREATE POLICY "customer_read_own_record" ON customers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "merchant_read_related_customers" ON customers
  FOR SELECT USING (
    id IN (
      SELECT scb.customer_id FROM store_customer_balances scb
      JOIN merchants m ON m.id = scb.merchant_id
      WHERE m.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. RLS: merchants tablosu
-- ============================================================
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_read_own" ON merchants;
DROP POLICY IF EXISTS "merchants_select_own" ON merchants;
DROP POLICY IF EXISTS "Enable read access for all users" ON merchants;
DROP POLICY IF EXISTS "allow_read_all" ON merchants;
DROP POLICY IF EXISTS "merchant_read_own_record" ON merchants;
DROP POLICY IF EXISTS "customer_read_related_merchants" ON merchants;
DROP POLICY IF EXISTS "public_read_merchant_info" ON merchants;
DROP POLICY IF EXISTS "Users can view own merchant profile" ON merchants;
DROP POLICY IF EXISTS "Merchants can view own profile" ON merchants;
DROP POLICY IF EXISTS "Anyone can view merchants" ON merchants;
DROP POLICY IF EXISTS "merchants_insert_own" ON merchants;
DROP POLICY IF EXISTS "merchants_update_own" ON merchants;

CREATE POLICY "public_read_merchant_info" ON merchants
  FOR SELECT USING (true);

-- ============================================================
-- 4. RLS: store_customer_balances tablosu
-- ============================================================
ALTER TABLE store_customer_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_view_own_balances" ON store_customer_balances;
DROP POLICY IF EXISTS "merchants_view_store_balances" ON store_customer_balances;
DROP POLICY IF EXISTS "service_role_full_access" ON store_customer_balances;

CREATE POLICY "customers_view_own_balances" ON store_customer_balances
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "merchants_view_store_balances" ON store_customer_balances
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

CREATE POLICY "service_role_full_access" ON store_customer_balances
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. RPC: islem_puan_yukle
-- ============================================================
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION islem_puan_yukle(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT DEFAULT 'cash',
  p_cash_rate NUMERIC DEFAULT 7,
  p_card_rate NUMERIC DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_customer RECORD;
  v_rate NUMERIC;
  v_points NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT id, store_id, store_name, is_active
  INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
  END IF;

  SELECT id, full_name, is_active
  INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tutar sifirdan buyuk olmali');
  END IF;

  IF p_payment_type = 'card' THEN
    v_rate := p_card_rate;
  ELSE
    v_rate := p_cash_rate;
  END IF;

  v_points := ROUND(p_amount * v_rate / 100, 2);

  INSERT INTO store_customer_balances (customer_id, merchant_id, balance, total_earned, last_transaction_at)
  VALUES (p_customer_id, v_merchant.id, v_points, v_points, NOW())
  ON CONFLICT (customer_id, merchant_id)
  DO UPDATE SET
    balance = store_customer_balances.balance + v_points,
    total_earned = store_customer_balances.total_earned + v_points,
    last_transaction_at = NOW(),
    updated_at = NOW();

  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  INSERT INTO transactions (
    idempotency_key, customer_id, merchant_id, type, amount, points, status, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'earn', p_amount, v_points, 'completed', NOW()
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'amount', p_amount,
    'points', v_points,
    'payment_type', p_payment_type,
    'new_balance', v_new_balance,
    'message', format('%s TL alisveristen %s puan yuklendi', p_amount::text, v_points::text)
  );
END;
$$;

-- ============================================================
-- 6. RPC: islem_puan_harca
-- ============================================================
DROP FUNCTION IF EXISTS islem_puan_harca(UUID, NUMERIC);

CREATE OR REPLACE FUNCTION islem_puan_harca(
  p_customer_id UUID,
  p_points_to_spend NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_customer RECORD;
  v_balance RECORD;
  v_new_balance NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT id, store_id, store_name, is_active
  INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
  END IF;

  SELECT id, full_name, is_active
  INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;

  IF p_points_to_spend <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Harcama tutari sifirdan buyuk olmali');
  END IF;

  SELECT balance, total_spent
  INTO v_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  IF v_balance IS NULL OR v_balance.balance < p_points_to_spend THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bu magazada yeterli puan bulunmuyor',
      'current_balance', COALESCE(v_balance.balance, 0),
      'requested', p_points_to_spend
    );
  END IF;

  UPDATE store_customer_balances
  SET
    balance = balance - p_points_to_spend,
    total_spent = total_spent + p_points_to_spend,
    last_transaction_at = NOW(),
    updated_at = NOW()
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  INSERT INTO transactions (
    idempotency_key, customer_id, merchant_id, type, amount, points, status, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'spend', p_points_to_spend, p_points_to_spend, 'completed', NOW()
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'points_spent', p_points_to_spend,
    'new_balance', v_new_balance,
    'message', format('%s puan harcandi. Kalan bakiye: %s', p_points_to_spend::text, v_new_balance::text)
  );
END;
$$;

-- ============================================================
-- 7. RPC: musteri_bilgi_getir
-- ============================================================
DROP FUNCTION IF EXISTS musteri_bilgi_getir(UUID);

CREATE OR REPLACE FUNCTION musteri_bilgi_getir(
  p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_customer RECORD;
  v_balance NUMERIC;
BEGIN
  SELECT id, store_name
  INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  SELECT id, full_name, is_active
  INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer.id,
    'customer_name', v_customer.full_name,
    'store_balance', v_balance,
    'store_name', v_merchant.store_name
  );
END;
$$;

-- ============================================================
-- 8. RPC: get_email_by_phone (telefon ile giriş)
-- ============================================================
DROP FUNCTION IF EXISTS get_email_by_phone(TEXT);

CREATE OR REPLACE FUNCTION get_email_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM customers
  WHERE phone = p_phone
  LIMIT 1;

  IF v_email IS NULL THEN
    SELECT email INTO v_email
    FROM merchants
    WHERE phone = p_phone
    LIMIT 1;
  END IF;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kullanici bulunamadi');
  END IF;

  RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$$;

-- ============================================================
-- 9. GRANT İZİNLERİ
-- ============================================================
GRANT EXECUTE ON FUNCTION islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION islem_puan_harca(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION musteri_bilgi_getir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_email_by_phone(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_email_by_phone(TEXT) TO authenticated;

GRANT SELECT ON store_customer_balances TO authenticated;
GRANT INSERT, UPDATE ON store_customer_balances TO service_role;

COMMIT;