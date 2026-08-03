-- =====================================================
-- FIX: Dinamik Oran Sorunu — COALESCE Fallback Kaldırma
-- =====================================================
-- Sorun: islem_puan_yukle ve kasiyer_puan_yukle fonksiyonlarında
-- COALESCE(cash_points_rate, 7) / COALESCE(card_points_rate, 5) kullanılıyor.
-- Esnaf oranını ayarlamışsa bile, DB'ye yazılamamışsa NULL kalıyor ve
-- sabit %7/%5 uygulanıyor.
--
-- Çözüm:
-- 1. Mevcut NULL oranları olan esnafları varsayılan %7/%5 ile güncelle (bir kerelik)
-- 2. Kolonlara NOT NULL + DEFAULT constraint ekle
-- 3. RPC fonksiyonlarını COALESCE olmadan yeniden tanımla
-- =====================================================

BEGIN;

-- 1) Mevcut NULL oranları olan esnafları varsayılan değerlerle güncelle
UPDATE merchants
SET cash_points_rate = 7
WHERE cash_points_rate IS NULL;

UPDATE merchants
SET card_points_rate = 5
WHERE card_points_rate IS NULL;

-- 2) Kolonlara NOT NULL constraint ekle (artık NULL olamaz)
ALTER TABLE merchants
  ALTER COLUMN cash_points_rate SET NOT NULL,
  ALTER COLUMN cash_points_rate SET DEFAULT 7;

ALTER TABLE merchants
  ALTER COLUMN card_points_rate SET NOT NULL,
  ALTER COLUMN card_points_rate SET DEFAULT 5;

-- 3) islem_puan_yukle fonksiyonunu COALESCE olmadan yeniden tanımla
-- NOT: Eski fonksiyon "auth_user_id" kolonu kullanıyordu (hatalı).
-- Doğru kolon adı "user_id"dir. Bu DROP + CREATE ile düzeltilir.
-- Ayrıca birden fazla overload varsa hepsini temizliyoruz (ambiguity hatası önlenir).
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC, NUMERIC);

-- Dinamik olarak kalan tüm overload'ları sil
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS func_sig
    FROM pg_proc
    WHERE proname = 'islem_puan_yukle'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION islem_puan_yukle(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT DEFAULT 'cash',
  p_cashier_id UUID DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL
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
  v_settings RECORD;
  v_current_hour INTEGER;
  v_db_cash_rate NUMERIC;
  v_db_card_rate NUMERIC;
BEGIN
  -- Esnafı bul + güncel oranları veritabanından oku (COALESCE YOK — NOT NULL garantili)
  SELECT id, store_id, store_name, is_active,
         cash_points_rate,
         card_points_rate
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

  -- Veritabanındaki güncel oranları al (esnaf en son ne kaydettiyse O kullanılır)
  v_db_cash_rate := v_merchant.cash_points_rate;
  v_db_card_rate := v_merchant.card_points_rate;

  -- Oran sıfır veya negatif kontrolü (güvenlik)
  IF v_db_cash_rate <= 0 OR v_db_card_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Puan orani gecersiz. Lutfen Ayarlar sekmesinden oraninizi belirleyin.');
  END IF;

  -- Mesai kontrolü
  SELECT * INTO v_settings
  FROM merchant_settings
  WHERE merchant_id = v_merchant.id
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    IF NOT v_settings.store_open THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dukkan kasasi kapali. Islem yapilamaz.');
    END IF;

    IF v_settings.auto_schedule_enabled AND v_settings.opening_hour IS NOT NULL AND v_settings.closing_hour IS NOT NULL THEN
      v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Istanbul');
      IF v_current_hour < CAST(split_part(v_settings.opening_hour, ':', 1) AS INTEGER)
         OR v_current_hour >= CAST(split_part(v_settings.closing_hour, ':', 1) AS INTEGER) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dukkan mesai saatleri disindadir.');
      END IF;
    END IF;
  END IF;

  -- Müşteriyi doğrula
  SELECT id, full_name, is_active INTO v_customer
  FROM customers WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tutar sifirdan buyuk olmali');
  END IF;

  -- ORAN: HER ZAMAN veritabanından okunan güncel oran kullanılır
  IF p_payment_type = 'card' THEN
    v_rate := v_db_card_rate;
  ELSE
    v_rate := v_db_cash_rate;
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
    idempotency_key, customer_id, merchant_id, type, amount, points,
    status, payment_type, cashier_id, cashier_name, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'earn', p_amount, v_points,
    'completed', p_payment_type, p_cashier_id, p_cashier_name, NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'amount', p_amount,
    'points', v_points,
    'rate_used', v_rate,
    'payment_type', p_payment_type,
    'new_balance', v_new_balance,
    'message', format('%s TL alisveristen %%%.0f oranla %s puan yuklendi', p_amount::text, v_rate, v_points::text)
  );
END;
$$;

-- 4) kasiyer_puan_yukle fonksiyonunu COALESCE olmadan yeniden tanımla
-- Tüm olası overload'ları temizle
DROP FUNCTION IF EXISTS kasiyer_puan_yukle(UUID, UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS kasiyer_puan_yukle(UUID, UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS func_sig
    FROM pg_proc
    WHERE proname = 'kasiyer_puan_yukle'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION kasiyer_puan_yukle(
  p_cashier_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashier RECORD;
  v_merchant RECORD;
  v_customer RECORD;
  v_rate NUMERIC;
  v_points NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_settings RECORD;
  v_current_hour INTEGER;
  v_db_cash_rate NUMERIC;
  v_db_card_rate NUMERIC;
BEGIN
  -- Kasiyeri doğrula (çağıran kullanıcı bu kasiyere sahip mi?)
  SELECT c.id, c.merchant_id, c.full_name, c.is_active
  INTO v_cashier
  FROM cashiers c
  WHERE c.id = p_cashier_id AND c.user_id = auth.uid()
  LIMIT 1;

  IF v_cashier.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kasiyer yetkisi bulunamadi');
  END IF;

  IF NOT v_cashier.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kasiyer hesabi pasif durumda');
  END IF;

  -- Esnafı bul + güncel oranları al (COALESCE YOK — NOT NULL garantili)
  SELECT id, store_name, is_active,
         cash_points_rate,
         card_points_rate
  INTO v_merchant
  FROM merchants
  WHERE id = v_cashier.merchant_id;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
  END IF;

  v_db_cash_rate := v_merchant.cash_points_rate;
  v_db_card_rate := v_merchant.card_points_rate;

  -- Oran sıfır veya negatif kontrolü (güvenlik)
  IF v_db_cash_rate <= 0 OR v_db_card_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Puan orani gecersiz. Esnaf oranini ayarlamali.');
  END IF;

  -- Mesai kontrolü
  SELECT * INTO v_settings
  FROM merchant_settings
  WHERE merchant_id = v_merchant.id
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    IF NOT v_settings.store_open THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dukkan kasasi kapali. Islem yapilamaz.');
    END IF;

    IF v_settings.auto_schedule_enabled AND v_settings.opening_hour IS NOT NULL AND v_settings.closing_hour IS NOT NULL THEN
      v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Istanbul');
      IF v_current_hour < CAST(split_part(v_settings.opening_hour, ':', 1) AS INTEGER)
         OR v_current_hour >= CAST(split_part(v_settings.closing_hour, ':', 1) AS INTEGER) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dukkan mesai saatleri disindadir.');
      END IF;
    END IF;
  END IF;

  -- Müşteriyi doğrula
  SELECT id, full_name, is_active INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;

  -- Tutar kontrolü
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tutar sifirdan buyuk olmali');
  END IF;

  -- Oran: HER ZAMAN veritabanından okunan güncel oran kullanılır
  IF p_payment_type = 'card' THEN
    v_rate := v_db_card_rate;
  ELSE
    v_rate := v_db_cash_rate;
  END IF;

  v_points := ROUND(p_amount * v_rate / 100, 2);

  -- Bakiye güncelle
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
    idempotency_key, customer_id, merchant_id, type, amount, points,
    status, payment_type, cashier_id, cashier_name, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'earn', p_amount, v_points,
    'completed', p_payment_type, p_cashier_id, v_cashier.full_name, NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'amount', p_amount,
    'points', v_points,
    'rate_used', v_rate,
    'payment_type', p_payment_type,
    'new_balance', v_new_balance,
    'cashier_name', v_cashier.full_name,
    'message', format('%s TL alisveristen %%%.0f oranla %s puan yuklendi (Kasiyer: %s)', p_amount::text, v_rate, v_points::text, v_cashier.full_name)
  );
END;
$$;

-- 5) esnaf_oran_getir fonksiyonunu da COALESCE olmadan güncelle (artık NOT NULL)
CREATE OR REPLACE FUNCTION esnaf_oran_getir()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash NUMERIC;
  v_card NUMERIC;
BEGIN
  SELECT cash_points_rate, card_points_rate
  INTO v_cash, v_card
  FROM merchants
  WHERE user_id = auth.uid();

  IF v_cash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf kaydı bulunamadı');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cash_points_rate', v_cash,
    'card_points_rate', v_card
  );
END;
$$;

-- 6) GRANT'lar (fonksiyon imzaları aynı kaldığı için tekrar gerekli)
GRANT EXECUTE ON FUNCTION islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_puan_yukle(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION esnaf_oran_getir() TO authenticated;
GRANT EXECUTE ON FUNCTION esnaf_oran_kaydet(NUMERIC, NUMERIC) TO authenticated;

COMMIT;