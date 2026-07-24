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

  const fetchProfile = useCallback(async (userId: string): Promise<CustomerProfile | MerchantProfile | null> => {
    // Sonsuz döngü koruması
    if (fetchingRef.current) return null;
    fetchingRef.current = true;

    try {
      // Müşteri profili — user_id ile kendi kaydını çeker (RLS uyumlu)
      const { data: customerData, error: custErr } = await supabase
        .from('customers')
        .select('id, user_id, full_name, email, phone, points_balance, is_active, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (customerData && !custErr) {
        setUserRole('customer');
        return customerData as CustomerProfile;
      }

      // Esnaf profili
      const { data: merchantData, error: merchErr } = await supabase
        .from('merchants')
        .select('id, user_id, store_id, store_name, full_name, email, phone, city, district, sector, is_active, points_rate, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (merchantData && !merchErr) {
        setUserRole('merchant');
        return merchantData as MerchantProfile;
      }

      return null;
    } catch (err) {
      console.error('Profile fetch error:', err);
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
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const authUser: User = {
            id: session.user.id,
            email: session.user.email,
            phone: session.user.user_metadata?.phone,
            role: session.user.user_metadata?.role,
          };
          setUser(authUser);

          const userProfile = await fetchProfile(session.user.id);
          if (mounted) setProfile(userProfile);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mounted) setError('Kimlik dogrulama hatasi');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

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
        fetchProfile(session.user.id).then((userProfile) => {
          if (mounted) setProfile(userProfile);
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      // Telefon numarasını temizle
      const cleanedPhone = phone.replace(/\D/g, '');

      // RPC ile email bul (RLS bypass - SECURITY DEFINER)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('get_email_by_phone', {
        p_phone: cleanedPhone,
      });

      let email: string | null = null;

      if (!rpcError && rpcResult?.success) {
        email = rpcResult.email;
      }

      // Fallback: eski format
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
      }

      setLoading(false);
      return {};
    } catch (err) {
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
      }

      setLoading(false);
      return {};
    } catch (err) {
      setLoading(false);
      return { error: 'Giriş sırasında bir hata oluştu' };
    }
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const userProfile = await fetchProfile(user.id);
      setProfile(userProfile);
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