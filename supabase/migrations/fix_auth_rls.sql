-- ============================================================
-- AUTH & RLS DÜZELTME (Çakışma-güvenli: DROP IF EXISTS + CREATE)
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın
-- ============================================================

BEGIN;

-- ============================================================
-- 1. customers tablosundaki TÜM eski RLS politikalarını temizle
-- ============================================================
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

-- RLS'nin aktif olduğundan emin ol
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Yeni politikalar
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
-- 2. merchants tablosundaki TÜM eski RLS politikalarını temizle
-- ============================================================
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

-- RLS'nin aktif olduğundan emin ol
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

-- Yeni politikalar
CREATE POLICY "merchant_read_own_record" ON merchants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "customer_read_related_merchants" ON merchants
  FOR SELECT USING (
    id IN (
      SELECT scb.merchant_id FROM store_customer_balances scb
      JOIN customers c ON c.id = scb.customer_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Herkes mağaza bilgisini görebilir (StorePage, QR okuma vs.)
CREATE POLICY "public_read_merchant_info" ON merchants
  FOR SELECT USING (true);

-- ============================================================
-- 3. store_customer_balances RLS politikalarını temizle ve yeniden oluştur
-- ============================================================
DROP POLICY IF EXISTS "customers_view_own_balances" ON store_customer_balances;
DROP POLICY IF EXISTS "merchants_view_store_balances" ON store_customer_balances;
DROP POLICY IF EXISTS "service_role_full_access" ON store_customer_balances;

ALTER TABLE store_customer_balances ENABLE ROW LEVEL SECURITY;

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
-- 4. Telefon ile email bulma RPC (auth öncesi çalışır)
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
  -- Önce customers tablosunda ara
  SELECT email INTO v_email
  FROM customers
  WHERE phone = p_phone
  LIMIT 1;

  -- Bulunamadıysa merchants tablosunda ara
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

-- Anon kullanıcılar da çağırabilmeli (giriş öncesi)
GRANT EXECUTE ON FUNCTION get_email_by_phone(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_email_by_phone(TEXT) TO authenticated;

COMMIT;