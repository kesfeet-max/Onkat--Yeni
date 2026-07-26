import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Enterprise Supabase Client
 * - Connection pooling optimizasyonu (realtime kanal limiti)
 * - Otomatik token yenileme
 * - Oturum kalıcılığı
 * - Global fetch timeout ile bağlantı kopması önleme
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate limiting — sunucu yükünü azalt
    },
  },
  global: {
    headers: {
      'x-client-info': 'onkati-enterprise/2.0',
    },
    fetch: (url, options = {}) => {
      // Global timeout: 15 saniye — bağlantı takılmalarını önle
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
    },
  },
  db: {
    schema: 'public',
  },
});

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          user_id: string;
          phone: string;
          full_name: string;
          points_balance: number;
          device_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone: string;
          full_name: string;
          points_balance?: number;
          device_id: string;
          is_active?: boolean;
        };
        Update: {
          full_name?: string;
          is_active?: boolean;
        };
      };
      merchants: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          store_id?: number;
          phone: string;
          full_name: string;
          store_name: string;
          city: string;
          district: string;
          sector: string;
          latitude: number;
          longitude: number;
          total_revenue?: number;
          total_points_distributed?: number;
          total_customers?: number;
          is_active?: boolean;
        };
        Update: {
          full_name?: string;
          store_name?: string;
          city?: string;
          district?: string;
          sector?: string;
          latitude?: number;
          longitude?: number;
          is_active?: boolean;
        };
      };
      transactions: {
        Row: {
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
        };
        Insert: never;
        Update: never;
      };
    };
    Functions: {
      calculate_distance: {
        Args: {
          lat1: number;
          lon1: number;
          lat2: number;
          lon2: number;
        };
        Returns: number;
      };
    };
  };
}
