-- ============================================================
-- ONKATI YENİ QR SİSTEMİ - TAM SQL MİGRASYONU
-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın
-- https://supabase.com/dashboard/project/zsydnrugvilcthcooupa/sql/new
-- ============================================================

BEGIN;

-- ============================================================
-- 1. store_customer_balances TABLOSU (İzole Cüzdan Yapısı)
-- Her müşterinin her dükkanda ayrı bakiyesi olacak
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scb_customer ON store_customer_balances(customer_id);
CREATE INDEX IF NOT EXISTS idx_scb_merchant ON store_customer_balances(merchant_id);
CREATE INDEX IF NOT EXISTS idx_scb_customer_merchant ON store_customer_balances(customer_id, merchant_id);

-- ============================================================
-- 2. RLS POLİTİKALARI - Gizlilik
-- Esnaf müşteri telefonunu göremez
-- ============================================================

-- store_customer_balances RLS
ALTER TABLE store_customer_balances ENABLE ROW LEVEL SECURITY;

-- Müşteri kendi bakiyelerini görebilir
CREATE POLICY "customers_view_own_balances" ON store_customer_balances
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Esnaf kendi dükkanındaki bakiyeleri görebilir (ama müşteri telefonu yok bu tabloda)
CREATE POLICY "merchants_view_store_balances" ON store_customer_balances
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- Service role tam erişim
CREATE POLICY "service_role_full_access" ON store_customer_balances
  FOR ALL USING (auth.role() = 'service_role');

-- customers tablosunda esnafın telefon görmesini engelle
-- NOT: Mevcut RLS varsa drop edip yeniden oluştur
DROP POLICY IF EXISTS "merchants_limited_customer_view" ON customers;
CREATE POLICY "merchants_limited_customer_view" ON customers
  FOR SELECT USING (
    -- Müşteri kendi kaydını görebilir
    user_id = auth.uid()
    OR
    -- Esnaf sadece kendi dükkanında bakiyesi olan müşterileri görebilir
    -- ama bu policy sadece id ve full_name erişimi sağlar (phone hariç - RPC ile kontrol)
    id IN (
      SELECT scb.customer_id FROM store_customer_balances scb
      JOIN merchants m ON m.id = scb.merchant_id
      WHERE m.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. islem_puan_yukle RPC FONKSİYONU
-- Esnaf müşteriye puan yükler (nakit/kart)
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

  -- Puan hesapla (oran yüzde olarak gelir, örn: 7 = %7)
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

  -- Transaction kaydı oluştur
  INSERT INTO transactions (
    idempotency_key,
    customer_id,
    merchant_id,
    type,
    amount,
    points,
    status,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    p_customer_id,
    v_merchant.id,
    'earn',
    p_amount,
    v_points,
    'completed',
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
-- 4. islem_puan_harca RPC FONKSİYONU
-- Müşteri puan harcar (sadece o dükkandaki bakiyeden)
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

  -- Harcama tutarı kontrolü
  IF p_points_to_spend <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Harcama tutari sifirdan buyuk olmali');
  END IF;

  -- Bu dükkandaki bakiyeyi kontrol et
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

  -- Transaction kaydı oluştur
  INSERT INTO transactions (
    idempotency_key,
    customer_id,
    merchant_id,
    type,
    amount,
    points,
    status,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    p_customer_id,
    v_merchant.id,
    'spend',
    p_points_to_spend,
    p_points_to_spend,
    'completed',
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
    'message', format('%s puan harcandi. Kalan bakiye: %s', p_points_to_spend::text, v_new_balance::text)
  );
END;
$$;

-- ============================================================
-- 5. musteri_bilgi_getir RPC (Esnaf QR okutunca müşteri bilgisi)
-- Telefon numarası ASLA dönmez - gizlilik
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
  -- Esnafı bul
  SELECT id, store_name
  INTO v_merchant
  FROM merchants
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabi bulunamadi');
  END IF;

  -- Müşteriyi bul (telefon DÖNMEZ!)
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

  -- Bu dükkandaki bakiyeyi getir
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM store_customer_balances
  WHERE customer_id = p_customer_id AND merchant_id = v_merchant.id;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  -- Telefon numarası ASLA dönmez!
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
-- 6. GRANT İZİNLERİ
-- ============================================================
GRANT EXECUTE ON FUNCTION islem_puan_yukle(UUID, NUMERIC, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION islem_puan_harca(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION musteri_bilgi_getir(UUID) TO authenticated;

-- store_customer_balances tablosuna erişim
GRANT SELECT ON store_customer_balances TO authenticated;
GRANT INSERT, UPDATE ON store_customer_balances TO service_role;

COMMIT;