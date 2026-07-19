import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const fetchProfile = useCallback(async (userId: string): Promise<CustomerProfile | MerchantProfile | null> => {
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (customerData) {
      setUserRole('customer');
      return customerData as CustomerProfile;
    }

    const { data: merchantData } = await supabase
      .from('merchants')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (merchantData) {
      setUserRole('merchant');
      return merchantData as MerchantProfile;
    }

    return null;
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
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          const authUser: User = {
            id: session.user.id,
            email: session.user.email,
            phone: session.user.user_metadata?.phone,
            role: session.user.user_metadata?.role,
          };
          setUser(authUser);

          const userProfile = await fetchProfile(session.user.id);
          setProfile(userProfile);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setError('Kimlik dogrulama hatasi');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setUserRole(null);
      } else if (session?.user) {
        const authUser: User = {
          id: session.user.id,
          email: session.user.email,
          phone: session.user.user_metadata?.phone,
          role: session.user.user_metadata?.role,
        };
        setUser(authUser);
        (async () => {
          const userProfile = await fetchProfile(session.user.id);
          setProfile(userProfile);
        })();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      // Clean phone number
      const cleanedPhone = phone.replace(/\D/g, '');

      // Find user's email from customers table
      const { data: customerData } = await supabase
        .from('customers')
        .select('email')
        .eq('phone', cleanedPhone)
        .maybeSingle();

      let email = customerData?.email;

      // If not found in customers, check merchants
      if (!email) {
        const { data: merchantData } = await supabase
          .from('merchants')
          .select('email')
          .eq('phone', cleanedPhone)
          .maybeSingle();
        email = merchantData?.email;
      }

      // Fallback to old format for legacy accounts
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
