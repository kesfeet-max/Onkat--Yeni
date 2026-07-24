import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User, CustomerProfile, MerchantProfile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | MerchantProfile | null;
  userRole: UserRole | null;
  loading: boolean;
  error: string | null;
  signInWithPhone: (phone: string, password: string) => Promise<{ error?: string }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | MerchantProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  const fetchProfile = useCallback(async (userId: string): Promise<CustomerProfile | MerchantProfile | null> => {
    if (fetchingRef.current) return null;
    fetchingRef.current = true;

    try {
      // Müşteri profili — güvenli kolon seçimi
      const { data: customerData, error: custErr } = await supabase
        .from('customers')
        .select('id, user_id, full_name, phone, is_active, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!custErr && customerData) {
        const safeCustomer: CustomerProfile = {
          id: customerData.id,
          user_id: customerData.user_id,
          full_name: customerData.full_name || 'Müşteri',
          phone: customerData.phone || '',
          email: '',
          points_balance: 0,
          device_id: '',
          is_active: customerData.is_active ?? true,
          created_at: customerData.created_at || '',
          updated_at: '',
        };
        if (mountedRef.current) setUserRole('customer');
        return safeCustomer;
      }

      // Esnaf profili
      const { data: merchantData, error: merchErr } = await supabase
        .from('merchants')
        .select('id, user_id, store_id, store_name, full_name, phone, city, district, sector, is_active, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!merchErr && merchantData) {
        const safeMerchant: MerchantProfile = {
          id: merchantData.id,
          user_id: merchantData.user_id,
          store_id: merchantData.store_id || 0,
          store_name: merchantData.store_name || '',
          full_name: merchantData.full_name || 'Esnaf',
          phone: merchantData.phone || '',
          city: merchantData.city || '',
          district: merchantData.district || '',
          sector: merchantData.sector || '',
          latitude: 0,
          longitude: 0,
          total_revenue: 0,
          total_points_distributed: 0,
          total_customers: 0,
          is_active: merchantData.is_active ?? true,
          created_at: merchantData.created_at || '',
          updated_at: '',
        };
        if (mountedRef.current) setUserRole('merchant');
        return safeMerchant;
      }

      // Her iki tablo da sonuç vermedi — logla
      if (custErr) console.warn('Customer profile RLS/error:', custErr.message);
      if (merchErr) console.warn('Merchant profile RLS/error:', merchErr.message);

      return null;
    } catch (err) {
      console.error('Profile fetch unexpected error:', err);
      return null;
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setUserRole(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mountedRef.current) {
          const authUser: User = {
            id: session.user.id,
            email: session.user.email,
            phone: session.user.user_metadata?.phone,
            role: session.user.user_metadata?.role,
          };
          setUser(authUser);

          const userProfile = await fetchProfile(session.user.id);
          if (mountedRef.current) {
            setProfile(userProfile);
            if (!userProfile && session.user.user_metadata?.role) {
              setUserRole(session.user.user_metadata.role as UserRole);
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mountedRef.current) setError('Kimlik doğrulama hatası');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setUserRole(null);
      } else if (event === 'SIGNED_IN' && session?.user) {
        const authUser: User = {
          id: session.user.id,
          email: session.user.email,
          phone: session.user.user_metadata?.phone,
          role: session.user.user_metadata?.role,
        };
        setUser(authUser);
        // Profil çekmeyi hemen başlat — loading zaten true
        fetchProfile(session.user.id).then((userProfile) => {
          if (mountedRef.current) {
            setProfile(userProfile);
            if (!userProfile && session.user.user_metadata?.role) {
              setUserRole(session.user.user_metadata.role as UserRole);
            }
          }
        });
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const cleanedPhone = phone.replace(/\D/g, '');

      // RPC ile email bul
      let email: string | null = null;
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc('get_email_by_phone', {
          p_phone: cleanedPhone,
        });
        if (!rpcError && rpcResult?.success) {
          email = rpcResult.email;
        }
      } catch {
        // RPC yoksa fallback
      }

      if (!email) {
        email = `${cleanedPhone}@onkati.local`;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setLoading(false);
        return { error: 'Geçersiz telefon numarası veya şifre' };
      }

      if (data.user) {
        const authUser: User = {
          id: data.user.id,
          email: data.user.email,
          phone: data.user.user_metadata?.phone,
          role: data.user.user_metadata?.role,
        };
        setUser(authUser);

        const userProfile = await fetchProfile(data.user.id);
        setProfile(userProfile);
        if (!userProfile && data.user.user_metadata?.role) {
          setUserRole(data.user.user_metadata.role as UserRole);
        }
      }

      setLoading(false);
      return {};
    } catch (err) {
      console.error('signInWithPhone error:', err);
      setLoading(false);
      return { error: 'Giriş sırasında bir hata oluştu' };
    }
  }, [fetchProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setLoading(false);
        return { error: 'Geçersiz e-posta veya şifre' };
      }

      if (data.user) {
        const authUser: User = {
          id: data.user.id,
          email: data.user.email,
          phone: data.user.user_metadata?.phone,
          role: data.user.user_metadata?.role,
        };
        setUser(authUser);

        const userProfile = await fetchProfile(data.user.id);
        setProfile(userProfile);
        if (!userProfile && data.user.user_metadata?.role) {
          setUserRole(data.user.user_metadata.role as UserRole);
        }
      }

      setLoading(false);
      return {};
    } catch (err) {
      console.error('signInWithEmail error:', err);
      setLoading(false);
      return { error: 'Giriş sırasında bir hata oluştu' };
    }
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const userProfile = await fetchProfile(user.id);
      if (mountedRef.current) setProfile(userProfile);
    }
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, userRole, loading, error, signInWithPhone, signInWithEmail, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}