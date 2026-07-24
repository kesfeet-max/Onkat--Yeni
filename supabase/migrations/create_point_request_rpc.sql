-- Bu SQL'i Supabase Dashboard > SQL Editor'de çalıştırın
-- https://supabase.com/dashboard/project/zsydnrugvilcthcooupa/sql/new

BEGIN;

-- Create index on merchants.store_id for fast lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_merchants_store_id ON merchants(store_id);

-- Drop old version if exists
DROP FUNCTION IF EXISTS create_point_request(TEXT, TEXT, NUMERIC);

-- Create the RPC function - finds merchant AND inserts into requests table
-- NOT: requests tablosunda "merchant_id" sütunu YOK, "store_id" sütunu var
CREATE OR REPLACE FUNCTION create_point_request(
  p_store_code TEXT,
  p_customer_phone TEXT DEFAULT '',
  p_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant RECORD;
  v_customer RECORD;
  v_clean_code TEXT;
  v_request_id UUID;
  v_last_request TIMESTAMPTZ;
BEGIN
  -- Normalize: trim whitespace and uppercase for case-insensitive matching
  v_clean_code := TRIM(UPPER(p_store_code));
  
  IF v_clean_code IS NULL OR v_clean_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Magaza kodu bos olamaz');
  END IF;

  -- Find the customer by auth.uid()
  SELECT id, phone, full_name, is_active
  INTO v_customer
  FROM customers
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Musteri hesabi bulunamadi');
  END IF;

  IF NOT v_customer.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hesabiniz askiya alindi');
  END IF;

  -- Strategy 1: Try exact match on store_id (cast to text, uppercase, trimmed)
  SELECT id, store_id, store_name, is_active
  INTO v_merchant
  FROM merchants
  WHERE TRIM(UPPER(store_id::text)) = v_clean_code
  LIMIT 1;

  -- Strategy 2: If not found and input looks like UUID, try matching by id column
  IF v_merchant.id IS NULL AND v_clean_code ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN
    SELECT id, store_id, store_name, is_active
    INTO v_merchant
    FROM merchants
    WHERE UPPER(id::text) = v_clean_code
    LIMIT 1;
  END IF;

  -- Strategy 3: Try numeric comparison (if input is a number)
  IF v_merchant.id IS NULL AND v_clean_code ~ '^\d+$' THEN
    BEGIN
      SELECT id, store_id, store_name, is_active
      INTO v_merchant
      FROM merchants
      WHERE store_id = v_clean_code::integer
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Not found
  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bu magaza kodu bulunamadi. Lutfen esnaftan dogru kodu alin.',
      'searched_code', v_clean_code
    );
  END IF;

  -- Check if merchant is active
  IF NOT v_merchant.is_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bu magaza aktif degil',
      'store_name', v_merchant.store_name
    );
  END IF;

  -- Check 15-minute cooldown for same store
  SELECT created_at INTO v_last_request
  FROM requests
  WHERE customer_id = v_customer.id
    AND store_id = v_merchant.store_id::text
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '15 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_request IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ayni magazaya 15 dakika icinde tekrar talep gonderemezsiniz.',
      'store_name', v_merchant.store_name
    );
  END IF;

  -- INSERT into requests table (uses store_id, NOT merchant_id)
  INSERT INTO requests (
    customer_id,
    store_id,
    status,
    created_at
  ) VALUES (
    v_customer.id,
    v_merchant.store_id::text,
    'pending',
    NOW()
  )
  RETURNING id INTO v_request_id;

  -- Return success with request details
  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'merchant_id', v_merchant.id,
    'store_name', v_merchant.store_name,
    'store_id', v_merchant.store_id,
    'message', 'Puan talebi basariyla gonderildi'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_point_request(TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION create_point_request(TEXT, TEXT, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION create_point_request(TEXT, TEXT, NUMERIC) TO service_role;

COMMIT;