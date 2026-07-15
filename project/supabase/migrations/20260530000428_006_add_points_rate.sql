/*
  # Add Points Rate Column to Merchants

  1. New Column
    - `points_rate` (integer, default 7)
    - Esnaf'ın puan yüzdesi (1-25 arası)
  
  2. Purpose
    - Her esnaf kendi puan oranını belirleyebilir
    - Müşteriye verilecek puan = tutar * (points_rate / 100)
*/

ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS points_rate integer DEFAULT 7 
CHECK (points_rate >= 1 AND points_rate <= 25);

COMMENT ON COLUMN merchants.points_rate IS 'Esnafın belirlediği puan yüzdesi (1-25%)';