-- ============================================================================
-- Ad Soyad ve Telefon Numarası için veritabanı seviyesinde sanitizasyon
--
-- Amaç:
--   1) Ad Soyad alanına e-posta adresi (veya "@" içeren girdi) yazılmasını engellemek
--   2) Telefon numarasını her zaman başında 0 olacak şekilde 11 haneye normalize etmek
--      ve eksik/hatalı uzunluktaki numaraların veritabanına sızmasını engellemek
--
-- Ön yüz doğrulamaları atlatılsa bile (doğrudan API çağrısı vb.) bu tetikleyiciler
-- hatalı verinin tabloya yazılmasını durdurur.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Telefon normalizasyonu: "+90 507 444 55 88" / "5074445588" -> "05074445588"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  -- Rakam dışındaki tüm karakterleri temizle
  v_digits := regexp_replace(p_phone, '\D', '', 'g');

  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  -- Ülke kodu varyasyonlarını ayıkla (0090..., 90...)
  IF left(v_digits, 4) = '0090' THEN
    v_digits := substr(v_digits, 5);
  ELSIF left(v_digits, 2) = '90' AND length(v_digits) > 11 THEN
    v_digits := substr(v_digits, 3);
  END IF;

  -- Baştaki tekrarlı sıfırları teke indir
  v_digits := regexp_replace(v_digits, '^0+', '0');

  -- Başında 0 yoksa otomatik ekle
  IF left(v_digits, 1) <> '0' THEN
    v_digits := '0' || v_digits;
  END IF;

  RETURN left(v_digits, 11);
END;
$$;

-- ---------------------------------------------------------------------------
-- Telefon geçerlilik kontrolü: tam 11 hane, başında 0, ikinci hane 0 değil
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_is_valid_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_phone IS NOT NULL
     AND p_phone ~ '^0[1-9][0-9]{9}$';
$$;

-- ---------------------------------------------------------------------------
-- Ad Soyad alanının e-posta / e-posta benzeri olup olmadığını tespit eder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_is_email_like(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  IF p_value IS NULL THEN
    RETURN false;
  END IF;

  v_text := btrim(p_value);

  IF v_text = '' THEN
    RETURN false;
  END IF;

  -- "@" içeren her girdi e-posta kabul edilir
  IF position('@' IN v_text) > 0 THEN
    RETURN true;
  END IF;

  -- Gizlenmiş "@" varyasyonları: ornek(at)mail.com
  IF v_text ~* '\(\s*at\s*\)|\[\s*at\s*\]' THEN
    RETURN true;
  END IF;

  -- Bilinen e-posta sağlayıcıları
  IF v_text ~* '(gmail|hotmail|outlook|yahoo|icloud|yandex|mynet|proton|windowslive)' THEN
    RETURN true;
  END IF;

  -- Alan adı uzantıları: .com, .net, .org, .tr ...
  IF v_text ~* '\.(com|net|org|edu|gov|info|io|co|tr|de|nl)(\y|$)' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ad Soyad geçerlilik kontrolü: rakam / geçersiz karakter içermemeli
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_is_valid_full_name(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  IF p_value IS NULL THEN
    RETURN false;
  END IF;

  v_text := btrim(regexp_replace(p_value, '\s+', ' ', 'g'));

  IF v_text = '' THEN
    RETURN false;
  END IF;

  IF public.onkati_is_email_like(v_text) THEN
    RETURN false;
  END IF;

  -- Rakam içeremez
  IF v_text ~ '[0-9]' THEN
    RETURN false;
  END IF;

  -- Sadece harf, boşluk, kesme işareti, tire ve nokta kabul edilir
  IF v_text !~ '^[A-Za-zÇĞİÖŞÜçğıöşü\s''’.\-]+$' THEN
    RETURN false;
  END IF;

  -- En az 3 harf içermeli
  IF length(regexp_replace(v_text, '[^A-Za-zÇĞİÖŞÜçğıöşü]', '', 'g')) < 3 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ortak tetikleyici: müşteri / esnaf kayıtlarında ad soyad + telefon sanitizasyonu
--
-- Not: Eski kayıtların bozulmaması için doğrulama yalnızca INSERT sırasında ya da
-- ilgili alan gerçekten değiştirildiğinde uygulanır.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_sanitize_person_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone_changed boolean := true;
  v_name_changed  boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_phone_changed := NEW.phone IS DISTINCT FROM OLD.phone;
    v_name_changed  := NEW.full_name IS DISTINCT FROM OLD.full_name;
  END IF;

  -- ---------------- Telefon ----------------
  IF v_phone_changed THEN
    NEW.phone := public.onkati_normalize_phone(NEW.phone);

    IF NOT public.onkati_is_valid_phone(NEW.phone) THEN
      RAISE EXCEPTION
        'Gecersiz telefon numarasi. Telefon numarasi basinda 0 olacak sekilde 11 haneli olmalidir. Ornek: 05074445588';
    END IF;
  END IF;

  -- ---------------- Ad Soyad ----------------
  IF v_name_changed AND NEW.full_name IS NOT NULL THEN
    NEW.full_name := btrim(regexp_replace(NEW.full_name, '\s+', ' ', 'g'));

    IF public.onkati_is_email_like(NEW.full_name) THEN
      RAISE EXCEPTION 'Ad Soyad alanina e-posta adresi yazilamaz. Lutfen gecerli bir ad ve soyad giriniz.';
    END IF;

    IF NOT public.onkati_is_valid_full_name(NEW.full_name) THEN
      RAISE EXCEPTION 'Gecersiz ad soyad. Lutfen gecerli bir ad ve soyad giriniz.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tetikleyicileri bağla
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_customers_sanitize_person_fields ON public.customers;
CREATE TRIGGER trg_customers_sanitize_person_fields
  BEFORE INSERT OR UPDATE OF phone, full_name ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.onkati_sanitize_person_fields();

DROP TRIGGER IF EXISTS trg_merchants_sanitize_person_fields ON public.merchants;
CREATE TRIGGER trg_merchants_sanitize_person_fields
  BEFORE INSERT OR UPDATE OF phone, full_name ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.onkati_sanitize_person_fields();

-- ---------------------------------------------------------------------------
-- Mevcut kayıtları normalize et (10 haneli numaraların başına 0 eklenir)
-- Hatalı tek bir kayıt tüm işlemi durdurmasın diye satır satır ve korumalı çalışır.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, phone FROM public.customers
    WHERE phone IS NOT NULL
      AND phone <> COALESCE(public.onkati_normalize_phone(phone), phone)
      AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 13
  LOOP
    BEGIN
      UPDATE public.customers
         SET phone = public.onkati_normalize_phone(r.phone)
       WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'customers telefon normalizasyonu atlandi (id=%): %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT id, phone FROM public.merchants
    WHERE phone IS NOT NULL
      AND phone <> COALESCE(public.onkati_normalize_phone(phone), phone)
      AND length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 13
  LOOP
    BEGIN
      UPDATE public.merchants
         SET phone = public.onkati_normalize_phone(r.phone)
       WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'merchants telefon normalizasyonu atlandi (id=%): %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMIT;