-- =====================================================
-- Merchants tablosuna puan oranı kolonları ekle
-- =====================================================
-- Bu SQL'i Supabase Dashboard > SQL Editor'da çalıştırın

BEGIN;

-- 1) Kolonları ekle (yoksa)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS cash_points_rate NUMERIC(5,2) DEFAULT 7,
  ADD COLUMN IF NOT EXISTS card_points_rate NUMERIC(5,2) DEFAULT 5;

-- 2) Esnafın kendi oranlarını kaydetmesi için RPC
CREATE OR REPLACE FUNCTION esnaf_oran_kaydet(
  p_cash_rate NUMERIC DEFAULT 7,
  p_card_rate NUMERIC DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
BEGIN
  -- Giriş yapan kullanıcının merchant kaydını bul
  SELECT id INTO v_merchant_id
  FROM merchants
  WHERE user_id = auth.uid();

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf kaydı bulunamadı');
  END IF;

  -- Oran sınırlarını kontrol et (1-25 arası)
  IF p_cash_rate < 1 OR p_cash_rate > 25 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nakit oranı 1-25 arasında olmalıdır');
  END IF;

  IF p_card_rate < 1 OR p_card_rate > 25 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kart oranı 1-25 arasında olmalıdır');
  END IF;

  -- Güncelle
  UPDATE merchants
  SET cash_points_rate = p_cash_rate,
      card_points_rate = p_card_rate,
      updated_at = now()
  WHERE id = v_merchant_id;

  RETURN jsonb_build_object(
    'success', true,
    'cash_points_rate', p_cash_rate,
    'card_points_rate', p_card_rate
  );
END;
$$;

-- 3) Esnafın kendi oranlarını okuması için RPC
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
    'cash_points_rate', COALESCE(v_cash, 7),
    'card_points_rate', COALESCE(v_card, 5)
  );
END;
$$;

-- 4) RLS politikası (esnaf kendi satırını güncelleyebilsin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'merchants_update_own_rates' AND tablename = 'merchants'
  ) THEN
    CREATE POLICY "merchants_update_own_rates"
      ON merchants
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMIT;