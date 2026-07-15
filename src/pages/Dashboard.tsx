import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CustomerPanel } from './CustomerPanel';
import { MerchantPanel } from './MerchantPanel';

export function Dashboard() {
  const { userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!userRole) {
    return <Navigate to="/giris" replace />;
  }

  if (userRole === 'merchant') {
    return <MerchantPanel />;
  }

  return <CustomerPanel />;
}
