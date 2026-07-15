export type UserRole = 'customer' | 'merchant';

export interface User {
  id: string;
  email?: string;
  phone?: string;
  role: UserRole;
}

export interface CustomerProfile {
  id: string;
  user_id: string;
  phone: string;
  full_name: string;
  points_balance: number;
  device_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MerchantProfile {
  id: string;
  user_id: string;
  store_id: number;
  phone: string;
  full_name: string;
  store_name: string;
  city: string;
  district: string;
  sector: string;
  latitude: number;
  longitude: number;
  total_revenue: number;
  total_points_distributed: number;
  total_customers: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  idempotency_key: string;
  customer_id: string;
  merchant_id: string;
  type: 'earn' | 'spend' | 'cancel';
  amount: number;
  points: number;
  customer_latitude: number | null;
  customer_longitude: number | null;
  distance_verified: boolean;
  status: 'pending' | 'completed' | 'cancelled';
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface TransactionWithDetails extends Transaction {
  merchant?: {
    store_name: string;
    store_id: number;
  };
  customer?: {
    full_name: string;
    phone: string;
  };
}

export interface AuthState {
  user: User | null;
  profile: CustomerProfile | MerchantProfile | null;
  loading: boolean;
  error: string | null;
}

export interface QRData {
  type: 'earn' | 'spend';
  merchant_id: string;
  store_id: number;
  store_name: string;
}

export interface TransactionRequest {
  amount: number;
  merchant_id: string;
  type: 'earn' | 'spend';
  customer_location?: {
    latitude: number;
    longitude: number;
  };
}
