-- ============================================================
-- AUTH & RLS DÜZELTME
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın
-- ============================================================

BEGIN;

-- ============================================================
-- 1. customers tablosundaki RLS politikalarını düzelt
-- Müşteri kendi kaydını user_id ile her zaman görebilmeli
-- ============================================================

-- Eski kısıtlayıcı politikaları kaldır
DROP POLICY IF EXISTS "merchants_limited_customer_view" ON customers;
DROP POLICY IF EXISTS "customers_view_own" ON customers;
DROP POLICY IF EXISTS "customers_select_own" ON customers;
DROP POLICY IF EXISTS "Enable read access for all users" ON customers;
DROP POLICY IF EXISTS "allow_read_all" ON customers;

-- Yeni politikalar: Müşteri kendi kaydını görebilir
CREATE POLICY "customer_read_own_record" ON customers
  FOR SELECT USING (user_id = auth.uid());

-- Esnaf sadece kendi dükkanında bakiyesi olan müşterilerin ad bilgisini görebilir
-- (telefon numarası dahil tüm alanlar görünür olur ama frontend'de göstermiyoruz)
CREATE POLICY "merchant_read_related_customers" ON customers
  FOR SELECT USING (
    id IN (
      SELECT scb.customer_id FROM store_customer_balances scb
      JOIN merchants m ON m.id = scb.merchant_id
      WHERE m.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Telefon ile email bulma RPC (auth öncesi çalışır)
-- SECURITY DEFINER = RLS bypass eder
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

-- ============================================================
-- 3. merchants tablosu RLS düzeltme (esnaf kendi kaydını görmeli)
-- ============================================================
DROP POLICY IF EXISTS "merchant_read_own" ON merchants;
DROP POLICY IF EXISTS "merchants_select_own" ON merchants;
DROP POLICY IF EXISTS "Enable read access for all users" ON merchants;
DROP POLICY IF EXISTS "allow_read_all" ON merchants;

-- Esnaf kendi kaydını görebilir
CREATE POLICY "merchant_read_own_record" ON merchants
  FOR SELECT USING (user_id = auth.uid());

-- Müşteri, bakiyesi olan mağazaların bilgisini görebilir (store_name vs.)
CREATE POLICY "customer_read_related_merchants" ON merchants
  FOR SELECT USING (
    id IN (
      SELECT scb.merchant_id FROM store_customer_balances scb
      JOIN customers c ON c.id = scb.customer_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Herkes mağaza sayfasını görebilir (store_id ile arama - public bilgi)
CREATE POLICY "public_read_merchant_info" ON merchants
  FOR SELECT USING (true);

COMMIT;