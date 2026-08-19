import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';

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
    // Supabase şifre sıfırlama token'ını 3 farklı yoldan alabilir:
    // 1. Hash fragment: #access_token=...&type=recovery (implicit flow)
    // 2. Query params: ?access_token=...&type=recovery
    // 3. PKCE code: ?code=... (yeni Supabase versiyonları)
    // 4. onAuthStateChange PASSWORD_RECOVERY event'i
    
    let recoveryHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        // Supabase otomatik olarak recovery token'ı işledi ve session oluşturdu
        recoveryHandled = true;
        setSessionChecked(true);
      }
    });

    const checkSession = async () => {
      // Kısa bir süre bekle — onAuthStateChange PASSWORD_RECOVERY event'ini yakalaması için
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (recoveryHandled) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionChecked(true);
        return;
      }

      // Hash fragment'tan token kontrolü (#access_token=...&type=recovery)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashAccessToken = hashParams.get('access_token');
      const hashRefreshToken = hashParams.get('refresh_token');
      const hashType = hashParams.get('type');

      // Query params'tan token kontrolü (?access_token=...&type=recovery)
      const queryAccessToken = searchParams.get('access_token');
      const queryRefreshToken = searchParams.get('refresh_token');
      const queryType = searchParams.get('type');
      const queryCode = searchParams.get('code');

      const accessToken = hashAccessToken || queryAccessToken;
      const refreshToken = hashRefreshToken || queryRefreshToken || '';
      const type = hashType || queryType;

      if (accessToken && type === 'recovery') {
        // Token ile session oluştur
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!sessionError) {
          setSessionChecked(true);
        } else {
          setError('Link geçersiz veya süresi dolmuş. Lütfen yeni bir şifre sıfırlama linki isteyin.');
          setSessionChecked(true);
        }
      } else if (queryCode) {
        // PKCE flow — code ile token exchange (Supabase bunu otomatik yapar detectSessionInUrl ile)
        // Biraz daha bekle, Supabase client otomatik exchange yapacak
        await new Promise(resolve => setTimeout(resolve, 1000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          setSessionChecked(true);
        } else {
          setError('Link geçersiz veya süresi dolmuş. Lütfen yeni bir şifre sıfırlama linki isteyin.');
          setSessionChecked(true);
        }
      } else {
        setError('Geçersiz şifre sıfırlama linki.');
        setSessionChecked(true);
      }
    };

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [searchParams]);

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
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        setError('Şifre güncellenemedi: ' + updateError.message);
      } else {
        setSuccess(true);
        toast.success('Şifreniz başarıyla güncellendi!', 'Giriş sayfasına yönlendiriliyorsunuz...');
        // Oturumu kapat — kullanıcı yeni şifresiyle tekrar giriş yapsın
        await supabase.auth.signOut();
        setTimeout(() => {
          navigate('/giris');
        }, 2500);
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
            <div className="flex justify-center mb-4">
              <BrandLogo to="/" size="lg" />
            </div>
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
