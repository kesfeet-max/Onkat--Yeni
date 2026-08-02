-- ============================================================
-- ONKATI KASİYER YÖNETİMİ MİGRASYONU
-- Kasiyer yetkilendirme, mesai saatleri, güvenlik
-- ============================================================

BEGIN;

-- ============================================================
-- 1. cashiers TABLOSU (Kasiyer/Çalışan Yönetimi)
-- ============================================================
CREATE TABLE IF NOT EXISTS cashiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  user_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_cashiers_merchant ON cashiers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_cashiers_phone ON cashiers(phone);
CREATE INDEX IF NOT EXISTS idx_cashiers_user_id ON cashiers(user_id);

-- RLS
ALTER TABLE cashiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_manage_cashiers" ON cashiers;
CREATE POLICY "merchant_manage_cashiers" ON cashiers
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cashier_view_own" ON cashiers;
CREATE POLICY "cashier_view_own" ON cashiers
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 2. merchant_settings TABLOSU (Mesai/Güvenlik Ayarları)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE UNIQUE,
  store_open BOOLEAN NOT NULL DEFAULT true,
  opening_hour TEXT DEFAULT NULL,
  closing_hour TEXT DEFAULT NULL,
  auto_schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_settings_merchant ON merchant_settings(merchant_id);

-- RLS
ALTER TABLE merchant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_manage_settings" ON merchant_settings;
CREATE POLICY "merchant_manage_settings" ON merchant_settings
  FOR ALL USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- ============================================================
-- 3. transactions tablosuna cashier_id ve cashier_name ekleme
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES cashiers(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_name TEXT DEFAULT NULL;

-- ============================================================
-- 4. RPC: kasiyer_ekle (Esnaf kasiyer ekler)
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_ekle(TEXT, TEXT);

CREATE OR REPLACE FUNCTION kasiyer_ekle(
  p_phone TEXT,
  p_full_name TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_cashier_id UUID;
  v_user_id UUID;
BEGIN
  -- Esnafı bul
  SELECT id INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  -- Telefon numarasıyla eşleşen kullanıcı var mı?
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE phone = p_phone OR raw_user_meta_data->>'phone' = p_phone
  LIMIT 1;

  -- Kasiyer ekle (UPSERT)
  INSERT INTO cashiers (merchant_id, phone, full_name, user_id, is_active)
  VALUES (v_merchant.id, p_phone, p_full_name, v_user_id, true)
  ON CONFLICT (merchant_id, phone)
  DO UPDATE SET
    full_name = COALESCE(NULLIF(p_full_name, ''), cashiers.full_name),
    user_id = COALESCE(v_user_id, cashiers.user_id),
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_cashier_id;

  RETURN jsonb_build_object(
    'success', true,
    'cashier_id', v_cashier_id,
    'message', 'Kasiyer basariyla eklendi'
  );
END;
$$;

-- ============================================================
-- 5. RPC: kasiyer_listele (Esnafın kasiyerlerini listele)
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_listele();

CREATE OR REPLACE FUNCTION kasiyer_listele()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'cashiers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'phone', c.phone,
        'full_name', c.full_name,
        'is_active', c.is_active,
        'user_id', c.user_id,
        'created_at', c.created_at
      )
    ), '[]'::jsonb)
  ) INTO v_result
  FROM cashiers c
  WHERE c.merchant_id = v_merchant_id
  ORDER BY c.created_at DESC;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 6. RPC: kasiyer_durum_degistir (Aktif/Pasif toggle)
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_durum_degistir(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION kasiyer_durum_degistir(
  p_cashier_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
BEGIN
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  UPDATE cashiers
  SET is_active = p_is_active, updated_at = NOW()
  WHERE id = p_cashier_id AND merchant_id = v_merchant_id;

  RETURN jsonb_build_object('success', true, 'message', 'Kasiyer durumu guncellendi');
END;
$$;

-- ============================================================
-- 7. RPC: magaza_ayar_kaydet (Mesai/Güvenlik ayarları)
-- ============================================================
DROP FUNCTION IF EXISTS magaza_ayar_kaydet(BOOLEAN, BOOLEAN, TEXT, TEXT);

CREATE OR REPLACE FUNCTION magaza_ayar_kaydet(
  p_store_open BOOLEAN,
  p_auto_schedule BOOLEAN DEFAULT false,
  p_opening_hour TEXT DEFAULT NULL,
  p_closing_hour TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
BEGIN
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  INSERT INTO merchant_settings (merchant_id, store_open, auto_schedule_enabled, opening_hour, closing_hour)
  VALUES (v_merchant_id, p_store_open, p_auto_schedule, p_opening_hour, p_closing_hour)
  ON CONFLICT (merchant_id)
  DO UPDATE SET
    store_open = p_store_open,
    auto_schedule_enabled = p_auto_schedule,
    opening_hour = p_opening_hour,
    closing_hour = p_closing_hour,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'message', 'Magaza ayarlari kaydedildi');
END;
$$;

-- ============================================================
-- 8. RPC: magaza_ayar_getir
-- ============================================================
DROP FUNCTION IF EXISTS magaza_ayar_getir();

CREATE OR REPLACE FUNCTION magaza_ayar_getir()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_settings RECORD;
BEGIN
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  SELECT * INTO v_settings
  FROM merchant_settings
  WHERE merchant_id = v_merchant_id
  LIMIT 1;

  IF v_settings IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'store_open', true,
      'auto_schedule_enabled', false,
      'opening_hour', null,
      'closing_hour', null
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'store_open', v_settings.store_open,
    'auto_schedule_enabled', v_settings.auto_schedule_enabled,
    'opening_hour', v_settings.opening_hour,
    'closing_hour', v_settings.closing_hour
  );
END;
$$;

-- ============================================================
-- 9. islem_puan_yukle güncelleme — cashier_id/cashier_name + mesai kontrolü
-- ============================================================
DROP FUNCTION IF EXISTS islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID, TEXT);

CREATE OR REPLACE FUNCTION islem_puan_yukle(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_type TEXT DEFAULT 'cash',
  p_cash_rate NUMERIC DEFAULT 7,
  p_card_rate NUMERIC DEFAULT 5,
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
BEGIN
  -- Esnafı bul (çağıran kullanıcı)
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

  -- Mağaza ayarlarını kontrol et (kasa açık mı? mesai saatleri?)
  SELECT * INTO v_settings
  FROM merchant_settings
  WHERE merchant_id = v_merchant.id
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    -- Manuel şalter kontrolü
    IF NOT v_settings.store_open THEN
      RETURN jsonb_build_object('success', false, 'error', 'Dukkan kasasi kapali. Islem yapilamaz.');
    END IF;

    -- Otomatik saat kontrolü
    IF v_settings.auto_schedule_enabled AND v_settings.opening_hour IS NOT NULL AND v_settings.closing_hour IS NOT NULL THEN
      v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Istanbul');
      IF v_current_hour < CAST(split_part(v_settings.opening_hour, ':', 1) AS INTEGER)
         OR v_current_hour >= CAST(split_part(v_settings.closing_hour, ':', 1) AS INTEGER) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dukkan mesai saatleri disindadir. Islem yapilamaz.');
      END IF;
    END IF;
  END IF;

  -- Müşteriyi doğrula
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

  -- Tutar kontrolü
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tutar sifirdan buyuk olmali');
  END IF;

  -- Ödeme tipine göre oran belirle
  IF p_payment_type = 'card' THEN
    v_rate := p_card_rate;
  ELSE
    v_rate := p_cash_rate;
  END IF;

  -- Puan hesapla
  v_points := ROUND(p_amount * v_rate / 100, 2);

  -- store_customer_balances güncelle veya oluştur (UPSERT)
  INSERT INTO store_customer_balances (customer_id, merchant_id, balance, total_earned, last_transaction_at)
  VALUES (p_customer_id, v_merchant.id, v_points, v_points, NOW())
  ON CONFLICT (customer_id, merchant_id)
  DO UPDATE SET
    balance = store_customer_balances.balance + v_points,
    total_earned = store_customer_balances.total_earned + v_points,
    last_transaction_at = NOW(),
    updated_at = NOW();

  -- Yeni bakiyeyi al
  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  -- Transaction kaydı oluştur (cashier + payment_type bilgisi dahil)
  INSERT INTO transactions (
    idempotency_key,
    customer_id,
    merchant_id,
    type,
    amount,
    points,
    status,
    payment_type,
    cashier_id,
    cashier_name,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    p_customer_id,
    v_merchant.id,
    'earn',
    p_amount,
    v_points,
    'completed',
    p_payment_type,
    p_cashier_id,
    p_cashier_name,
    NOW()
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
-- 10. islem_puan_harca güncelleme — cashier_id/cashier_name + mesai kontrolü
-- ============================================================
DROP FUNCTION IF EXISTS islem_puan_harca(UUID, NUMERIC, UUID, TEXT);

CREATE OR REPLACE FUNCTION islem_puan_harca(
  p_customer_id UUID,
  p_points_to_spend NUMERIC,
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
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_settings RECORD;
  v_current_hour INTEGER;
BEGIN
  -- Esnafı bul
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

  -- Mağaza ayarlarını kontrol et
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
        RETURN jsonb_build_object('success', false, 'error', 'Dukkan mesai saatleri disindadir. Islem yapilamaz.');
      END IF;
    END IF;
  END IF;

  -- Müşteriyi doğrula
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

  -- Puan kontrolü
  IF p_points_to_spend <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Puan miktari sifirdan buyuk olmali');
  END IF;

  -- Bakiye kontrolü
  SELECT balance INTO v_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  IF v_balance IS NULL OR v_balance < p_points_to_spend THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetersiz bakiye');
  END IF;

  -- Bakiyeyi düş
  UPDATE store_customer_balances
  SET
    balance = balance - p_points_to_spend,
    total_spent = total_spent + p_points_to_spend,
    last_transaction_at = NOW(),
    updated_at = NOW()
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  -- Yeni bakiyeyi al
  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  -- Transaction kaydı (cashier bilgisi dahil)
  INSERT INTO transactions (
    idempotency_key,
    customer_id,
    merchant_id,
    type,
    amount,
    points,
    status,
    cashier_id,
    cashier_name,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    p_customer_id,
    v_merchant.id,
    'spend',
    0,
    p_points_to_spend,
    'completed',
    p_cashier_id,
    p_cashier_name,
    NOW()
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'points_spent', p_points_to_spend,
    'new_balance', v_new_balance,
    'message', format('%s puan harcandi', p_points_to_spend::text)
  );
END;
$$;

-- ============================================================
-- 11. transactions tablosuna payment_type kolonu ekleme (varsa atla)
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT NULL;

COMMIT;