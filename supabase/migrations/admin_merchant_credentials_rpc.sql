-- ============================================================================
-- Admin panelinden esnaf giriş bilgilerini (e-posta / şifre) yönetme
-- + telefon ile giriş e-posta eşlemesinin düzeltilmesi
--
-- ÇÖZÜLEN SORUNLAR
-- 1) "Gecersiz istek": admin-data Edge Function'ının eski sürümü yeni
--    aksiyonları tanımıyordu. Artık işlem doğrudan veritabanı RPC'si ile yapılır.
-- 2) "Admin yetkisi yok": admins tablosundaki RLS politikası yalnızca
--    `authenticated` rolü için tanımlıydı. SECURITY DEFINER fonksiyon farklı bir
--    rol altında çalıştığında satırı göremiyor ve yetki kontrolü boşa düşüyordu.
--    Aşağıda role bağımlı olmayan (PUBLIC) self-read politikası eklenir.
-- 3) "Şifremi sıfırladım ama giriş yapamıyorum": telefon ile giriş yapılırken
--    e-posta, uygulama tablosundaki (bazen boş/eski) email kolonundan okunuyordu.
--    Artık her zaman auth.users'taki GERÇEK giriş e-postası döndürülür.
--
-- Bu dosya tekrar tekrar çalıştırılabilir (idempotent).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 0) admins tablosu: role bağımsız "kendi satırını okuma" politikası
--    (SECURITY DEFINER fonksiyonların yetki kontrolü yapabilmesi için gerekli)
-- ---------------------------------------------------------------------------
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_self_read_any_role" ON public.admins;
CREATE POLICY "admins_self_read_any_role" ON public.admins
  FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON public.admins TO authenticated;

-- ---------------------------------------------------------------------------
-- 1) Esnafın gerçek giriş (auth) bilgilerini okur
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_esnaf_giris_bilgisi(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid          uuid;
  v_admin_id     uuid;
  v_email        text;
  v_phone        text;
  v_confirmed    timestamptz;
  v_last_sign_in timestamptz;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Oturum bulunamadı, lütfen tekrar giriş yapın');
  END IF;

  SELECT a.id INTO v_admin_id
  FROM public.admins a
  WHERE a.user_id = v_uid
  LIMIT 1;

  -- Yedek eşleme: admins kaydında user_id boş bırakılmışsa e-posta ile eşleştir
  IF v_admin_id IS NULL THEN
    SELECT a.id INTO v_admin_id
    FROM public.admins a
    JOIN auth.users u ON LOWER(u.email) = LOWER(a.email)
    WHERE u.id = v_uid
    LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bu hesap yönetici olarak kayıtlı değil');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı kimliği gerekli');
  END IF;

  SELECT u.email, u.phone, u.email_confirmed_at, u.last_sign_in_at
    INTO v_email, v_phone, v_confirmed, v_last_sign_in
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı bulunamadı');
  END IF;

  RETURN json_build_object(
    'success', true,
    'email', COALESCE(v_email, ''),
    'phone', COALESCE(v_phone, ''),
    'email_confirmed', v_confirmed IS NOT NULL,
    'last_sign_in_at', v_last_sign_in
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Esnafın giriş e-postasını ve/veya şifresini günceller
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_esnaf_giris_guncelle(
  p_user_id     uuid,
  p_merchant_id uuid DEFAULT NULL,
  p_email       text DEFAULT NULL,
  p_password    text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid            uuid;
  v_admin_id       uuid;
  v_admin_email    text;
  v_new_email      text;
  v_new_password   text;
  v_email_updated  boolean := false;
  v_pass_updated   boolean := false;
  v_action         text;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Oturum bulunamadı, lütfen tekrar giriş yapın');
  END IF;

  SELECT a.id, a.email INTO v_admin_id, v_admin_email
  FROM public.admins a
  WHERE a.user_id = v_uid
  LIMIT 1;

  -- Yedek eşleme: admins kaydında user_id boş bırakılmışsa e-posta ile eşleştir
  IF v_admin_id IS NULL THEN
    SELECT a.id, a.email INTO v_admin_id, v_admin_email
    FROM public.admins a
    JOIN auth.users u ON LOWER(u.email) = LOWER(a.email)
    WHERE u.id = v_uid
    LIMIT 1;

    -- user_id alanını da doldur ki sonraki kontroller doğrudan çalışsın
    IF v_admin_id IS NOT NULL THEN
      BEGIN
        UPDATE public.admins SET user_id = v_uid WHERE id = v_admin_id AND user_id IS NULL;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END IF;

  IF v_admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bu hesap yönetici olarak kayıtlı değil');
  END IF;

  IF p_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı kimliği gerekli');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Kullanıcı bulunamadı');
  END IF;

  v_new_email    := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_new_password := NULLIF(TRIM(COALESCE(p_password, '')), '');

  IF v_new_email IS NULL AND v_new_password IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Güncellenecek bilgi girilmedi');
  END IF;

  -- ---- E-posta güncelleme ----
  IF v_new_email IS NOT NULL THEN
    IF v_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' THEN
      RETURN json_build_object('success', false, 'error', 'Geçerli bir e-posta adresi girin');
    END IF;

    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE LOWER(u.email) = v_new_email AND u.id <> p_user_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor'
      );
    END IF;

    UPDATE auth.users
       SET email                      = v_new_email,
           email_confirmed_at         = COALESCE(email_confirmed_at, NOW()),
           email_change               = '',
           email_change_token_new     = '',
           email_change_token_current = '',
           updated_at                 = NOW()
     WHERE id = p_user_id;

    -- GoTrue kimlik kaydındaki e-postayı da senkronize et
    BEGIN
      UPDATE auth.identities
         SET identity_data = jsonb_set(
               COALESCE(identity_data, '{}'::jsonb),
               '{email}',
               to_jsonb(v_new_email),
               true
             ),
             updated_at = NOW()
       WHERE user_id = p_user_id AND provider = 'email';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    v_email_updated := true;
  END IF;

  -- ---- Şifre güncelleme (bcrypt hash) ----
  IF v_new_password IS NOT NULL THEN
    IF LENGTH(v_new_password) < 6 THEN
      RETURN json_build_object('success', false, 'error', 'Şifre en az 6 karakter olmalıdır');
    END IF;

    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_new_password, extensions.gen_salt('bf')),
           recovery_token     = '',
           recovery_sent_at   = NULL,
           updated_at         = NOW()
     WHERE id = p_user_id;

    v_pass_updated := true;
  END IF;

  -- ---- Uygulama tablolarını senkronize et ----
  IF v_email_updated THEN
    BEGIN
      IF p_merchant_id IS NOT NULL THEN
        UPDATE public.merchants
           SET email = v_new_email, updated_at = NOW()
         WHERE id = p_merchant_id;
      ELSE
        UPDATE public.merchants
           SET email = v_new_email, updated_at = NOW()
         WHERE user_id = p_user_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      UPDATE public.profiles SET email = v_new_email WHERE user_id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ---- İşlem kaydı ----
  v_action := CASE
    WHEN v_email_updated AND v_pass_updated THEN 'merchant_email_password_update'
    WHEN v_pass_updated THEN 'merchant_password_reset'
    ELSE 'merchant_email_update'
  END;

  BEGIN
    INSERT INTO public.admin_action_logs (admin_id, admin_email, target_user_id, action)
    VALUES (v_admin_id, v_admin_email, p_user_id, v_action);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'email_updated', v_email_updated,
    'password_updated', v_pass_updated,
    'email', COALESCE(v_new_email, '')
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Telefon -> GERÇEK giriş e-postası eşlemesi
--    Önceki sürüm uygulama tablosundaki `email` kolonunu döndürüyordu; bu kolon
--    boş veya eski olduğunda giriş `telefon@onkati.local` adresini deniyor ve
--    yeni belirlenen şifreyle giriş yapılamıyordu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean      text;
  v_user_id    uuid;
  v_email      text;
  v_auth_email text;
BEGIN
  v_clean := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF v_clean = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Telefon numarasi gerekli');
  END IF;

  -- Müşteri kaydı
  SELECT c.user_id, c.email INTO v_user_id, v_email
  FROM public.customers c
  WHERE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') = v_clean
  LIMIT 1;

  -- Esnaf kaydı
  IF v_user_id IS NULL THEN
    SELECT m.user_id, m.email INTO v_user_id, v_email
    FROM public.merchants m
    WHERE regexp_replace(COALESCE(m.phone, ''), '[^0-9]', '', 'g') = v_clean
    LIMIT 1;
  END IF;

  -- Her zaman auth.users'taki gerçek giriş e-postasını tercih et
  IF v_user_id IS NOT NULL THEN
    SELECT u.email INTO v_auth_email FROM auth.users u WHERE u.id = v_user_id;
    IF v_auth_email IS NOT NULL AND v_auth_email <> '' THEN
      v_email := v_auth_email;
    END IF;
  END IF;

  -- Uygulama tablolarında bulunamadıysa auth metadata üzerinden dene
  IF v_email IS NULL OR v_email = '' THEN
    SELECT u.email INTO v_email
    FROM auth.users u
    WHERE regexp_replace(COALESCE(u.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g') = v_clean
    LIMIT 1;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kullanici bulunamadi');
  END IF;

  RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$$;

-- ---------------------------------------------------------------------------
-- İzinler
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_esnaf_giris_bilgisi(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_esnaf_giris_guncelle(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_esnaf_giris_bilgisi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_esnaf_giris_guncelle(uuid, uuid, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(TEXT) TO authenticated;

COMMIT;