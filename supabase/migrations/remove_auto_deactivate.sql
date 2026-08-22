-- Onkati: Otomatik pasife çekme / QR engelleme kuralının TAMAMEN kaldırılması
--
-- Yeni kural:
--  * Deneme süresi (30 gün) veya abonelik süresi dolsa bile esnaf çalışmaya devam eder.
--  * Esnaf yalnızca ADMIN manuel olarak pasife alırsa işlem yapamaz.
--  * Süresi dolan esnaflar admin panelinde "Geciken Ödemeler" listesinde uyarı ile görünür.

BEGIN;

-- 1) transactions üzerindeki otomatik abonelik zorlama trigger'ı kaldırılır
DROP TRIGGER IF EXISTS trg_enforce_merchant_subscription ON transactions;

-- 2) Fonksiyon geriye dönük uyumluluk için no-op bırakılır
--    (eski migration'lar veya trigger tanımları hata vermesin)
CREATE OR REPLACE FUNCTION enforce_merchant_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Otomatik engelleme kaldırıldı. Hiçbir kontrol yapılmaz.
  RETURN NEW;
END;
$$;

-- 3) Otomatik pasife çekme fonksiyonu artık hiçbir kaydı değiştirmez
CREATE OR REPLACE FUNCTION deactivate_expired_merchants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Otomatik pasife çekme iptal edildi. Yalnızca admin manuel olarak pasife alır.
  RETURN 0;
END;
$$;

-- 4) Daha önce sistem tarafından otomatik pasife çekilmiş esnaflar geri aktif edilir.
--    Ödeme durumu 'overdue' (geciken ödeme) olarak işaretlenir; bu durum ENGELLEMEZ,
--    yalnızca admin panelinde uyarı listesinde görünmesini sağlar.
UPDATE merchants
SET is_active = true,
    subscription_status = 'overdue',
    updated_at = now()
WHERE is_active = false
  AND COALESCE(subscription_status, '') IN ('expired', 'overdue');

-- 5) Admin kontrolü için ortak yardımcı fonksiyon
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid   uuid;
  v_found boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT true INTO v_found
  FROM public.admins a
  WHERE a.user_id = v_uid
  LIMIT 1;

  IF v_found THEN
    RETURN true;
  END IF;

  -- Yedek eşleme: admins kaydında user_id boş bırakılmışsa e-posta ile eşleştir
  SELECT true INTO v_found
  FROM public.admins a
  JOIN auth.users u ON LOWER(u.email) = LOWER(a.email)
  WHERE u.id = v_uid
  LIMIT 1;

  RETURN COALESCE(v_found, false);
END;
$$;

GRANT EXECUTE ON FUNCTION is_current_user_admin() TO authenticated, service_role;

-- 6) Admin havale/EFT onayı: aboneliği uzatır ve hesabı aktif eder.
--    Süre uzatma tamamen manuel bir admin işlemidir.
CREATE OR REPLACE FUNCTION approve_merchant_payment(p_store_id integer, p_months integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months integer;
  v_paid   timestamptz;
  v_name   text;
  v_found  integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Bu işlem için yönetici yetkisi gerekli');
  END IF;

  v_months := GREATEST(COALESCE(p_months, 1), 1);

  UPDATE merchants
  SET is_active = true,
      subscription_status = 'active',
      last_payment_approved_at = now(),
      subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, now()), now())
                                + (v_months || ' months')::interval,
      updated_at = now()
  WHERE store_id = p_store_id
  RETURNING subscription_paid_until, store_name INTO v_paid, v_name;

  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  RETURN json_build_object(
    'success', true,
    'store_name', v_name,
    'months', v_months,
    'subscription_paid_until', v_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_merchant_payment(integer, integer) TO authenticated, service_role;

-- 7) Admin manuel aktif/pasif işlemi (RLS'e takılmadan çalışması için)
CREATE OR REPLACE FUNCTION admin_esnaf_durum_degistir(p_merchant_id uuid, p_active boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Bu işlem için yönetici yetkisi gerekli');
  END IF;

  UPDATE merchants
  SET is_active = COALESCE(p_active, true),
      subscription_status = CASE
        WHEN COALESCE(p_active, true) = false THEN 'suspended'
        WHEN COALESCE(subscription_status, '') = 'suspended' THEN 'overdue'
        ELSE subscription_status
      END,
      updated_at = now()
  WHERE id = p_merchant_id;

  GET DIAGNOSTICS v_found = ROW_COUNT;

  IF v_found = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  RETURN json_build_object('success', true, 'is_active', COALESCE(p_active, true));
END;
$$;

GRANT EXECUTE ON FUNCTION admin_esnaf_durum_degistir(uuid, boolean) TO authenticated, service_role;

COMMIT;