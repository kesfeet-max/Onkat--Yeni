-- ============================================================
-- ONKATI KASİYER YÖNETİMİ V2 — HİBRİT MÜŞTERİ-KASİYER SİSTEMİ
-- Müşteriler telefon numarasıyla kasiyer yetkisi alır.
-- Kasiyer yetkili müşteri kendi panelinden esnaf adına işlem yapabilir.
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
  customer_id UUID REFERENCES customers(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, phone)
);

-- customer_id kolonu yoksa ekle (mevcut tabloya)
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_cashiers_merchant ON cashiers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_cashiers_phone ON cashiers(phone);
CREATE INDEX IF NOT EXISTS idx_cashiers_user_id ON cashiers(user_id);
CREATE INDEX IF NOT EXISTS idx_cashiers_customer_id ON cashiers(customer_id);

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
-- 3. transactions tablosuna cashier_id, cashier_name, payment_type ekleme
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES cashiers(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cashier_name TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT NULL;

-- ============================================================
-- 4. RPC: kasiyer_ekle (Esnaf, müşteri telefonuyla kasiyer ekler)
--    Müşteri customers tablosundan bulunur, user_id ve customer_id eşleştirilir.
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
  v_customer RECORD;
  v_resolved_name TEXT;
BEGIN
  -- Esnafı bul (çağıran kullanıcı)
  SELECT id, store_name INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  -- Telefon numarasıyla müşteriyi bul (customers tablosundan)
  SELECT id, user_id, full_name INTO v_customer
  FROM customers
  WHERE phone = p_phone
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu telefon numarasina kayitli musteri bulunamadi. Musteri once sisteme kayit olmalidir.');
  END IF;

  -- İsim: parametre boşsa müşterinin kendi adını kullan
  v_resolved_name := COALESCE(NULLIF(TRIM(p_full_name), ''), v_customer.full_name, 'Kasiyer');

  -- Kasiyer ekle (UPSERT) — customer_id ve user_id eşleştir
  INSERT INTO cashiers (merchant_id, phone, full_name, user_id, customer_id, is_active)
  VALUES (v_merchant.id, p_phone, v_resolved_name, v_customer.user_id, v_customer.id, true)
  ON CONFLICT (merchant_id, phone)
  DO UPDATE SET
    full_name = v_resolved_name,
    user_id = COALESCE(v_customer.user_id, cashiers.user_id),
    customer_id = COALESCE(v_customer.id, cashiers.customer_id),
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_cashier_id;

  RETURN jsonb_build_object(
    'success', true,
    'cashier_id', v_cashier_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'message', format('%s artik %s icin kasiyer yetkisine sahip', v_customer.full_name, v_merchant.store_name)
  );
END;
$$;

-- ============================================================
-- 5. RPC: kasiyer_listele (Esnafın kasiyerlerini listele)
--    FIX: jsonb_agg boş sonuç durumunda düzgün çalışır
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_listele();

CREATE OR REPLACE FUNCTION kasiyer_listele()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_cashiers JSONB;
BEGIN
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  -- Kasiyerleri topla (boş durumda '[]' döner)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'phone', c.phone,
        'full_name', c.full_name,
        'is_active', c.is_active,
        'user_id', c.user_id,
        'customer_id', c.customer_id,
        'created_at', c.created_at
      ) ORDER BY c.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_cashiers
  FROM cashiers c
  WHERE c.merchant_id = v_merchant_id;

  RETURN jsonb_build_object('success', true, 'cashiers', v_cashiers);
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
-- 7. RPC: kasiyer_yetki_kontrol
--    Müşteri giriş yaptığında çağırır. Kasiyer yetkisi varsa
--    merchant bilgilerini döner, yoksa boş döner.
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_yetki_kontrol();

CREATE OR REPLACE FUNCTION kasiyer_yetki_kontrol()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'cashier_id', c.id,
        'merchant_id', c.merchant_id,
        'store_name', m.store_name,
        'merchant_store_id', m.store_id,
        'is_active', c.is_active
      )
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM cashiers c
  JOIN merchants m ON m.id = c.merchant_id
  WHERE c.user_id = auth.uid()
    AND c.is_active = true
    AND m.is_active = true;

  RETURN jsonb_build_object('success', true, 'assignments', v_result);
END;
$$;

-- ============================================================
-- 8. RPC: kasiyer_puan_yukle
--    Kasiyer yetkili müşteri, esnaf adına puan yükler.
--    auth.uid() kasiyerin user_id'si olmalı.
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_puan_yukle(UUID, UUID, NUMERIC, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION kasiyer_puan_yukle(
  p_cashier_id UUID,
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
  v_cashier RECORD;
  v_merchant RECORD;
  v_customer RECORD;
  v_rate NUMERIC;
  v_points NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_settings RECORD;
  v_current_hour INTEGER;
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

  -- Esnafı bul
  SELECT id, store_name, is_active INTO v_merchant
  FROM merchants
  WHERE id = v_cashier.merchant_id;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
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

  -- Oran belirle
  IF p_payment_type = 'card' THEN
    v_rate := p_card_rate;
  ELSE
    v_rate := p_cash_rate;
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

  -- Transaction kaydı
  INSERT INTO transactions (
    idempotency_key, customer_id, merchant_id, type, amount, points,
    status, payment_type, cashier_id, cashier_name, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'earn', p_amount, v_points,
    'completed', p_payment_type, v_cashier.id, v_cashier.full_name, NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'amount', p_amount,
    'points', v_points,
    'payment_type', p_payment_type,
    'new_balance', v_new_balance,
    'cashier_name', v_cashier.full_name,
    'message', format('%s TL alisveristen %s puan yuklendi (Kasiyer: %s)', p_amount::text, v_points::text, v_cashier.full_name)
  );
END;
$$;

-- ============================================================
-- 9. RPC: kasiyer_puan_harca
--    Kasiyer yetkili müşteri, esnaf adına puan harcar.
-- ============================================================
DROP FUNCTION IF EXISTS kasiyer_puan_harca(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION kasiyer_puan_harca(
  p_cashier_id UUID,
  p_customer_id UUID,
  p_points_to_spend NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashier RECORD;
  v_merchant RECORD;
  v_customer RECORD;
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_tx_id UUID;
  v_settings RECORD;
  v_current_hour INTEGER;
BEGIN
  -- Kasiyeri doğrula
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

  -- Esnafı bul
  SELECT id, store_name, is_active INTO v_merchant
  FROM merchants
  WHERE id = v_cashier.merchant_id;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
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

  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  -- Transaction kaydı
  INSERT INTO transactions (
    idempotency_key, customer_id, merchant_id, type, amount, points,
    status, cashier_id, cashier_name, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'spend', 0, p_points_to_spend,
    'completed', v_cashier.id, v_cashier.full_name, NOW()
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'customer_name', v_customer.full_name,
    'store_name', v_merchant.store_name,
    'points_spent', p_points_to_spend,
    'new_balance', v_new_balance,
    'cashier_name', v_cashier.full_name,
    'message', format('%s puan harcandi (Kasiyer: %s)', p_points_to_spend::text, v_cashier.full_name)
  );
END;
$$;

-- ============================================================
-- 10. RPC: magaza_ayar_kaydet (Mesai/Güvenlik ayarları)
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
-- 11. RPC: magaza_ayar_getir
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
-- 12. islem_puan_yukle — esnaf kendisi işlem yaparken (mevcut davranış korunur)
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
    'payment_type', p_payment_type,
    'new_balance', v_new_balance,
    'message', format('%s TL alisveristen %s puan yuklendi', p_amount::text, v_points::text)
  );
END;
$$;

-- ============================================================
-- 13. islem_puan_harca — esnaf kendisi işlem yaparken
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
  SELECT id, store_id, store_name, is_active INTO v_merchant
  FROM merchants WHERE user_id = auth.uid() LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza hesabi aktif degil');
  END IF;

  SELECT * INTO v_settings FROM merchant_settings WHERE merchant_id = v_merchant.id LIMIT 1;

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

  SELECT id, full_name, is_active INTO v_customer FROM customers WHERE id = p_customer_id;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri bulunamadi');
  END IF;
  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi askida');
  END IF;
  IF p_points_to_spend <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Puan miktari sifirdan buyuk olmali');
  END IF;

  SELECT balance INTO v_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  IF v_balance IS NULL OR v_balance < p_points_to_spend THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetersiz bakiye');
  END IF;

  UPDATE store_customer_balances
  SET balance = balance - p_points_to_spend,
      total_spent = total_spent + p_points_to_spend,
      last_transaction_at = NOW(),
      updated_at = NOW()
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  SELECT balance INTO v_new_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  INSERT INTO transactions (
    idempotency_key, customer_id, merchant_id, type, amount, points,
    status, cashier_id, cashier_name, created_at
  ) VALUES (
    gen_random_uuid()::text, p_customer_id, v_merchant.id, 'spend', 0, p_points_to_spend,
    'completed', p_cashier_id, p_cashier_name, NOW()
  ) RETURNING id INTO v_tx_id;

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
-- 14. GRANT'lar
-- ============================================================
GRANT EXECUTE ON FUNCTION kasiyer_ekle(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_listele() TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_durum_degistir(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_yetki_kontrol() TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_puan_yukle(UUID, UUID, NUMERIC, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION kasiyer_puan_harca(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION magaza_ayar_kaydet(BOOLEAN, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION magaza_ayar_getir() TO authenticated;
GRANT EXECUTE ON FUNCTION islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION islem_puan_harca(UUID, NUMERIC, UUID, TEXT) TO authenticated;

COMMIT;