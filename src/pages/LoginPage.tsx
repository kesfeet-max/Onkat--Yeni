import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, Lock, AlertCircle, User, Store, Loader2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { CustomerPhoneAuthForm } from '../components/CustomerPhoneAuthForm';
import { useAuth } from '../auth/AuthContext';
import { PHONE_LENGTH, normalizePhoneInput, validatePhone } from '../lib/validation';

type LoginRole = 'customer' | 'merchant';

/** Esnaf girişi: telefon numarası + şifre. */
function MerchantLoginForm() {
  const { signInMerchant } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const phoneResult = validatePhone(phone);
    if (!phoneResult.valid) {
      setError(phoneResult.message ?? 'Geçersiz telefon numarası');
      return;
    }
    if (!password) {
      setError('Şifrenizi girin');
      return;
    }

    setLoading(true);
    const result = await signInMerchant(phone, password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    navigate('/panel');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="merchant-phone" className="block text-sm font-semibold text-gray-800 mb-2">
          Telefon Numarası
        </label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="merchant-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={PHONE_LENGTH}
            value={phone}
            onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
            className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-secondary-500 focus:ring-2 focus:ring-secondary-200 transition-all tracking-wide"
            placeholder="05XX XXX XX XX"
          />
        </div>
      </div>

      <div>
        <label htmlFor="merchant-password" className="block text-sm font-semibold text-gray-800 mb-2">
          Esnaf Şifresi
        </label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="merchant-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-secondary-500 focus:ring-2 focus:ring-secondary-200 transition-all"
            placeholder="Şifrenizi girin"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-secondary-500 text-primary-900 py-4 rounded-xl font-bold hover:bg-secondary-600 transition-colors shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Giriş yapılıyor...
          </>
        ) : (
          'Esnaf Girişi'
        )}
      </button>
    </form>
  );
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<LoginRole>(searchParams.get('role') === 'merchant' ? 'merchant' : 'customer');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/panel');
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <BrandLogo to="/" size="lg" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-gray-900">
              {role === 'customer' ? 'Giriş Yap / Üye Ol' : 'Esnaf Girişi'}
            </h1>
            <p className="text-gray-500 mt-1.5 text-sm">
              {role === 'customer' ? 'Sadece adınız ve telefon numaranız yeterli' : 'Dükkan panelinize erişin'}
            </p>
          </div>

          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                role === 'customer' ? 'bg-primary-600 text-white shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <User className="w-4 h-4" />
              Müşteri
            </button>
            <button
              type="button"
              onClick={() => setRole('merchant')}
              className={`flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                role === 'merchant' ? 'bg-secondary-500 text-primary-900 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Store className="w-4 h-4" />
              Esnaf
            </button>
          </div>

          {role === 'customer' ? <CustomerPhoneAuthForm /> : <MerchantLoginForm />}

          {role === 'merchant' && (
            <p className="mt-6 text-center text-gray-500 text-sm">
              Dükkanınız kayıtlı değil mi?{' '}
              <Link to="/kayit?role=merchant" className="text-primary-600 font-semibold hover:text-primary-700">
                Esnaf Kaydı
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
