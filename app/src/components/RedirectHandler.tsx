import { useEffect, ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RedirectProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const storeId = searchParams.get('store');
    if (storeId && user) {
      navigate('/panel');
    }
  }, [searchParams, user, navigate]);

  return <>{children}</>;
}
