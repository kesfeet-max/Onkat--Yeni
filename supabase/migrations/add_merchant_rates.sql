-- Merchants tablosuna puan oranı kolonları ekle
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS cash_points_rate NUMERIC(5,2) DEFAULT 7,
  ADD COLUMN IF NOT EXISTS card_points_rate NUMERIC(5,2) DEFAULT 5;

-- Mevcut esnafların oranlarını güncelleme politikası
-- Esnaf kendi satırını güncelleyebilsin
CREATE POLICY "merchants_update_own_rates"
  ON merchants
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());