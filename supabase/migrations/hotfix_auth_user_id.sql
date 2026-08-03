-- =====================================================
-- HOTFIX: "column auth_user_id does not exist" hatası
-- =====================================================
-- Sorun: Supabase'de deploy edilmiş islem_puan_yukle fonksiyonu
-- merchants tablosunda "auth_user_id" kolonu arıyor ama doğru kolon adı "user_id".
--
-- Bu dosyayı Supabase Dashboard > SQL Editor'da çalıştırın.
-- (fix_dynamic_rates.sql'in tamamını çalıştırmak da aynı işi görür)
-- =====================================================

BEGIN;

-- Eski fonksiyon imzalarını temizle (hangi imzayla oluşturulmuş olursa olsun)
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC, NUMERIC);

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
  -- Esnafı bul: DOĞRU KOLON "user_id" (auth_user_id DEĞİL!)
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

  -- Veritabanındaki güncel oranları al
  v_db_cash_rate := COALESCE(v_merchant.cash_points_rate, 7);
  v_db_card_rate := COALESCE(v_merchant.card_points_rate, 5);

  -- Oran sıfır veya negatif kontrolü
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

  -- ORAN: Veritabanından okunan güncel oran
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

-- GRANT
GRANT EXECUTE ON FUNCTION islem_puan_yukle(UUID, NUMERIC, TEXT, UUID, TEXT) TO authenticated;

COMMIT;