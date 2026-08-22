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
  const initializedRef = useRef(false);

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
          subscription_status: null,
          trial_ends_at: null,
          subscription_paid_until: null,
        };

        // Abonelik kolonları henüz migration ile eklenmemiş olabilir.
        // Bu yüzden AYRI ve hataya toleranslı bir sorgu ile okunur; hata olursa
        // varsayılan (null) değerler korunur ve panel beyaz ekran vermez.
        try {
          const { data: subData, error: subErr } = await supabase
            .from('merchants')
            .select('subscription_status, trial_ends_at, subscription_paid_until')
            .eq('user_id', userId)
            .maybeSingle();

          if (!subErr && subData) {
            safeMerchant.subscription_status = (subData as any).subscription_status ?? null;
            safeMerchant.trial_ends_at = (subData as any).trial_ends_at ?? null;
            safeMerchant.subscription_paid_until = (subData as any).subscription_paid_until ?? null;
          } else if (subErr) {
            console.warn('Abonelik alanları okunamadı (varsayılanlar kullanılıyor):', subErr.message);
          }
        } catch (subCatchErr) {
          console.warn('Abonelik alanları sorgusu başarısız:', subCatchErr);
        }

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

  // Oturum state'ini session'dan güncelle
  const updateSessionState = useCallback(async (session: any) => {
    if (!session?.user) {
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
        setUserRole(null);
        setLoading(false);
      }
      return;
    }

    const authUser: User = {
      id: session.user.id,
      email: session.user.email,
      phone: session.user.user_metadata?.phone,
      role: session.user.user_metadata?.role,
    };

    if (mountedRef.current) {
      setUser(authUser);
    }

    const userProfile = await fetchProfile(session.user.id);
    if (mountedRef.current) {
      setProfile(userProfile);
      if (!userProfile && session.user.user_metadata?.role) {
        setUserRole(session.user.user_metadata.role as UserRole);
      }
      setLoading(false);
    }
  }, [fetchProfile]);

  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      // Çift başlatmayı önle
      if (initializedRef.current) return;
      initializedRef.current = true;

      try {
        // localStorage'dan mevcut session'ı oku
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mountedRef.current) {
          await updateSessionState(session);
        } else {
          // Session yok — loading'i kapat
          if (mountedRef.current) setLoading(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (mountedRef.current) {
          setError('Kimlik doğrulama hatası');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Auth state değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;

      console.log('[Auth] Event:', event);

      switch (event) {
        case 'SIGNED_OUT':
          setUser(null);
          setProfile(null);
          setUserRole(null);
          setLoading(false);
          break;

        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
          // Token yenilendiğinde veya giriş yapıldığında state'i güncelle
          if (session?.user) {
            const authUser: User = {
              id: session.user.id,
              email: session.user.email,
              phone: session.user.user_metadata?.phone,
              role: session.user.user_metadata?.role,
            };
            setUser(authUser);

            // Profil sadece SIGNED_IN'de çekilsin (TOKEN_REFRESHED'da gereksiz)
            if (event === 'SIGNED_IN') {
              fetchProfile(session.user.id).then((userProfile) => {
                if (mountedRef.current) {
                  setProfile(userProfile);
                  if (!userProfile && session.user.user_metadata?.role) {
                    setUserRole(session.user.user_metadata.role as UserRole);
                  }
                }
              });
            }
          }
          break;

        case 'USER_UPDATED':
          // Kullanıcı bilgileri güncellendi
          if (session?.user) {
            const authUser: User = {
              id: session.user.id,
              email: session.user.email,
              phone: session.user.user_metadata?.phone,
              role: session.user.user_metadata?.role,
            };
            setUser(authUser);
          }
          break;
      }
    });

    // PWA Visibility Change Handler
    // Uygulama arka plandan döndüğünde session'ı proaktif olarak kontrol et
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Session hâlâ geçerli — user state'ini güncelle (token yenilenmiş olabilir)
            const authUser: User = {
              id: session.user.id,
              email: session.user.email,
              phone: session.user.user_metadata?.phone,
              role: session.user.user_metadata?.role,
            };
            setUser(authUser);
          } else {
            // Session kaybolmuş — temizle
            setUser(null);
            setProfile(null);
            setUserRole(null);
          }
        } catch (err) {
          console.warn('[Auth] Visibility change session check failed:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchProfile, updateSessionState]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const cleanedPhone = phone.replace(/\D/g, '');

      // RPC ile gerçek giriş e-postasını bul
      let mappedEmail: string | null = null;
      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc('get_email_by_phone', {
          p_phone: cleanedPhone,
        });
        if (!rpcError && rpcResult?.success) {
          mappedEmail = rpcResult.email;
        }
      } catch {
        // RPC yoksa aşağıdaki yedek adres denenir
      }

      /**
       * Aday e-posta adresleri sırayla denenir.
       *
       * Neden: Şifre sıfırlama gerçek auth e-postası (örn. kisi@gmail.com)
       * üzerinden yapılır. Eşleme tek bir adrese bağlı kalırsa, tablodaki
       * e-posta boş/eski olduğunda giriş yanlış adresi dener ve yeni şifre
       * çalışmıyormuş gibi görünür. Bu yüzden hem eşlenen adres hem de
       * varsayılan yerel adres denenir.
       */
      const candidateEmails = Array.from(
        new Set([mappedEmail, `${cleanedPhone}@onkati.local`].filter(Boolean) as string[])
      );

      let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null;
      let lastFailed = true;

      for (const candidate of candidateEmails) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: candidate,
          password,
        });

        if (!signInError && signInData?.user) {
          data = signInData;
          lastFailed = false;
          break;
        }
      }

      if (lastFailed || !data) {
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