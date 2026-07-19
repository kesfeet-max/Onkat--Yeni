import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Handshake,
  Phone,
  Mail,
  Lock,
  User,
  Building2,
  MapPin,
  AlertCircle,
  Store,
  Eye,
  EyeOff,
  CheckCircle,
} from 'lucide-react';
import { cleanPhoneNumber, getCurrentLocation } from '../lib/utils';
import type { UserRole } from '../types';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [role, setRole] = useState<UserRole>((roleParam as UserRole) || 'customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    password: '',
    full_name: '',
    store_name: '',
    city: '',
    district: '',
    sector: '',
    latitude: 0,
    longitude: 0,
  });

  useEffect(() => {
    if (role === 'merchant') {
      setIsLocating(true);
      getCurrentLocation().then((location) => {
        if (location) {
          setFormData((prev) => ({
            ...prev,
            latitude: location.latitude,
            longitude: location.longitude,
          }));
        }
        setIsLocating(false);
      });
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanedPhone = cleanPhoneNumber(formData.phone);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-register`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          phone: cleanedPhone,
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          store_name: formData.store_name || undefined,
          city: formData.city || undefined,
          district: formData.district || undefined,
          sector: formData.sector || undefined,
          latitude: formData.latitude || undefined,
          longitude: formData.longitude || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Kayıt başarısız');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      setTimeout(() => {
        navigate('/giris');
      }, 2000);
    } catch (err) {
      setError('Kayıt sırasında bir hata oluştu');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-gray-900 mb-2">Kayıt Başarılı!</h2>
          <p className="text-gray-600 mb-4">Giriş sayfasına yönlendiriliyorsunuz...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <Link to="/" className="flex items-center justify-center gap-2 mb-4">
              <Handshake className="w-10 h-10 text-primary-600" />
              <span className="text-2xl font-heading font-bold text-gray-900">Onkatı</span>
            </Link>
            <h1 className="text-2xl font-heading font-bold text-gray-900">Yeni Hesap Oluştur</h1>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setRole('customer')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                role === 'customer'
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <User className="w-5 h-5" />
              Müşteri
            </button>
            <button
              type="button"
              onClick={() => setRole('merchant')}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                role === 'merchant'
                  ? 'bg-secondary-500 text-primary-900 shadow-lg'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Store className="w-5 h-5" />
              Esnaf
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Ad Soyad */}
            <div className="bg-gray-50 p-4 rounded-xl" style={{ display: 'block', visibility: 'visible' }}>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Ad Soyad <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="Adınızı ve soyadınızı girin"
                />
              </div>
            </div>

            {/* Telefon */}
            <div className="bg-gray-50 p-4 rounded-xl" style={{ display: 'block', visibility: 'visible' }}>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Telefon Numarası <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="05XX XXX XX XX"
                />
              </div>
            </div>

            {/* E-posta */}
            <div className="bg-gray-50 p-4 rounded-xl" style={{ display: 'block', visibility: 'visible' }}>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                E-posta Adresi <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  id="register-email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="ornek@email.com"
                />
              </div>
              <p className="text-xs text-gray-600 mt-2 font-medium">Şifre sıfırlama için kullanılacak</p>
            </div>

            {/* Şifre */}
            <div className="bg-gray-50 p-4 rounded-xl" style={{ display: 'block', visibility: 'visible' }}>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Şifre <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                  placeholder="En az 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {role === 'merchant' && (
              <>
                <div className="bg-gray-50 p-4 rounded-xl">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Dükkan Adı <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={formData.store_name}
                      onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                      required
                      className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="Dükkanınızın adı"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">İl <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                        placeholder="İstanbul"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">İlçe <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                        placeholder="Kadıköy"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Sektör <span className="text-red-500">*</span></label>
                  <select
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                  >
                    <option value="">Sektör seçin</option>
                    <option value="market">Market / Bakkal</option>
                    <option value="restoran">Restoran / Kafe</option>
                    <option value="temizlik">Temizlik / Kuru Temizleme</option>
                    <option value="kozmetik">Kozmetik / Kuaför</option>
                    <option value="elektronik">Elektronik</option>
                    <option value="giyim">Giyim / Tekstil</option>
                    <option value="diger">Diğer</option>
                  </select>
                </div>

                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 text-sm text-blue-800 font-medium">
                    <MapPin className="w-4 h-4" />
                    {isLocating ? (
                      <span>Konumunuz belirleniyor...</span>
                    ) : formData.latitude ? (
                      <span>
                        Konum: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </span>
                    ) : (
                      <span className="text-red-600">
                        Konum erişimi gerekli. Tarayıcı izinlerini kontrol edin.
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (role === 'merchant' && !formData.latitude)}
              className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Kaydediliyor...
                </>
              ) : (
                'Kayıt Ol'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-500 text-sm">
            Hesabınız var mı?{' '}
            <Link to="/giris" className="text-primary-600 font-semibold hover:text-primary-700">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
