import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Handshake, Phone, Lock, AlertCircle, Mail, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signInWithPhone, user } = useAuth();
  const navigate = useNavigate();

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/panel');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signInWithPhone(phone, password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotEmail.trim()) {
      setForgotError('E-posta adresi gerekli');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      setForgotError('Geçerli bir e-posta adresi girin');
      return;
    }

    setForgotLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'https://onkat-e2hq.onrender.com/reset-password',
      });

      if (error) {
        setForgotError('E-posta gönderilemedi. Lütfen e-posta adresinizi kontrol edin.');
      } else {
        setForgotSuccess(true);
      }
    } catch {
      setForgotError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <Link to="/" className="flex items-center justify-center gap-2 mb-4">
              <Handshake className="w-10 h-10 text-primary-600" />
              <span className="text-2xl font-heading font-bold text-gray-900">Onkatı</span>
            </Link>
            <h1 className="text-2xl font-heading font-bold text-gray-900">Giriş Yap</h1>
            <p className="text-gray-500 mt-2">Hesabına eriş</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Telefon Numarası
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  placeholder="05XX XXX XX XX"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  placeholder="Şifrenizi girin"
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
                  Giriş yapılıyor...
                </>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="inline-flex items-center justify-center text-blue-600 font-semibold hover:text-blue-800 hover:underline transition-colors text-base py-2"
            >
              Şifremi Unuttum
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-500">
              Hesabın yok mu?{' '}
              <Link to="/kayit" className="text-primary-600 font-semibold hover:text-primary-700 transition-colors">
                Kayıt Ol
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-heading font-bold text-gray-900">Şifremi Unuttum</h3>
              <button
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotEmail('');
                  setForgotError(null);
                  setForgotSuccess(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {forgotSuccess ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">E-posta Gönderildi!</h4>
                <p className="text-gray-600 text-sm mb-4">
                  Şifre sıfırlama linki e-posta adresinize gönderildi.
                  <br />
                  Spam klasörünü de kontrol etmeyi unutmayın.
                </p>
                <button
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotEmail('');
                    setForgotSuccess(false);
                  }}
                  className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  Tamam
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword}>
                <p className="text-gray-600 text-sm mb-4">
                  Kayıtlı e-posta adresinizi girin. Şifre sıfırlama linki e-posta adresinize gönderilecek.
                </p>

                {forgotError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div className="mb-4">
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-2">
                    E-posta Adresi
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      id="forgot-email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                      placeholder="ornek@email.com"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      setForgotEmail('');
                      setForgotError(null);
                    }}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 py-3 px-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {forgotLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Gönderiliyor...
                      </>
                    ) : (
                      'Gönder'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
