-- Admin islem kayitlari (esnaf giris bilgisi guncellemeleri vb.)
BEGIN;

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID,
  admin_email TEXT,
  target_user_id UUID,
  action TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_action_logs_target_idx ON admin_action_logs(target_user_id);
CREATE INDEX IF NOT EXISTS admin_action_logs_created_idx ON admin_action_logs(created_at DESC);

ALTER TABLE admin_action_logs ENABLE ROW LEVEL SECURITY;

-- Sadece admins tablosunda kayitli kullanicilar okuyabilir
DROP POLICY IF EXISTS "admins_read_action_logs" ON admin_action_logs;
CREATE POLICY "admins_read_action_logs" ON admin_action_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));

COMMIT;