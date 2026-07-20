import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Handshake, Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionChecked(true);
      } else {
        // Check if we have access token in URL (from password reset email)
        const accessToken = searchParams.get('access_token');
        const refreshToken = searchParams.get('refresh_token');
        const type = searchParams.get('type');

        if (accessToken && type === 'recovery') {
          // Set the session using the tokens from URL
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (!error) {
            setSessionChecked(true);
          } else {
            setError('Link geçersiz veya süresi dolmuş. Lütfen yeni bir şifre sıfırlama linki isteyin.');
            setSessionChecked(true);
          }
        } else {
          setError('Geçersiz şifre sıfırlama linki.');
          setSessionChecked(true);
        }
      }
    };
    checkSession();
  }, [searchParams, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır');
      return;
    }

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setError('Şifre güncellenemedi: ' + error.message);
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate('/giris');
        }, 2000);
      }
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-gray-900 mb-2">Şifre Güncellendi!</h2>
          <p className="text-gray-600 mb-4">Giriş sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <Link to="/" className="flex items-center justify-center gap-2 mb-4">
              <Handshake className="w-10 h-10 text-primary-600" />
              <span className="text-2xl font-heading font-bold text-gray-900">Onkatı</span>
            </Link>
            <h1 className="text-2xl font-heading font-bold text-gray-900">Yeni Şifre Belirle</h1>
            <p className="text-gray-500 mt-2">Yeni şifrenizi girin</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Yeni Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-12 pr-12 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  placeholder="En az 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                Şifre Tekrar
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  placeholder="Şifrenizi tekrar girin"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Güncelleniyor...
                </>
              ) : (
                'Şifremi Güncelle'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/giris" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors text-sm">
              Giriş Sayfasına Dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
