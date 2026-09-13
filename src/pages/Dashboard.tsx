import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CustomerPanel } from './CustomerPanel';
import { MerchantPanel } from './MerchantPanel';
import { PwaInstallBanner } from '../components/PwaInstallBanner';
import { ensureUserProfile, readStoredOAuthRole, clearStoredOAuthRole } from '../lib/google-signup';
import { Loader2 } from 'lucide-react';

/**
 * Rol bazlı panel yönlendirmesi.
 *
 * Profil henüz oluşmadıysa (örn. Google ile ilk giriş) kullanıcıya hiçbir form
 * veya hata ekranı gösterilmez: profil arka planda sessizce oluşturulmaya
 * çalışılır. Bu da başarısız olursa kullanıcı ana sayfaya yönlendirilir.
 */
export function Dashboard() {
  const { user, userRole, loading, refreshProfile } = useAuth();

  const [preparing, setPreparing] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || userRole) return;
    if (startedRef.current) return;
    startedRef.current = true;

    const prepareProfile = async () => {
      setPreparing(true);
      try {
        const resolvedRole = await ensureUserProfile(readStoredOAuthRole());
        clearStoredOAuthRole();

        if (!resolvedRole) {
          setPrepareFailed(true);
          return;
        }

        await refreshProfile();
      } catch (err) {
        console.warn('Profil otomatik hazırlanamadı:', err);
        setPrepareFailed(true);
      } finally {
        setPreparing(false);
      }
    };

    prepareProfile();
  }, [loading, user, userRole, refreshProfile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Kullanıcı giriş yapmamışsa login'e yönlendir
  if (!user) {
    return <Navigate to="/giris" replace />;
  }

  // Profil hazırlanamadıysa hata ekranı YOK — sessizce ana sayfaya dönülür
  if (!userRole && prepareFailed) {
    return <Navigate to="/" replace />;
  }

  // Profil arka planda hazırlanıyor
  if (!userRole || preparing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-gray-700 text-sm font-semibold">Hesabınız hazırlanıyor</p>
          <p className="mt-1 text-gray-500 text-xs">Panelinize yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  if (userRole === 'merchant') {
    return (
      <>
        <MerchantPanel />
        <PwaInstallBanner variant="merchant" />
      </>
    );
  }

  return (
    <>
      <CustomerPanel />
      <PwaInstallBanner variant="customer" />
    </>
  );
}
