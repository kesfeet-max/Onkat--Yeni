-- Yasal onay kayıtları tablosu
CREATE TABLE IF NOT EXISTS consent_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  kvkk_approved_at TIMESTAMPTZ NOT NULL,
  terms_approved_at TIMESTAMPTZ,
  esnaf_terms_approved_at TIMESTAMPTZ,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS consent_logs_user_idx ON consent_logs(user_id);

-- RLS
ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;

-- Sadece service role ekleyebilir (edge function)
CREATE POLICY "service_role_insert_consent" ON consent_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- Kullanıcı kendi kayıtlarını görebilir
CREATE POLICY "users_read_own_consent" ON consent_logs
  FOR SELECT USING (auth.uid() = user_id);