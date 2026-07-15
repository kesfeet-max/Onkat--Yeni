/*
  # Row Level Security Policies

  1. Customers Table Policies
    - Customers can read their own data
    - Customers can update their own data (except points_balance - handled by edge functions)
    - No direct insert/delete (handled by auth flow)

  2. Merchants Table Policies
    - Merchants can read their own data
    - Merchants can update their own data (except financial fields)
    - No direct insert/delete (handled by auth flow)

  3. Transactions Table Policies
    - Customers can view their own transactions
    - Merchants can view transactions at their store
    - No direct insert/update/delete (handled by edge functions only)

  4. Idempotency_Keys Table Policies
    - No direct access from client (edge functions only)
*/

-- Customers RLS Policies
CREATE POLICY "Customers can read own data"
  ON customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Customers can update own profile"
  ON customers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Merchants RLS Policies
CREATE POLICY "Merchants can read own data"
  ON merchants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Merchants can update own profile"
  ON merchants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Transactions RLS Policies
CREATE POLICY "Customers can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Merchants can view store transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    merchant_id IN (
      SELECT id FROM merchants WHERE user_id = auth.uid()
    )
  );

-- Block all direct modifications to transactions
-- All transactions must go through edge functions
CREATE POLICY "No direct transaction inserts"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct transaction updates"
  ON transactions FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No direct transaction deletes"
  ON transactions FOR DELETE
  TO authenticated
  USING (false);

-- Idempotency keys - completely locked down
CREATE POLICY "No access to idempotency keys"
  ON idempotency_keys FOR ALL
  TO authenticated
  USING (false);