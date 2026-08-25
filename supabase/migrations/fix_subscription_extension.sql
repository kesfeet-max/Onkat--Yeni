-- Onkati: "1 Ay Uzat" tarih hesaplama düzeltmesi
--
-- SORUN (eski davranış):
--   subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, now()), now()) + interval
--   1) `trial_ends_at` alanı HİÇ dikkate alınmıyordu. Deneme süresi devam eden (örn. 10 Eylül'e
--      kadar hakkı olan) ve subscription_paid_until alanı boş olan esnafa "1 Ay Uzat" denildiğinde
--      süre bugünden başlatılıyor ve esnaf kalan günlerini kaybediyordu.
--   2) Uzatma takvim ayı ile yapılıyordu; bu yüzden ay uzunluğuna göre 28-31 gün arası
--      değişken süre ekleniyordu.
--
-- YENİ KURAL:
--   Uzatma birimi TAM 30 GÜNDÜR (takvim ayı değil). 12 ay seçeneği 365 gün ekler.
--   Baz tarih = trial_ends_at ve subscription_paid_until alanlarından hangisi daha ileriyse o.
--     * Koşul A — baz tarih GELECEKTE ise: 30 gün o tarihin ÜZERİNE eklenir.
--         (Bitiş 10 Eylül ise, bugün uzatılsa bile yeni bitiş 10 Ekim olur.)
--     * Koşul B — baz tarih GEÇMİŞTE kaldıysa: yeni dönem bugünden başlatılır.
--         (Uzun süre ödeme yapmayan esnafa geçmişe dönük gün hediye edilmez.)

BEGIN;

-- Dönüş tipi json olarak korunur; CREATE OR REPLACE ile imza değiştirilemediği için düşürülür.
DROP FUNCTION IF EXISTS approve_merchant_payment(integer, integer);
DROP FUNCTION IF EXISTS approve_merchant_payment(integer);

CREATE OR REPLACE FUNCTION approve_merchant_payment(p_store_id integer, p_months integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months     integer;
  v_days       integer;
  v_trial      timestamptz;
  v_paid       timestamptz;
  v_previous   timestamptz;
  v_base       timestamptz;
  v_new        timestamptz;
  v_name       text;
  v_from_today boolean;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Bu işlem için yönetici yetkisi gerekli');
  END IF;

  v_months := GREATEST(COALESCE(p_months, 1), 1);

  -- 1 ay = tam 30 gün, 12 ay = 365 gün
  v_days := CASE WHEN v_months = 12 THEN 365 ELSE v_months * 30 END;

  -- Esnafın mevcut abonelik/deneme bitiş bilgisi kilitlenerek okunur (yarış durumu olmasın).
  SELECT store_name, trial_ends_at, subscription_paid_until
    INTO v_name, v_trial, v_paid
  FROM merchants
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  -- Geçerli bitiş tarihi: iki alandan hangisi daha ileriyse o.
  v_previous := GREATEST(
    COALESCE(v_paid, '-infinity'::timestamptz),
    COALESCE(v_trial, '-infinity'::timestamptz)
  );
  IF v_previous = '-infinity'::timestamptz THEN
    v_previous := NULL;
  END IF;

  -- Koşul A / Koşul B kararı
  IF v_previous IS NOT NULL AND v_previous > now() THEN
    v_base := v_previous;          -- Süresi devam ediyor: mevcut bitişin üzerine ekle
    v_from_today := false;
  ELSE
    v_base := now();               -- Süresi dolmuş: bugünden başlat
    v_from_today := true;
  END IF;

  v_new := v_base + (v_days || ' days')::interval;

  UPDATE merchants
  SET is_active = true,
      subscription_status = 'active',
      last_payment_approved_at = now(),
      subscription_paid_until = v_new,
      updated_at = now()
  WHERE store_id = p_store_id;

  RETURN json_build_object(
    'success', true,
    'store_name', v_name,
    'months', v_months,
    'added_days', v_days,
    'previous_end', v_previous,
    'started_from_today', v_from_today,
    'subscription_paid_until', v_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_merchant_payment(integer, integer) TO authenticated, service_role;

COMMIT;