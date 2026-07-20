/*
  # Security Fixes

  1. Security Issues Fixed
    - Remove mutable search_path from all functions
    - Restrict SECURITY DEFINER function permissions
    - Only service_role can execute critical functions
  
  2. Functions Updated
    - update_updated_at_column - SET search_path to none
    - update_merchant_stats - SET search_path to none, SECURITY INVOKER
    - calculate_distance - SET search_path to none
    - cleanup_expired_idempotency_keys - REVOKE anon/authenticated, SET search_path to none
    - clean_idempotency_before_insert - SET search_path to none
    - update_customer_points - REVOKE anon/authenticated, SET search_path to none
  
  3. Notes
    - Functions now use SECURITY INVOKER instead of DEFINER
    - search_path is explicitly set to empty to prevent injection
    - Only service_role can execute critical RPC functions
*/

-- Drop triggers and functions in correct order
DROP TRIGGER IF EXISTS clean_idempotency_trigger ON idempotency_keys;
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;

DROP FUNCTION IF EXISTS public.clean_idempotency_before_insert();
DROP FUNCTION IF EXISTS public.update_updated_at_column();
DROP FUNCTION IF EXISTS public.update_merchant_stats(uuid, numeric, integer, boolean);
DROP FUNCTION IF EXISTS public.calculate_distance(numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.cleanup_expired_idempotency_keys();
DROP FUNCTION IF EXISTS public.update_customer_points(uuid, integer);

-- Recreate all functions with proper security settings

-- 1. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2. update_merchant_stats
CREATE OR REPLACE FUNCTION public.update_merchant_stats(
  p_merchant_id uuid,
  p_amount numeric,
  p_points integer,
  p_is_new_customer boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE merchants
  SET total_revenue = total_revenue + p_amount,
      total_points_distributed = total_points_distributed + p_points,
      total_customers = CASE WHEN p_is_new_customer THEN total_customers + 1 ELSE total_customers END,
      updated_at = NOW()
  WHERE id = p_merchant_id;
END;
$$;

-- 3. calculate_distance
CREATE OR REPLACE FUNCTION public.calculate_distance(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  earth_radius numeric := 6371;
  lat1_rad numeric;
  lat2_rad numeric;
  delta_lat numeric;
  delta_lon numeric;
  a numeric;
  c numeric;
BEGIN
  lat1_rad := RADIANS(lat1);
  lat2_rad := RADIANS(lat2);
  delta_lat := RADIANS(lat2 - lat1);
  delta_lon := RADIANS(lon2 - lon1);
  
  a := SIN(delta_lat/2) * SIN(delta_lat/2) +
       COS(lat1_rad) * COS(lat2_rad) * SIN(delta_lon/2) * SIN(delta_lon/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  
  RETURN earth_radius * c;
END;
$$;

-- 4. cleanup_expired_idempotency_keys
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM idempotency_keys
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 5. clean_idempotency_before_insert
CREATE OR REPLACE FUNCTION public.clean_idempotency_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM idempotency_keys
  WHERE created_at < NOW() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$;

-- 6. update_customer_points
CREATE OR REPLACE FUNCTION public.update_customer_points(
  p_customer_id uuid,
  p_points_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE customers
  SET points_balance = points_balance + p_points_delta,
      updated_at = NOW()
  WHERE id = p_customer_id;
END;
$$;

-- Recreate triggers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER clean_idempotency_trigger BEFORE INSERT ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.clean_idempotency_before_insert();

-- Revoke public execute permissions on critical functions and grant to service_role only
REVOKE EXECUTE ON FUNCTION public.update_merchant_stats(uuid, numeric, integer, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_merchant_stats(uuid, numeric, integer, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_customer_points(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_points(uuid, integer) TO service_role;
