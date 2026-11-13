-- Ücretsiz deneme süresi 30 günden 14 güne indirildi.
-- Yalnızca bu betik çalıştırıldıktan SONRA kayıt olan esnafları etkiler;
-- mevcut esnafların deneme bitiş tarihleri değiştirilmez.
CREATE OR REPLACE FUNCTION set_merchant_trial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := COALESCE(NEW.created_at, now()) + interval '14 days';
  END IF;
  IF NEW.subscription_status IS NULL THEN
    NEW.subscription_status := 'trial';
  END IF;
  NEW.is_active := true;
  RETURN NEW;
END;
$$;
