import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CustomerPanel } from './CustomerPanel';
import { MerchantPanel } from './MerchantPanel';
import { AlertCircle, Loader2 } from 'lucide-react';

export function Dashboard() {
  const { user, userRole, loading, signOut } = useAuth();

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

  // Kullanıcı giriş yapmış ama rolü belirlenemedi
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Profil Bulunamadı</h2>
          <p className="text-gray-600 text-sm mb-4">
            Hesabınız bulundu ancak müşteri veya esnaf profili yüklenemedi. 
            Lütfen tekrar giriş yapmayı deneyin.
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
    return <MerchantPanel />;
  }

  return <CustomerPanel />;
}