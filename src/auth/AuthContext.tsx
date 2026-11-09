import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { normalizePhoneInput } from '../lib/validation';
import type { User, CustomerProfile, MerchantProfile, UserRole } from '../types';

interface CustomerAuthResult {
  error?: string;
  isNew?: boolean;
  fullName?: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | MerchantProfile | null;
  userRole: UserRole | null;
  loading: boolean;
  error: string | null;
  /** Müşteri: şifresiz, SMS'siz telefon girişi. Kayıtlı değilse ad soyad ile anında kayıt. */
  signInCustomerWithPhone: (phone: string, fullName: string) => Promise<CustomerAuthResult>;
  /** Esnaf: telefon numarası + şifre ile giriş. */
  signInMerchant: (phone: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CUSTOMER_AUTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-phone-auth`;

function toAuthUser(session: Session): User {
  return {
    id: session.user.id,
    email: session.user.email,
    phone: session.user.user_metadata?.phone,
    role: session.user.user_metadata?.role,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | MerchantProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string): Promise<CustomerProfile | MerchantProfile | null> => {
    try {
      const { data: customerData, error: custErr } = await supabase
        .from('customers')
        .select('id, user_id, full_name, phone, is_active, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!custErr && customerData) {
        if (mountedRef.current) setUserRole('customer');
        return {
          id: customerData.id,
          user_id: customerData.user_id,
          full_name: customerData.full_name || 'Müşteri',
          phone: customerData.phone || '',
          points_balance: 0,
          is_active: customerData.is_active ?? true,
          created_at: customerData.created_at || '',
          updated_at: '',
        };
      }

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
          subscription_status: null,
          trial_ends_at: null,
          subscription_paid_until: null,
        };

        // Abonelik kolonları migration ile sonradan eklendiği için ayrı ve hataya toleranslı okunur
        try {
          const { data: subData, error: subErr } = await supabase
            .from('merchants')
            .select('subscription_status, trial_ends_at, subscription_paid_until')
            .eq('user_id', userId)
            .maybeSingle();

          if (!subErr && subData) {
            const sub = subData as Record<string, string | null>;
            safeMerchant.subscription_status = sub.subscription_status ?? null;
            safeMerchant.trial_ends_at = sub.trial_ends_at ?? null;
            safeMerchant.subscription_paid_until = sub.subscription_paid_until ?? null;
          }
        } catch (subCatchErr) {
          console.warn('Abonelik alanları okunamadı:', subCatchErr);
        }

        if (mountedRef.current) setUserRole('merchant');
        return safeMerchant;
      }

      return null;
    } catch (err) {
      console.error('Profile fetch unexpected error:', err);
      return null;
    }
  }, []);

  /** Oturum açıldıktan sonra profili (kısa yeniden denemelerle) yükler. */
  const loadProfileFor = useCallback(async (userId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const userProfile = await fetchProfile(userId);
      if (userProfile) {
        if (mountedRef.current) setProfile(userProfile);
        return userProfile;
      }
      await wait(400);
    }
    return null;
  }, [fetchProfile]);

  const clearState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setUserRole(null);
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    clearState();
    setLoading(false);
  }, [clearState]);

  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mountedRef.current) {
          setUser(toAuthUser(session));
          await loadProfileFor(session.user.id);
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
        clearState();
        setLoading(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        setUser(toAuthUser(session));
        if (event === 'SIGNED_IN') {
          fetchProfile(session.user.id).then((userProfile) => {
            if (userProfile && mountedRef.current) setProfile(userProfile);
          });
        }
      }
    });

    // PWA arka plandan döndüğünde oturumu doğrula
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !mountedRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(toAuthUser(session));
        } else {
          clearState();
        }
      } catch (err) {
        console.warn('[Auth] Oturum kontrolü başarısız:', err);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchProfile, loadProfileFor, clearState]);

  const signInCustomerWithPhone = useCallback(async (phone: string, fullName: string): Promise<CustomerAuthResult> => {
    setError(null);

    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const response = await fetch(CUSTOMER_AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ phone: normalizePhoneInput(phone), full_name: fullName.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success || !data?.session) {
        return { error: data?.error || 'Giriş yapılamadı. Lütfen tekrar deneyin.' };
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError || !sessionData.session) {
        return { error: 'Oturum başlatılamadı. Lütfen tekrar deneyin.' };
      }

      setUser(toAuthUser(sessionData.session));
      await loadProfileFor(sessionData.session.user.id);

      return { isNew: Boolean(data.is_new), fullName: data.full_name };
    } catch (err) {
      console.error('signInCustomerWithPhone error:', err);
      return { error: 'Bağlantı hatası. Lütfen tekrar deneyin.' };
    }
  }, [loadProfileFor]);

  const signInMerchant = useCallback(async (phone: string, password: string) => {
    setError(null);

    try {
      const cleanedPhone = normalizePhoneInput(phone);
      const candidateEmails = new Set<string>();

      // Esnafın gerçek (dahili) giriş adresi veritabanından bulunur
      for (const fn of ['esnaf_giris_eposta', 'get_email_by_phone']) {
        try {
          const { data, error: rpcError } = await supabase.rpc(fn, { p_phone: cleanedPhone });
          const result = data as { success?: boolean; email?: string } | null;
          if (!rpcError && result?.success && result.email) candidateEmails.add(result.email);
        } catch {
          // RPC henüz kurulmamış olabilir; yedek adresler denenir
        }
      }
      candidateEmails.add(`esnaf-${cleanedPhone}@onkati.local`);
      candidateEmails.add(`${cleanedPhone}@onkati.local`);

      for (const email of candidateEmails) {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError || !data.session) continue;

        const userProfile = await fetchProfile(data.session.user.id);
        if (!userProfile || !('store_id' in userProfile)) {
          await supabase.auth.signOut();
          clearState();
          return { error: 'Bu numara esnaf hesabı değil. Müşteri girişini kullanın.' };
        }

        setUser(toAuthUser(data.session));
        setProfile(userProfile);
        return {};
      }

      return { error: 'Telefon numarası veya şifre hatalı' };
    } catch (err) {
      console.error('signInMerchant error:', err);
      return { error: 'Giriş sırasında bir hata oluştu' };
    }
  }, [fetchProfile, clearState]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfileFor(user.id);
  }, [user, loadProfileFor]);

  return (
    <AuthContext.Provider
      value={{ user, profile, userRole, loading, error, signInCustomerWithPhone, signInMerchant, signOut, refreshProfile }}
    >
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
