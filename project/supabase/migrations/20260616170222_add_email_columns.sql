-- Add email column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;

-- Add email column to merchants table  
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email TEXT;

-- Make device_id nullable (allow multiple accounts per device)
ALTER TABLE customers ALTER COLUMN device_id DROP NOT NULL;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);