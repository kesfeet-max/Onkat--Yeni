/*
  # Helper Functions for Onkati System

  1. Distance Calculation (Haversine formula)
    - Calculate distance between two GPS coordinates
    - Used to verify customer is at store location

  2. Cleanup Functions
    - Auto-delete expired idempotency keys
    - Run periodically via cron

  3. Transaction Functions
    - Atomic operations for point earn/spend
    - Handle all data integrity checks
*/

-- Function to calculate distance between two coordinates (in meters)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 decimal,
  lon1 decimal,
  lat2 decimal,
  lon2 decimal
) RETURNS decimal AS $$
DECLARE
  earth_radius decimal := 6371000; -- Earth radius in meters
  dlat decimal;
  dlon decimal;
  a decimal;
  c decimal;
BEGIN
  -- Convert to radians
  dlat := radians(lat2) - radians(lat1);
  dlon := radians(lon2) - radians(lon1);
  
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  
  RETURN earth_radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to clean up expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to clean up on insert (simple approach)
CREATE OR REPLACE FUNCTION clean_idempotency_before_insert()
RETURNS trigger AS $$
BEGIN
  -- Clean expired keys
  PERFORM cleanup_expired_idempotency_keys();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS clean_idempotency_trigger ON idempotency_keys;
CREATE TRIGGER clean_idempotency_trigger
  BEFORE INSERT ON idempotency_keys
  EXECUTE FUNCTION clean_idempotency_before_insert();

-- Function to update customer points atomically
CREATE OR REPLACE FUNCTION update_customer_points(
  p_customer_id uuid,
  p_points_delta integer
) RETURNS boolean AS $$
DECLARE
  new_balance integer;
BEGIN
  -- Update points balance and return new balance
  UPDATE customers
  SET 
    points_balance = points_balance + p_points_delta,
    updated_at = now()
  WHERE id = p_customer_id
  RETURNING points_balance INTO new_balance;
  
  -- Check if balance is valid (not negative)
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient points balance';
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update merchant stats after transaction
CREATE OR REPLACE FUNCTION update_merchant_stats(
  p_merchant_id uuid,
  p_amount decimal,
  p_points integer,
  p_is_new_customer boolean DEFAULT false
) RETURNS void AS $$
BEGIN
  UPDATE merchants
  SET 
    total_revenue = total_revenue + p_amount,
    total_points_distributed = total_points_distributed + p_points,
    total_customers = CASE 
      WHEN p_is_new_customer THEN total_customers + 1 
      ELSE total_customers 
    END,
    updated_at = now()
  WHERE id = p_merchant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update timestamps on customers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();