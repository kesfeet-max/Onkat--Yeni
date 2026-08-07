-- Kampanya & Bildirim Modülü
-- Esnafların müşterilerine kampanya/bildirim göndermesi için tablo yapısı

BEGIN;

-- Kampanyalar tablosu
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_audience text NOT NULL DEFAULT 'all_customers', -- 'all_customers' | 'inactive_30_days'
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Kampanya bildirimleri — hangi müşteriye gönderildi
CREATE TABLE IF NOT EXISTS campaign_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_campaigns_merchant_id ON campaigns(merchant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_customer_id ON campaign_notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_campaign_id ON campaign_notifications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_notifications_is_read ON campaign_notifications(is_read);

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_notifications ENABLE ROW LEVEL SECURITY;

-- Esnaf kendi kampanyalarını görebilir
CREATE POLICY "merchants_view_own_campaigns" ON campaigns
  FOR SELECT USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- Esnaf kampanya oluşturabilir
CREATE POLICY "merchants_insert_campaigns" ON campaigns
  FOR INSERT WITH CHECK (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- Esnaf kendi kampanyalarını güncelleyebilir
CREATE POLICY "merchants_update_own_campaigns" ON campaigns
  FOR UPDATE USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- Esnaf kendi kampanyalarını silebilir
CREATE POLICY "merchants_delete_own_campaigns" ON campaigns
  FOR DELETE USING (
    merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())
  );

-- Müşteriler kendilerine gelen bildirimleri görebilir
CREATE POLICY "customers_view_own_notifications" ON campaign_notifications
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Müşteriler bildirimlerini okundu olarak işaretleyebilir
CREATE POLICY "customers_update_own_notifications" ON campaign_notifications
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Service role her şeyi yapabilir (edge function'lar için)
CREATE POLICY "service_role_campaigns_all" ON campaigns
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_notifications_all" ON campaign_notifications
  FOR ALL USING (auth.role() = 'service_role');

-- Kampanya oluşturma RPC (limit kontrolü dahil)
CREATE OR REPLACE FUNCTION kampanya_olustur(
  p_title text,
  p_description text DEFAULT '',
  p_target_audience text DEFAULT 'all_customers',
  p_starts_at timestamptz DEFAULT now(),
  p_ends_at timestamptz DEFAULT now() + interval '7 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
  v_month_start timestamptz;
  v_month_count integer;
  v_campaign_id uuid;
  v_customer_record RECORD;
  v_notification_count integer := 0;
BEGIN
  -- Esnaf ID'sini al
  SELECT id INTO v_merchant_id FROM merchants WHERE user_id = auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  -- Aylık limit kontrolü (takvim ayı başlangıcı)
  v_month_start := date_trunc('month', now());
  SELECT COUNT(*) INTO v_month_count
  FROM campaigns
  WHERE merchant_id = v_merchant_id
    AND created_at >= v_month_start;

  IF v_month_count >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aylık 5 bildirim limitinize ulaştınız. Yeni hakkınız önümüzdeki ay tanımlanacaktır.', 'monthly_used', v_month_count);
  END IF;

  -- Kampanyayı oluştur
  INSERT INTO campaigns (merchant_id, title, description, target_audience, starts_at, ends_at)
  VALUES (v_merchant_id, p_title, p_description, p_target_audience, p_starts_at, p_ends_at)
  RETURNING id INTO v_campaign_id;

  -- Hedef müşterilere bildirim gönder
  IF p_target_audience = 'inactive_30_days' THEN
    -- Son 30 gündür gelmeyen müşteriler
    FOR v_customer_record IN
      SELECT DISTINCT t.customer_id
      FROM transactions t
      WHERE t.merchant_id = v_merchant_id
        AND t.status = 'completed'
        AND t.customer_id NOT IN (
          SELECT DISTINCT t2.customer_id
          FROM transactions t2
          WHERE t2.merchant_id = v_merchant_id
            AND t2.status = 'completed'
            AND t2.created_at >= now() - interval '30 days'
        )
    LOOP
      INSERT INTO campaign_notifications (campaign_id, customer_id)
      VALUES (v_campaign_id, v_customer_record.customer_id);
      v_notification_count := v_notification_count + 1;
    END LOOP;
  ELSE
    -- Tüm müşteriler (en az 1 kez alışveriş yapmış)
    FOR v_customer_record IN
      SELECT DISTINCT t.customer_id
      FROM transactions t
      WHERE t.merchant_id = v_merchant_id
        AND t.status = 'completed'
    LOOP
      INSERT INTO campaign_notifications (campaign_id, customer_id)
      VALUES (v_campaign_id, v_customer_record.customer_id);
      v_notification_count := v_notification_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', v_campaign_id,
    'notifications_sent', v_notification_count,
    'monthly_used', v_month_count + 1,
    'monthly_remaining', 4 - v_month_count
  );
END;
$$;

-- Esnaf kampanya listesi RPC
CREATE OR REPLACE FUNCTION kampanya_listele()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
  v_campaigns jsonb;
  v_month_start timestamptz;
  v_month_count integer;
BEGIN
  SELECT id INTO v_merchant_id FROM merchants WHERE user_id = auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  v_month_start := date_trunc('month', now());
  SELECT COUNT(*) INTO v_month_count
  FROM campaigns
  WHERE merchant_id = v_merchant_id
    AND created_at >= v_month_start;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'description', c.description,
      'target_audience', c.target_audience,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at,
      'is_active', c.is_active,
      'created_at', c.created_at,
      'notification_count', (SELECT COUNT(*) FROM campaign_notifications cn WHERE cn.campaign_id = c.id)
    ) ORDER BY c.created_at DESC
  ), '[]'::jsonb) INTO v_campaigns
  FROM campaigns c
  WHERE c.merchant_id = v_merchant_id;

  RETURN jsonb_build_object(
    'success', true,
    'campaigns', v_campaigns,
    'monthly_used', v_month_count,
    'monthly_remaining', 5 - v_month_count
  );
END;
$$;

-- Kampanya pasife alma / silme RPC
CREATE OR REPLACE FUNCTION kampanya_durum_degistir(
  p_campaign_id uuid,
  p_is_active boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
BEGIN
  SELECT id INTO v_merchant_id FROM merchants WHERE user_id = auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  UPDATE campaigns
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_campaign_id AND merchant_id = v_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kampanya bulunamadı');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Kampanya silme RPC
CREATE OR REPLACE FUNCTION kampanya_sil(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
BEGIN
  SELECT id INTO v_merchant_id FROM merchants WHERE user_id = auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  DELETE FROM campaigns WHERE id = p_campaign_id AND merchant_id = v_merchant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kampanya bulunamadı');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Müşteri bildirimlerini getir RPC
CREATE OR REPLACE FUNCTION musteri_bildirimleri_getir()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
  v_notifications jsonb;
  v_unread_count integer;
BEGIN
  SELECT id INTO v_customer_id FROM customers WHERE user_id = auth.uid();
  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Müşteri bulunamadı');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', cn.id,
      'campaign_id', cn.campaign_id,
      'title', c.title,
      'description', c.description,
      'store_name', m.store_name,
      'starts_at', c.starts_at,
      'ends_at', c.ends_at,
      'is_active', c.is_active,
      'is_read', cn.is_read,
      'created_at', cn.created_at
    ) ORDER BY cn.created_at DESC
  ), '[]'::jsonb) INTO v_notifications
  FROM campaign_notifications cn
  JOIN campaigns c ON c.id = cn.campaign_id
  JOIN merchants m ON m.id = c.merchant_id
  WHERE cn.customer_id = v_customer_id
    AND c.is_active = true;

  SELECT COUNT(*) INTO v_unread_count
  FROM campaign_notifications cn
  JOIN campaigns c ON c.id = cn.campaign_id
  WHERE cn.customer_id = v_customer_id
    AND cn.is_read = false
    AND c.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'notifications', v_notifications,
    'unread_count', v_unread_count
  );
END;
$$;

-- Bildirim okundu işaretle RPC
CREATE OR REPLACE FUNCTION bildirim_okundu(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT id INTO v_customer_id FROM customers WHERE user_id = auth.uid();
  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Müşteri bulunamadı');
  END IF;

  UPDATE campaign_notifications
  SET is_read = true, read_at = now()
  WHERE id = p_notification_id AND customer_id = v_customer_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;