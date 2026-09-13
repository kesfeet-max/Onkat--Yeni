import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { CustomerPanel } from './CustomerPanel';
import { MerchantPanel } from './MerchantPanel';
import { PwaInstallBanner } from '../components/PwaInstallBanner';
import { AlertCircle, Loader2 } from 'lucide-react';

export function Dashboard() {
  const { user, userRole, loading, signOut, refreshProfile } = useAuth();

  /**
   * Profil henüz oluşmadıysa (örn. Google ile ilk giriş) kullanıcıya form
   * göstermeden arka planda sessizce profil oluşturulmaya çalışılır.
   * Böylece hiçbir aşamada ek bilgi veya onay ekranı çıkmaz.
   */
  const [autoRepairing, setAutoRepairing] = useState(false);
  const [autoRepairFailed, setAutoRepairFailed] = useState(false);
  const repairStartedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || userRole) return;
    if (repairStartedRef.current) return;
    repairStartedRef.current = true;

    const repairProfile = async () => {
      setAutoRepairing(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
          setAutoRepairFailed(true);
          return;
        }

        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-complete`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({}),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.success) {
          setAutoRepairFailed(true);
          return;
        }

        await refreshProfile();
      } catch (err) {
        console.error('Profil otomatik hazırlanamadı:', err);
        setAutoRepairFailed(true);
      } finally {
        setAutoRepairing(false);
      }
    };

    repairProfile();
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

  // Profil henüz yok — arka planda hazırlanıyor, kullanıcıdan bilgi istenmez
  if (!userRole && (autoRepairing || !autoRepairFailed)) {
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

  // Otomatik hazırlama da başarısız olduysa yalnızca teknik hata gösterilir
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Panel Açılamadı</h2>
          <p className="text-gray-600 text-sm mb-4">
            Hesabınız bulundu ancak paneliniz yüklenemedi. Lütfen tekrar giriş yapmayı deneyin.
          </p>
          <button
            onClick={signOut}
            className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium"
          >
            Çıkış Yap ve Tekrar Dene
          </button>
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
