/*
  # Create Requests Table

  1. New Tables
    - `requests`
      - `id` (uuid, primary key)
      - `store_id` (integer, foreign key to merchants.store_id)
      - `customer_id` (uuid, foreign key to customers.id)
      - `status` (text - 'pending', 'approved', 'rejected')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `requests` table
    - Customers can view and create their own requests
    - Service role can manage all requests
    - Merchants can view requests for their store
*/

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_requests_customer_id ON requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_store_id ON requests(store_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

-- Enable RLS
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Policy: Customers can view their own requests
CREATE POLICY "Customers can view own requests"
  ON requests FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

-- Policy: Customers can create requests
CREATE POLICY "Customers can create requests"
  ON requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- Policy: Service role can manage all requests
CREATE POLICY "Service role can manage all requests"
  ON requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Merchants can view requests for their store
CREATE POLICY "Merchants can view store requests"
  ON requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM merchants
      WHERE merchants.store_id = requests.store_id
      AND merchants.user_id = auth.uid()
    )
  );

-- Update trigger for updated_at
CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
