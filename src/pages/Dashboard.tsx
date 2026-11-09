import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { CustomerPanel } from './CustomerPanel';
import { MerchantPanel } from './MerchantPanel';
import { PwaInstallBanner } from '../components/PwaInstallBanner';

/** Rol bazlı panel yönlendirmesi. */
export function Dashboard() {
  const { user, userRole, loading, refreshProfile } = useAuth();

  // Oturum var ama profil henüz yüklenmediyse bir kez daha dene
  useEffect(() => {
    if (!loading && user && !userRole) refreshProfile();
  }, [loading, user, userRole, refreshProfile]);

  if (loading || (user && !userRole)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/giris" replace />;

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
