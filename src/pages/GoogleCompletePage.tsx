import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthContext';
import {
  ensureUserProfile,
  readStoredOAuthRole,
  clearStoredOAuthRole,
} from '../lib/google-signup';

/**
 * Google ile giriş sonrası dönüş (callback) sayfası — TAMAMEN SÜRTÜNMESİZ.
 *
 * Kullanıcıdan hiçbir bilgi istenmez: telefon, ad-soyad, dükkan bilgisi,
 * KVKK veya üyelik sözleşmesi onayı sorulmaz. Profil yoksa doğrudan Supabase
 * istemcisiyle (RPC / insert) sessizce oluşturulur.
 *
 * ÖNEMLİ: Bu ekran ASLA hata göstermez. Ne olursa olsun kullanıcı panele veya
 * ana sayfaya yönlendirilir; hiçbir koşulda ekranda bekletilmez.
 */
export function GoogleCompletePage() {
  const { user, userRole, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const handledRef = useRef(false);

  // Güvenlik ağı: hiçbir şey olmasa bile 10 saniye sonra yönlendir
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      if (handledRef.current) return;
      handledRef.current = true;
      clearStoredOAuthRole();
      navigate('/panel', { replace: true });
    }, 10000);

    return () => clearTimeout(safetyTimer);
  }, [navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (handledRef.current) return;

    // Oturum yoksa girişe dön
    if (!user) {
      handledRef.current = true;
      clearStoredOAuthRole();
      navigate('/giris', { replace: true });
      return;
    }

    // Profil zaten yüklendiyse doğrudan panele geç
    if (userRole) {
      handledRef.current = true;
      clearStoredOAuthRole();
      navigate('/panel', { replace: true });
      return;
    }

    handledRef.current = true;

    const prepareSilently = async () => {
      const preferredRole = readStoredOAuthRole();

      let resolvedRole: string | null = null;
      try {
        resolvedRole = await ensureUserProfile(preferredRole);
      } catch (err) {
        // ensureUserProfile hata fırlatmaz; yine de akış kesilmesin
        console.warn('Google sessiz kayıt beklenmeyen hata:', err);
      }

      clearStoredOAuthRole();

      try {
        await refreshProfile();
      } catch {
        // Profil yenileme başarısız olsa da yönlendirme yapılır
      }

      // Profil hazırsa panele, hazırlanamadıysa ana sayfaya — hata ekranı yok
      navigate(resolvedRole ? '/panel' : '/', { replace: true });
    };

    prepareSilently();
  }, [authLoading, user, userRole, navigate, refreshProfile]);

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
