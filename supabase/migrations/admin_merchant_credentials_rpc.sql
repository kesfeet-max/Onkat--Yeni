-- ============================================================================
-- Admin panelinden esnaf giriş bilgilerini (e-posta / şifre) yönetme RPC'leri
--
-- NEDEN: admin-data Edge Function'ının sunucudaki sürümü eski olduğunda
-- "Gecersiz istek" hatası dönüyordu. Bu migration, aynı işlemi doğrudan
-- veritabanı üzerinden (SECURITY DEFINER) yapabilen RPC'ler ekler.
-- Böylece Edge Function deploy edilmeden de admin paneli çalışır.
--
-- GÜVENLİK: Her iki fonksiyon da çağıranın `admins` tablosunda kayıtlı
-- olmasını zorunlu kılar. Aksi halde işlem yapılmaz.
-- ============================================================================

BEGIN;

-- Şifre hash'lemek için pgcrypto (Supabase'de extensions şemasında bulunur)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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
  v_email            text;
  v_phone            text;
  v_confirmed        timestamptz;
  v_last_sign_in     timestamptz;
BEGIN
  -- Yetki kontrolü: yalnızca adminler
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Admin yetkisi yok');
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
--    Şifre bcrypt ile hashlenerek auth.users'a yazılır.
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
  v_admin_id       uuid;
  v_admin_email    text;
  v_new_email      text;
  v_new_password   text;
  v_email_updated  boolean := false;
  v_pass_updated   boolean := false;
  v_action         text;
BEGIN
  -- Yetki kontrolü: yalnızca adminler
  SELECT a.id, a.email INTO v_admin_id, v_admin_email
  FROM public.admins a
  WHERE a.user_id = auth.uid()
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Admin yetkisi yok');
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

  -- E-posta doğrulama ve güncelleme
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
       SET email                = v_new_email,
           email_confirmed_at   = COALESCE(email_confirmed_at, NOW()),
           email_change         = '',
           email_change_token_new     = '',
           email_change_token_current = '',
           updated_at           = NOW()
     WHERE id = p_user_id;

    v_email_updated := true;
  END IF;

  -- Şifre doğrulama ve güncelleme (bcrypt hash)
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

  -- Uygulama tablolarındaki e-posta kaydını senkronize et (kolon yoksa sessiz geç)
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

  -- İşlem kaydı (tablo yoksa sessizce geçilir)
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

-- Yalnızca oturum açmış kullanıcılar çağırabilir; içeride admin kontrolü yapılır
REVOKE ALL ON FUNCTION public.admin_esnaf_giris_bilgisi(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_esnaf_giris_guncelle(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_esnaf_giris_bilgisi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_esnaf_giris_guncelle(uuid, uuid, text, text) TO authenticated;

COMMIT;