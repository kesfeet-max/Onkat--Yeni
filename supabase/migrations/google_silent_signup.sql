-- ============================================================================
-- Google ile giriş: SESSİZ (formsuz) otomatik kayıt altyapısı
--
-- Amaç:
--   Google ile ilk defa giriş yapan yeni e-postalarda "Hesabınız hazırlanırken
--   bir sorun oluştu" hatasının tamamen ortadan kalkması.
--
-- Sorunun kökü:
--   1) Profil oluşturma yalnızca `auth-google-complete` Edge Function'ına
--      bağlıydı. Fonksiyon deploy edilmemişse / erişilemiyorsa akış patlıyordu.
--   2) `customers` ve `merchants` tablolarında RLS açık olmasına rağmen
--      INSERT politikası hiç yoktu; bu yüzden istemci kendi profilini
--      oluşturamıyordu.
--
-- Bu migration iki güvenli yol açar:
--   A) `onkati_google_profil_hazirla` RPC'si (SECURITY DEFINER) — tek çağrıda
--      profil var mı bakar, yoksa çakışmasız varsayılanlarla oluşturur.
--   B) Kullanıcının YALNIZCA kendi satırını ekleyebildiği RLS INSERT
--      politikaları — RPC kullanılamazsa istemci doğrudan insert yapabilir.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Zorunlu alan gevşetmeleri
--    device_id Google akışında üretilemez; tekil ve NOT NULL kalırsa kayıt patlar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS email text;

-- ---------------------------------------------------------------------------
-- 1. Kendi profilini oluşturma izni (RLS INSERT politikaları)
--    Kullanıcı SADECE user_id = auth.uid() olan satırı ekleyebilir.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_insert_own_customer_profile" ON public.customers;
CREATE POLICY "users_insert_own_customer_profile" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_merchant_profile" ON public.merchants;
CREATE POLICY "users_insert_own_merchant_profile" ON public.merchants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Profil oluşturulduktan hemen sonra okunabilmesi için SELECT politikası garantisi
DROP POLICY IF EXISTS "users_read_own_customer_profile" ON public.customers;
CREATE POLICY "users_read_own_customer_profile" ON public.customers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_own_merchant_profile" ON public.merchants;
CREATE POLICY "users_read_own_merchant_profile" ON public.merchants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Çakışmasız yer tutucu telefon üretici
--
--    Telefon alanı zorunlu ve TEKİL. Google hesabında telefon bilgisi yoktur ve
--    kullanıcıdan istenmeyecektir. Bu yüzden Türkiye'de kullanımda olmayan `09`
--    ön ekiyle, gerçek numaralarla asla çakışmayan bir numara üretilir.
--    Not: onkati_is_valid_phone kuralı (^0[1-9][0-9]{9}$) sağlanır.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_placeholder_phone()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT '09' || lpad(floor(random() * 1000000000)::bigint::text, 9, '0');
$$;

-- ---------------------------------------------------------------------------
-- 3. Google adını veritabanı kurallarına uygun hâle getiren yardımcı
--    Uygun bir isim üretilemezse güvenli varsayılan döner; böylece kullanıcıdan
--    hiçbir zaman ek bilgi istenmez.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_safe_full_name(p_raw text, p_fallback text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := btrim(regexp_replace(COALESCE(p_raw, ''), '[^A-Za-zÇĞİÖŞÜçğıöşü\s''’.\-]', '', 'g'));
  v_text := btrim(regexp_replace(v_text, '\s+', ' ', 'g'));
  v_text := left(v_text, 60);

  IF v_text = '' OR NOT public.onkati_is_valid_full_name(v_text) THEN
    RETURN p_fallback;
  END IF;

  RETURN v_text;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. SESSİZ profil hazırlama RPC'si
--
--    - Oturum sahibinin (auth.uid) profili varsa hiçbir şey yapmaz, rolü döner.
--    - Yoksa istenen role göre müşteri veya esnaf profilini oluşturur.
--    - Telefon / store_id tekillik çakışmalarında birkaç kez yeniden dener.
--    - Hiçbir koşulda kullanıcıdan ek bilgi (telefon, KVKK, sözleşme) istemez.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.onkati_google_profil_hazirla(text);

CREATE OR REPLACE FUNCTION public.onkati_google_profil_hazirla(p_role text DEFAULT 'customer')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_role      text;
  v_email     text;
  v_meta      jsonb;
  v_raw_name  text;
  v_name      text;
  v_fallback  text;
  v_phone     text;
  v_found     uuid;
  v_attempt   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oturum bulunamadi');
  END IF;

  -- Zaten profil varsa dokunma
  SELECT id INTO v_found FROM public.customers WHERE user_id = v_uid LIMIT 1;
  IF v_found IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'role', 'customer', 'created', false);
  END IF;

  SELECT id INTO v_found FROM public.merchants WHERE user_id = v_uid LIMIT 1;
  IF v_found IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'role', 'merchant', 'created', false);
  END IF;

  SELECT u.email, COALESCE(u.raw_user_meta_data, '{}'::jsonb)
    INTO v_email, v_meta
    FROM auth.users u
   WHERE u.id = v_uid;

  -- Rol sırası: gelen istek -> metadata -> varsayilan musteri
  v_role := lower(COALESCE(NULLIF(btrim(p_role), ''), v_meta->>'role', 'customer'));
  IF v_role NOT IN ('customer', 'merchant') THEN
    v_role := 'customer';
  END IF;

  v_fallback := CASE WHEN v_role = 'merchant' THEN 'Onkatı Esnafı' ELSE 'Onkatı Üyesi' END;

  v_raw_name := COALESCE(
    NULLIF(btrim(COALESCE(v_meta->>'full_name', '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'name', '')), ''),
    ''
  );

  v_name := public.onkati_safe_full_name(v_raw_name, '');
  IF v_name IS NULL OR v_name = '' THEN
    -- Google adı kullanılamıyorsa e-posta kullanıcı adından türetmeyi dene
    v_name := public.onkati_safe_full_name(
      regexp_replace(split_part(COALESCE(v_email, ''), '@', 1), '[._\-0-9]+', ' ', 'g'),
      v_fallback
    );
  END IF;

  -- Tekillik çakışmalarına karşı birkaç deneme
  WHILE v_attempt < 6 LOOP
    v_attempt := v_attempt + 1;
    v_phone := public.onkati_placeholder_phone();

    BEGIN
      IF v_role = 'customer' THEN
        INSERT INTO public.customers (user_id, phone, email, full_name, device_id, points_balance, is_active)
        VALUES (v_uid, v_phone, lower(COALESCE(v_email, '')), v_name, NULL, 0, true);
      ELSE
        INSERT INTO public.merchants (
          user_id, phone, email, full_name, store_name,
          city, district, sector, latitude, longitude,
          total_revenue, total_points_distributed, total_customers, is_active
        )
        VALUES (
          v_uid, v_phone, lower(COALESCE(v_email, '')), v_name, v_name,
          'Belirtilmedi', 'Belirtilmedi', 'diger', 0, 0,
          0, 0, 0, true
        );
      END IF;

      RETURN jsonb_build_object('success', true, 'role', v_role, 'created', true, 'phone', v_phone);

    EXCEPTION
      WHEN unique_violation THEN
        -- Aynı anda gelen ikinci bir istek profili oluşturmuş olabilir
        SELECT id INTO v_found FROM public.customers WHERE user_id = v_uid LIMIT 1;
        IF v_found IS NOT NULL THEN
          RETURN jsonb_build_object('success', true, 'role', 'customer', 'created', false);
        END IF;

        SELECT id INTO v_found FROM public.merchants WHERE user_id = v_uid LIMIT 1;
        IF v_found IS NOT NULL THEN
          RETURN jsonb_build_object('success', true, 'role', 'merchant', 'created', false);
        END IF;
        -- Telefon / store_id çakışması: yeni değerle tekrar dene
      WHEN OTHERS THEN
        -- Ad soyad tetikleyicisi gibi beklenmeyen bir kural devreye girdiyse
        -- güvenli varsayılan isimle bir kez daha denenir.
        IF v_name IS DISTINCT FROM v_fallback THEN
          v_name := v_fallback;
        ELSE
          RETURN jsonb_build_object('success', false, 'error', SQLERRM);
        END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', false, 'error', 'Profil olusturulamadi');
END;
$$;

GRANT EXECUTE ON FUNCTION public.onkati_google_profil_hazirla(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.onkati_placeholder_phone() TO authenticated;

COMMIT;
