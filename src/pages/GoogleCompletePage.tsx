import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types';

/**
 * Google ile giriş sonrası dönüş (callback) sayfası — TAMAMEN SÜRTÜNMESİZ.
 *
 * Kullanıcıdan hiçbir bilgi istenmez: telefon, ad-soyad, dükkan bilgisi,
 * KVKK veya üyelik sözleşmesi onayı sorulmaz. Profil yoksa arka planda
 * sessizce oluşturulur ve kullanıcı doğrudan paneline yönlendirilir.
 *
 * Bu ekran yalnızca kısa bir "hazırlanıyor" göstergesi olarak görünür.
 */
export function GoogleCompletePage() {
  const { user, userRole, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const syncStartedRef = useRef(false);

  // Profil zaten varsa hemen panele geç
  useEffect(() => {
    if (authLoading || !user) return;
    if (!userRole) return;

    try {
      localStorage.removeItem('onkati-oauth-role');
    } catch {
      // Sessizce devam
    }
    navigate('/panel', { replace: true });
  }, [authLoading, user, userRole, navigate]);

  // Oturum yoksa girişe geri dön
  useEffect(() => {
    if (authLoading || user) return;
    const timer = setTimeout(() => navigate('/giris', { replace: true }), 1500);
    return () => clearTimeout(timer);
  }, [authLoading, user, navigate]);

  // Profil yoksa arka planda sessizce oluştur ve panele yönlendir
  useEffect(() => {
    if (authLoading || !user || userRole) return;
    if (syncStartedRef.current) return;
    syncStartedRef.current = true;

    const createProfileSilently = async () => {
      try {
        let savedRole: UserRole | undefined;
        try {
          const stored = localStorage.getItem('onkati-oauth-role');
          if (stored === 'merchant' || stored === 'customer') {
            savedRole = stored;
          }
        } catch {
          savedRole = undefined;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
          navigate('/giris', { replace: true });
          return;
        }

        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-complete`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ role: savedRole ?? 'customer' }),
        });

        const data = await response.json().catch(() => null);

        try {
          localStorage.removeItem('onkati-oauth-role');
        } catch {
          // Sessizce devam
        }

        if (!response.ok || !data?.success) {
          setError(data?.error || 'Hesabınız hazırlanamadı. Lütfen tekrar giriş yapmayı deneyin.');
          return;
        }

        await refreshProfile();
        navigate('/panel', { replace: true });
      } catch (err) {
        console.error('Google silent profile error:', err);
        setError('Hesabınız hazırlanırken bir sorun oluştu. Lütfen tekrar deneyin.');
      }
    };

    createProfileSilently();
  }, [authLoading, user, userRole, navigate, refreshProfile]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
          <div className="flex justify-center mb-4">
            <BrandLogo to="/" size="lg" />
          </div>
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-left text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/giris', { replace: true })}
            className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg"
          >
            Giriş Ekranına Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
        <div className="flex justify-center mb-5">
          <BrandLogo to="/" size="lg" />
        </div>
        <Loader2 className="w-10 h-10 animate-spin text-primary-600 mx-auto" />
        <p className="mt-4 text-gray-700 text-sm font-semibold">Hesabınız hazırlanıyor</p>
        <p className="mt-1 text-gray-500 text-xs">Panelinize yönlendiriliyorsunuz...</p>
      </div>
    </div>
  );
}
