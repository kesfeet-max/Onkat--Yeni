-- ============================================================================
-- Admin panelinde esnaf istatistiklerinin (müşteri sayısı, ciro, dağıtılan ve
-- harcanan puan) sıfır görünmesi sorununun kalıcı çözümü.
--
-- Sorunun kökü:
--   1) Özetler `admin-data` Edge Function'ının yeni sürümünde hesaplanıyordu.
--      Canlıda eski sürüm çalıştığı için `merchant_detail` ucu yoktu ve istek
--      "Gecersiz istek" ile dönüyordu.
--   2) İstemci yedek yolu doğrudan `transactions` tablosunu sorguluyordu; ancak
--      bu tabloda YALNIZCA "kendi işlemlerini gör" politikaları vardı. Adminler
--      için SELECT politikası olmadığı için sorgu boş dönüyor, tüm kartlar 0
--      görünüyordu.
--
-- Çözüm:
--   A) Adminler için transactions / customers / merchants üzerinde SELECT
--      politikaları (yalnızca `admins` tablosunda kaydı olan kullanıcılar).
--   B) Tüm hesabı veritabanında yapan iki RPC:
--        - `admin_esnaf_istatistikleri()`  → tüm esnafların özetleri
--        - `admin_esnaf_islem_ozeti(uuid)` → tek esnafın özeti + işlem geçmişi
--      Böylece Edge Function hiç deploy edilmese bile veriler doğru gelir.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Admin kontrolü için ortak yardımcı
--    `admins` kaydında user_id boş bırakılmışsa e-posta üzerinden eşleşir.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = v_uid) INTO v_found;
  IF v_found THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.admins a
      JOIN auth.users u ON lower(u.email) = lower(a.email)
     WHERE u.id = v_uid
  ) INTO v_found;

  RETURN v_found;
END;
$$;

GRANT EXECUTE ON FUNCTION public.onkati_is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Adminlerin veri okuma politikaları
--    Mevcut "kendi verisini gör" politikaları aynen korunur; bunlar ek olarak
--    yalnızca admin kullanıcılara okuma izni verir.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins_read_transactions" ON public.transactions;
CREATE POLICY "admins_read_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.onkati_is_admin());

DROP POLICY IF EXISTS "admins_read_customers" ON public.customers;
CREATE POLICY "admins_read_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.onkati_is_admin());

DROP POLICY IF EXISTS "admins_read_merchants" ON public.merchants;
CREATE POLICY "admins_read_merchants" ON public.merchants
  FOR SELECT TO authenticated
  USING (public.onkati_is_admin());

-- ---------------------------------------------------------------------------
-- 2. Tüm esnafların özet istatistikleri
--
--    merchants tablosundaki total_revenue / total_points_distributed /
--    total_customers kolonları güvenilir biçimde güncellenmediği için değerler
--    her istekte gerçek "completed" işlemlerden yeniden hesaplanır.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_esnaf_istatistikleri();

CREATE OR REPLACE FUNCTION public.admin_esnaf_istatistikleri()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.onkati_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin yetkisi yok');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        t.merchant_id                                                              AS merchant_id,
        COALESCE(SUM(CASE WHEN t.type = 'earn'  THEN t.amount ELSE 0 END), 0)      AS revenue,
        COALESCE(SUM(CASE WHEN t.type = 'earn'  THEN t.points ELSE 0 END), 0)      AS points,
        COALESCE(SUM(CASE WHEN t.type = 'spend' THEN t.points ELSE 0 END), 0)      AS spent,
        COUNT(DISTINCT t.customer_id)                                              AS customers,
        COUNT(*)                                                                   AS transaction_count
        FROM public.transactions t
       WHERE t.status = 'completed'
         AND t.merchant_id IS NOT NULL
       GROUP BY t.merchant_id
    ) s;

  RETURN jsonb_build_object('success', true, 'stats', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_esnaf_istatistikleri() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tek esnafın özeti + son 50 işlemi
--
--    Özet TÜM completed işlemlerden hesaplanır; liste yalnızca son 50 kaydı
--    içerir (panelde gösterim için).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_esnaf_islem_ozeti(uuid);

CREATE OR REPLACE FUNCTION public.admin_esnaf_islem_ozeti(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue    numeric := 0;
  v_points     numeric := 0;
  v_spent      numeric := 0;
  v_customers  integer := 0;
  v_count      integer := 0;
  v_list       jsonb;
BEGIN
  IF NOT public.onkati_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin yetkisi yok');
  END IF;

  IF p_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf kimligi gerekli');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN t.type = 'earn'  THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'earn'  THEN t.points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'spend' THEN t.points ELSE 0 END), 0),
    COUNT(DISTINCT t.customer_id),
    COUNT(*)
    INTO v_revenue, v_points, v_spent, v_customers, v_count
    FROM public.transactions t
   WHERE t.merchant_id = p_merchant_id
     AND t.status = 'completed';

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO v_list
    FROM (
      SELECT
        t.id,
        t.type,
        t.amount,
        t.points,
        t.status,
        t.created_at,
        t.customer_id,
        jsonb_build_object('full_name', c.full_name, 'phone', c.phone) AS customers,
        jsonb_build_object('store_name', m.store_name, 'store_id', m.store_id) AS merchants
        FROM public.transactions t
        LEFT JOIN public.customers c ON c.id = t.customer_id
        LEFT JOIN public.merchants m ON m.id = t.merchant_id
       WHERE t.merchant_id = p_merchant_id
         AND t.status = 'completed'
       ORDER BY t.created_at DESC
       LIMIT 50
    ) x;

  RETURN jsonb_build_object(
    'success', true,
    'transactions', v_list,
    'stats', jsonb_build_object(
      'revenue', v_revenue,
      'points', v_points,
      'spent', v_spent,
      'customers', v_customers,
      'transaction_count', v_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_esnaf_islem_ozeti(uuid) TO authenticated;

COMMIT;
