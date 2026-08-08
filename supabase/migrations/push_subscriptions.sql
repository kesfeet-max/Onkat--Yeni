-- Push Abonelik Modülü
-- Müşterilerin push bildirim aboneliklerini saklamak için

BEGIN;

-- Push abonelikleri tablosu
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription_json jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_push_subs_customer_id ON push_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_is_active ON push_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Müşteri kendi aboneliğini görebilir
CREATE POLICY "customers_view_own_push_subs" ON push_subscriptions
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Müşteri abonelik ekleyebilir
CREATE POLICY "customers_insert_push_subs" ON push_subscriptions
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Müşteri kendi aboneliğini güncelleyebilir
CREATE POLICY "customers_update_push_subs" ON push_subscriptions
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Service role erişimi
CREATE POLICY "service_role_push_subs_all" ON push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Push abonelik kaydetme RPC
CREATE OR REPLACE FUNCTION push_abonelik_kaydet(
  p_subscription text,
  p_endpoint text
)
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

  -- Upsert: aynı endpoint varsa güncelle, yoksa ekle
  INSERT INTO push_subscriptions (customer_id, endpoint, subscription_json)
  VALUES (v_customer_id, p_endpoint, p_subscription::jsonb)
  ON CONFLICT (endpoint) DO UPDATE
  SET subscription_json = p_subscription::jsonb,
      is_active = true,
      updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Kampanya push tetikleme RPC (sunucu tarafı bildirim gönderimi için hazırlık)
CREATE OR REPLACE FUNCTION kampanya_push_tetikle(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id uuid;
  v_campaign RECORD;
  v_sub_count integer;
BEGIN
  SELECT id INTO v_merchant_id FROM merchants WHERE user_id = auth.uid();
  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esnaf bulunamadı');
  END IF;

  -- Kampanya bilgilerini al
  SELECT * INTO v_campaign FROM campaigns
  WHERE id = p_campaign_id AND merchant_id = v_merchant_id;

  IF v_campaign IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kampanya bulunamadı');
  END IF;

  -- Hedef müşterilerin aktif push abonelik sayısını döndür
  SELECT COUNT(*) INTO v_sub_count
  FROM push_subscriptions ps
  JOIN campaign_notifications cn ON cn.customer_id = ps.customer_id
  WHERE cn.campaign_id = p_campaign_id
    AND ps.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'campaign_id', p_campaign_id,
    'push_targets', v_sub_count
  );
END;
$$;

COMMIT;