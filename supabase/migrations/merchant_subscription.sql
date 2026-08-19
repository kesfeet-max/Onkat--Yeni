-- Onkati: Esnaf abonelik & Havale/EFT altyapısı
-- Kredi kartı / online ödeme YOKTUR. Ödemeler yalnızca Havale/EFT ile alınır,
-- admin havale kontrolünden sonra is_active alanını true yapar.

BEGIN;

-- 1) Abonelik alanları
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS subscription_paid_until timestamptz;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS last_payment_approved_at timestamptz;

-- 2) Mevcut kayıtlar için 30 günlük deneme süresi
UPDATE merchants
SET trial_ends_at = created_at + interval '30 days'
WHERE trial_ends_at IS NULL;

-- 3) Yeni kayıtlarda deneme süresi otomatik atanır (kayıtta aktif başlar)
CREATE OR REPLACE FUNCTION set_merchant_trial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := COALESCE(NEW.created_at, now()) + interval '30 days';
  END IF;
  IF NEW.subscription_status IS NULL THEN
    NEW.subscription_status := 'trial';
  END IF;
  NEW.is_active := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_merchant_trial ON merchants;
CREATE TRIGGER trg_set_merchant_trial
BEFORE INSERT ON merchants
FOR EACH ROW EXECUTE FUNCTION set_merchant_trial();

-- 4) Deneme süresi bitmiş ve ödemesi admin tarafından onaylanmamış esnafları pasife çek
CREATE OR REPLACE FUNCTION deactivate_expired_merchants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE merchants
  SET is_active = false,
      subscription_status = 'expired',
      updated_at = now()
  WHERE is_active = true
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    AND (subscription_paid_until IS NULL OR subscription_paid_until < now());

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION deactivate_expired_merchants() TO authenticated, service_role;

-- 5) Admin havale onayı: hesabı aktif eder ve 1 ay abonelik yazar
CREATE OR REPLACE FUNCTION approve_merchant_payment(p_store_id integer, p_months integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  found integer;
BEGIN
  UPDATE merchants
  SET is_active = true,
      subscription_status = 'active',
      last_payment_approved_at = now(),
      subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, now()), now())
                                + (COALESCE(p_months, 1) || ' months')::interval,
      updated_at = now()
  WHERE store_id = p_store_id;

  GET DIAGNOSTICS found = ROW_COUNT;
  RETURN found > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_merchant_payment(integer, integer) TO authenticated, service_role;

-- 6) QR / puan islemi guvenlik kontrolu:
-- Pasif veya suresi dolmus esnaf icin transactions tablosuna kayit engellenir.
-- Bu trigger sayesinde hangi RPC (islem_puan_yukle / islem_puan_harca) kullanilirsa
-- kullanilsin, yetkisiz esnaf islem yapamaz.
CREATE OR REPLACE FUNCTION enforce_merchant_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  m_active boolean;
  m_trial timestamptz;
  m_paid timestamptz;
BEGIN
  SELECT is_active, trial_ends_at, subscription_paid_until
  INTO m_active, m_trial, m_paid
  FROM merchants
  WHERE id = NEW.merchant_id;

  IF m_active IS NULL THEN
    RAISE EXCEPTION 'Gecersiz esnaf';
  END IF;

  -- Deneme suresi bitmis ve odemesi onaylanmamissa otomatik pasife cek
  IF m_trial IS NOT NULL AND m_trial < now() AND (m_paid IS NULL OR m_paid < now()) THEN
    UPDATE merchants
    SET is_active = false,
        subscription_status = 'expired',
        updated_at = now()
    WHERE id = NEW.merchant_id AND is_active = true;

    RAISE EXCEPTION 'Hesabınızın kullanım süresi dolmuştur, lütfen ödeme yapınız';
  END IF;

  IF m_active = false THEN
    RAISE EXCEPTION 'Hesabınızın kullanım süresi dolmuştur, lütfen ödeme yapınız';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_merchant_subscription ON transactions;
CREATE TRIGGER trg_enforce_merchant_subscription
BEFORE INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION enforce_merchant_subscription();

CREATE INDEX IF NOT EXISTS merchants_store_id_idx ON merchants(store_id);
CREATE INDEX IF NOT EXISTS merchants_trial_ends_idx ON merchants(trial_ends_at);

COMMIT;