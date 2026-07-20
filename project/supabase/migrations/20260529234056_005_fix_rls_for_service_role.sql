/*
  # Fix RLS Policies for Service Role Access

  1. Problem
    - Edge functions use service role key but RLS blocks inserts
    - Need to allow service role to bypass RLS for customer/merchant creation

  2. Solution
    - Add policies for service_role to insert into customers and merchants
    - Enable service role bypass for all tables
*/

-- Drop restrictive policies
DROP POLICY IF EXISTS "No direct transaction inserts" ON transactions;
DROP POLICY IF EXISTS "No direct transaction updates" ON transactions;
DROP POLICY IF EXISTS "No direct transaction deletes" ON transactions;
DROP POLICY IF EXISTS "No access to idempotency keys" ON idempotency_keys;

-- Allow service role full access to customers
CREATE POLICY "Service role can manage customers"
  ON customers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service role full access to merchants  
CREATE POLICY "Service role can manage merchants"
  ON merchants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service role full access to transactions
CREATE POLICY "Service role can manage transactions"
  ON transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service role full access to idempotency_keys
CREATE POLICY "Service role can manage idempotency keys"
  ON idempotency_keys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service role full access to admins
CREATE POLICY "Service role can manage admins"
  ON admins FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);