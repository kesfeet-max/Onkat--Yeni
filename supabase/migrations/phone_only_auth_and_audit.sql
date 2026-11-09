-- ============================================================================
-- Onkatı — Telefonla şifresiz müşteri girişi, numara ile esnaf işlemleri ve
-- şeffaf / değiştirilemez işlem geçmişi.
--
-- Supabase Dashboard > SQL Editor'de BİR KEZ çalıştırın.
--
-- İçerik:
--   1) Google ile giriş kalıntısı RPC'nin kaldırılması
--   2) esnaf_giris_eposta        → esnaf telefon+şifre girişinde gerçek auth e-postasını bulur
--   3) esnaf_musteri_telefon_ile_bul → esnaf, müşteri numarasını yazarak ad soyad + puanı görür
--   4) transaction_audit_logs     → her puan yükleme/harcama anında arka planda loglanır
--   5) İşlem kayıtları silinemez / tutar-puan alanları sonradan değiştirilemez
--   6) musteri_islem_gecmisi      → müşteri hangi işletme, hangi tarih, ne kadar puan görür
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Google ile giriş kaldırıldı
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.onkati_google_profil_hazirla(text);

-- ---------------------------------------------------------------------------
-- Ortak: telefon normalizasyonu (0XXXXXXXXXX)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF v_digits LIKE '0090%' THEN
    v_digits := substr(v_digits, 5);
  ELSIF v_digits LIKE '90%' AND length(v_digits) > 11 THEN
    v_digits := substr(v_digits, 3);
  END IF;

  v_digits := regexp_replace(v_digits, '^0+', '');
  IF v_digits = '' THEN
    RETURN '';
  END IF;

  RETURN left('0' || v_digits, 11);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Esnaf girişi için auth e-postası (kullanıcıya gösterilmez)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.esnaf_giris_eposta(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_phone text := public.onkati_normalize_phone(p_phone);
  v_email text;
BEGIN
  SELECT u.email
    INTO v_email
    FROM public.merchants m
    JOIN auth.users u ON u.id = m.user_id
   WHERE m.phone = v_phone
   LIMIT 1;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  RETURN jsonb_build_object('success', true, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.esnaf_giris_eposta(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Esnaf: müşteri numarası ile müşteri bul
--    Ad soyad + bu dükkandaki güncel puan döner. Telefonun tamamı geri
--    gönderilmez (esnaf zaten numarayı kendisi yazdı).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.esnaf_musteri_telefon_ile_bul(text);

CREATE OR REPLACE FUNCTION public.esnaf_musteri_telefon_ile_bul(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone    text := public.onkati_normalize_phone(p_phone);
  v_merchant RECORD;
  v_customer RECORD;
  v_balance  numeric := 0;
BEGIN
  SELECT id, store_name, is_active
    INTO v_merchant
    FROM public.merchants
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF v_merchant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf hesabı bulunamadı');
  END IF;

  IF v_phone !~ '^0[1-9][0-9]{9}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçerli bir telefon numarası girin (Örn: 05074445588)');
  END IF;

  SELECT id, full_name, is_active
    INTO v_customer
    FROM public.customers
   WHERE phone = v_phone
   LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bu numarayla kayıtlı müşteri bulunamadı. Müşteri sadece ad soyad ve numarasıyla saniyeler içinde kayıt olabilir.'
    );
  END IF;

  IF v_customer.is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Müşteri hesabı askıya alınmış');
  END IF;

  SELECT COALESCE(balance, 0)
    INTO v_balance
    FROM public.store_customer_balances
   WHERE customer_id = v_customer.id
     AND merchant_id = v_merchant.id;

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer.id,
    'customer_name', v_customer.full_name,
    'store_balance', COALESCE(v_balance, 0),
    'store_name', v_merchant.store_name,
    'phone_masked', left(v_phone, 4) || ' *** ** ' || right(v_phone, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.esnaf_musteri_telefon_ile_bul(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. İşlem denetim kaydı (audit log)
--    Yalnızca tetikleyiciler yazar; kimse ekleyemez/değiştiremez/silemez.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  customer_id    uuid,
  merchant_id    uuid,
  action         text NOT NULL,          -- 'created' | 'status_changed'
  tx_type        text,                   -- 'earn' | 'spend' | 'cancel'
  amount         numeric(12, 2),
  points         numeric(12, 2),
  status         text,
  previous_status text,
  actor_user_id  uuid,
  cashier_name   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_audit_customer ON public.transaction_audit_logs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_audit_merchant ON public.transaction_audit_logs(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_audit_transaction ON public.transaction_audit_logs(transaction_id);

ALTER TABLE public.transaction_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_customer_read_own" ON public.transaction_audit_logs;
CREATE POLICY "audit_customer_read_own" ON public.transaction_audit_logs
  FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "audit_merchant_read_own" ON public.transaction_audit_logs;
CREATE POLICY "audit_merchant_read_own" ON public.transaction_audit_logs
  FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "audit_admin_read_all" ON public.transaction_audit_logs;
CREATE POLICY "audit_admin_read_all" ON public.transaction_audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()));

GRANT SELECT ON public.transaction_audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.onkati_log_transaction_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.transaction_audit_logs (
      transaction_id, customer_id, merchant_id, action, tx_type,
      amount, points, status, actor_user_id, cashier_name
    ) VALUES (
      NEW.id, NEW.customer_id, NEW.merchant_id, 'created', NEW.type::text,
      NEW.amount, NEW.points, NEW.status::text, auth.uid(), to_jsonb(NEW) ->> 'cashier_name'
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.transaction_audit_logs (
      transaction_id, customer_id, merchant_id, action, tx_type,
      amount, points, status, previous_status, actor_user_id, cashier_name
    ) VALUES (
      NEW.id, NEW.customer_id, NEW.merchant_id, 'status_changed', NEW.type::text,
      NEW.amount, NEW.points, NEW.status::text, OLD.status::text, auth.uid(), to_jsonb(NEW) ->> 'cashier_name'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_audit ON public.transactions;
CREATE TRIGGER trg_transactions_audit
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.onkati_log_transaction_audit();

-- ---------------------------------------------------------------------------
-- 5. İşlem kayıtları korunur: silinemez, tutar/puan/taraflar değiştirilemez.
--    (Yalnızca durum alanı — örn. iptal — değişebilir ve bu da loglanır.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onkati_protect_transaction_log()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'İşlem kayıtları silinemez';
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.merchant_id IS DISTINCT FROM OLD.merchant_id
     OR NEW.type        IS DISTINCT FROM OLD.type
     OR NEW.amount      IS DISTINCT FROM OLD.amount
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'İşlem kayıtları sonradan değiştirilemez';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_protect ON public.transactions;
CREATE TRIGGER trg_transactions_protect
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.onkati_protect_transaction_log();

-- ---------------------------------------------------------------------------
-- 6. Müşteri işlem geçmişi (işletme adı ile birlikte, RLS'ten bağımsız)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.musteri_islem_gecmisi(integer);

CREATE OR REPLACE FUNCTION public.musteri_islem_gecmisi(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_list        jsonb;
BEGIN
  SELECT id INTO v_customer_id
    FROM public.customers
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Müşteri hesabı bulunamadı');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO v_list
    FROM (
      SELECT
        t.id,
        t.merchant_id,
        t.type::text   AS type,
        t.amount,
        t.points,
        t.status::text AS status,
        t.created_at,
        m.store_name,
        to_jsonb(t) ->> 'cashier_name' AS cashier_name
        FROM public.transactions t
        LEFT JOIN public.merchants m ON m.id = t.merchant_id
       WHERE t.customer_id = v_customer_id
         AND t.status = 'completed'
       ORDER BY t.created_at DESC
       LIMIT GREATEST(LEAST(COALESCE(p_limit, 100), 500), 1)
    ) x;

  RETURN jsonb_build_object('success', true, 'transactions', v_list);
END;
$$;

GRANT EXECUTE ON FUNCTION public.musteri_islem_gecmisi(integer) TO authenticated;

COMMIT;
