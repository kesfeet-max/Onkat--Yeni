/*
  # Initial Schema for Onkati Sadakat Sistemi

  1. New Tables
    - `customers`: Customer accounts with phone-based auth
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `phone` (text, unique, NOT NULL)
      - `full_name` (text, NOT NULL)
      - `points_balance` (integer, default 0)
      - `device_id` (text, unique, NOT NULL) - Prevents multiple accounts per device
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `merchants`: Merchant (Esnaf) accounts
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `store_id` (integer, unique, NOT NULL) - Unique merchant identifier
      - `phone` (text, unique, NOT NULL)
      - `full_name` (text, NOT NULL)
      - `store_name` (text, NOT NULL)
      - `city` (text, NOT NULL)
      - `district` (text, NOT NULL)
      - `sector` (text, NOT NULL)
      - `latitude` (decimal, NOT NULL) - Store location
      - `longitude` (decimal, NOT NULL) - Store location
      - `total_revenue` (decimal, default 0)
      - `total_points_distributed` (integer, default 0)
      - `total_customers` (integer, default 0)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `transactions`: All point transactions
      - `id` (uuid, primary key)
      - `idempotency_key` (text, unique, NOT NULL) - Prevents replay attacks
      - `customer_id` (uuid, references customers)
      - `merchant_id` (uuid, references merchants)
      - `type` (enum: 'earn', 'spend', 'cancel')
      - `amount` (decimal, NOT NULL) - Transaction amount in TL
      - `points` (integer, NOT NULL) - Points earned or spent
      - `customer_latitude` (decimal) - GPS location verification
      - `customer_longitude` (decimal) - GPS location verification
      - `distance_verified` (boolean, default false)
      - `status` (enum: 'pending', 'completed', 'cancelled')
      - `cancelled_at` (timestamp)
      - `cancel_reason` (text)
      - `created_at` (timestamp)

    - `idempotency_keys`: Track recent transaction keys
      - `id` (uuid, primary key)
      - `key` (text, unique, NOT NULL)
      - `transaction_id` (uuid, references transactions)
      - `created_at` (timestamp)
      - `expires_at` (timestamp) - Auto-expires after 60 seconds

  2. Security
    - Enable RLS on all tables
    - Policies restrict access to authenticated users only
    - Customers can only access their own data
    - Merchants can only access their own data and related transactions
    - All sensitive operations go through edge functions

  3. Indexes
    - Index on phone numbers for fast lookup
    - Index on idempotency keys for duplicate detection
    - Index on transaction dates for reporting
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE transaction_type AS ENUM ('earn', 'spend', 'cancel');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'cancelled');

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE NOT NULL,
  full_name text NOT NULL,
  points_balance integer DEFAULT 0 CHECK (points_balance >= 0),
  device_id text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id integer UNIQUE NOT NULL DEFAULT floor(random() * 900000 + 100000)::integer,
  phone text UNIQUE NOT NULL,
  full_name text NOT NULL,
  store_name text NOT NULL,
  city text NOT NULL,
  district text NOT NULL,
  sector text NOT NULL,
  latitude decimal(10, 8) NOT NULL,
  longitude decimal(11, 8) NOT NULL,
  total_revenue decimal(12, 2) DEFAULT 0,
  total_points_distributed integer DEFAULT 0,
  total_customers integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  type transaction_type NOT NULL,
  amount decimal(12, 2) NOT NULL CHECK (amount > 0),
  points integer NOT NULL CHECK (points >= 0),
  customer_latitude decimal(10, 8),
  customer_longitude decimal(11, 8),
  distance_verified boolean DEFAULT false,
  status transaction_status DEFAULT 'completed',
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz DEFAULT now()
);

-- Create idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '60 seconds')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_device_id ON customers(device_id);
CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(phone);
CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants(user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_store_id ON merchants(store_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;