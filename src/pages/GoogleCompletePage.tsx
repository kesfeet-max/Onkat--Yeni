import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  User as UserIcon,
  Building2,
  MapPin,
  AlertCircle,
  Store,
  Loader2,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { getCurrentLocation } from '../lib/utils';
import {
  PHONE_LENGTH,
  normalizePhoneInput,
  normalizeFullName,
  sanitizeFullNameInput,
  validateFullName,
  validatePhone,
} from '../lib/validation';
import type { UserRole } from '../types';

/**
 * Google ile giriş sonrası dönüş (callback) sayfası.
 *
 * - Profili (müşteri/esnaf) olan kullanıcı doğrudan `/panel` adresine gider.
 * - Profili olmayan kullanıcı, Onkatı için zorunlu olan telefon/ad-soyad
 *   (esnafta ayrıca dükkan bilgileri) alanlarını burada tamamlar.
 */
export function GoogleCompletePage() {
  const { user, userRole, loading: authLoading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [role, setRole] = useState<UserRole>('customer');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [kvkkApproved, setKvkkApproved] = useState(false);
  const [termsApproved, setTermsApproved] = useState(false);

  const [storeName, setStoreName] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [sector, setSector] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // Google hesabından gelen ad ve giriş ekranında seçilen rol ön doldurulur
  useEffect(() => {
    let savedRole: string | null = null;
    try {
      savedRole = localStorage.getItem('onkati-oauth-role');
    } catch {
      savedRole = null;
    }
    if (savedRole === 'merchant' || savedRole === 'customer') {
      setRole(savedRole);
    }

    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata as Record<string, unknown> | undefined;
      const googleName = (meta?.full_name || meta?.name || '') as string;
      if (googleName) {
        setFullName(sanitizeFullNameInput(googleName));
      }
    });
  }, []);

  // Oturum hazır olduğunda: profil varsa panele gönder, yoksa formu göster
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      // Oturum kurulamadı — giriş ekranına geri dön
      const timer = setTimeout(() => navigate('/giris', { replace: true }), 1200);
      return () => clearTimeout(timer);
    }

    if (userRole) {
      try {
        localStorage.removeItem('onkati-oauth-role');
      } catch {
        // Sessizce devam
      }
      navigate('/panel', { replace: true });
      return;
    }

    setChecking(false);
  }, [authLoading, user, userRole, navigate]);

  // Esnaf rolü seçilirse konum izni istenir
  useEffect(() => {
    if (role !== 'merchant' || checking) return;

    setIsLocating(true);
    getCurrentLocation().then((location) => {
      if (location) {
        setCoords({ latitude: location.latitude, longitude: location.longitude });
      }
      setIsLocating(false);
    });
  }, [role, checking]);

  const handleFullNameChange = (rawValue: string) => {
    const sanitized = sanitizeFullNameInput(rawValue);
    setFullName(sanitized);
    if (sanitized.trim().length > 0) {
      const result = validateFullName(sanitized);
      setNameError(result.valid ? null : result.message ?? null);
    } else {
      setNameError(null);
    }
  };

  const handlePhoneChange = (rawValue: string) => {
    const normalized = normalizePhoneInput(rawValue);
    setPhone(normalized);
    if (!normalized) {
      setPhoneError(null);
      return;
    }
    const result = validatePhone(normalized);
    setPhoneError(result.valid ? null : result.message ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!kvkkApproved || !termsApproved) {
      setError('Devam etmek için KVKK Aydınlatma Metni ve Üyelik Koşullarını onaylamanız gerekmektedir.');
      return;
    }

    const nameResult = validateFullName(fullName);
    if (!nameResult.valid) {
      setNameError(nameResult.message ?? null);
      setError(nameResult.message ?? null);
      return;
    }
    setNameError(null);

    const phoneResult = validatePhone(phone);
    if (!phoneResult.valid) {
      setPhoneError(phoneResult.message ?? null);
      setError(phoneResult.message ?? null);
      return;
    }
    setPhoneError(null);

    if (role === 'merchant') {
      if (!storeName.trim() || !city.trim() || !district.trim() || !sector.trim()) {
        setError('Dükkan adı, il, ilçe ve sektör alanları esnaf için zorunludur.');
        return;
      }
      if (!coords) {
        setError('Konum erişimi gerekli. Tarayıcı izinlerini kontrol edin.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setError('Oturum bulunamadı. Lütfen Google ile tekrar giriş yapın.');
        setSubmitting(false);
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-complete`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          role,
          phone: normalizePhoneInput(phone),
          full_name: normalizeFullName(fullName),
          store_name: role === 'merchant' ? storeName.trim() : undefined,
          city: role === 'merchant' ? city.trim() : undefined,
          district: role === 'merchant' ? district.trim() : undefined,
          sector: role === 'merchant' ? sector.trim() : undefined,
          latitude: role === 'merchant' ? coords?.latitude : undefined,
          longitude: role === 'merchant' ? coords?.longitude : undefined,
          kvkk_approved: kvkkApproved,
          terms_approved: termsApproved,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        setError(data?.error || 'Kayıt tamamlanamadı. Lütfen tekrar deneyin.');
        setSubmitting(false);
        return;
      }

      try {
        localStorage.removeItem('onkati-oauth-role');
      } catch {
        // Sessizce devam
      }

      await refreshProfile();
      navigate('/panel', { replace: true });
    } catch (err) {
      console.error('Google complete submit error:', err);
      setError('Kayıt tamamlanırken bir hata oluştu. Lütfen tekrar deneyin.');
      setSubmitting(false);
    }
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600 mx-auto" />
          <p className="mt-4 text-gray-600 text-sm font-medium">
            {user ? 'Hesabınız hazırlanıyor...' : 'Google oturumu doğrulanıyor...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <BrandLogo to="/" size="lg" />
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-gray-900">
              Hesabını Tamamla
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              Google hesabınla giriş yaptın. Onkatı’yı kullanmak için birkaç bilgi daha gerekli.
            </p>
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
              <UserIcon className="w-5 h-5" />
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
            <div className="bg-gray-50 p-4 rounded-xl">
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Ad Soyad <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 bg-white focus:ring-2 transition-all text-gray-900 ${
                    nameError
                      ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder="Adınızı ve soyadınızı girin"
                />
              </div>
              {nameError && <p className="text-xs text-red-600 mt-2 font-semibold">{nameError}</p>}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl">
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Telefon Numarası <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={PHONE_LENGTH}
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 bg-white focus:ring-2 transition-all text-gray-900 tracking-wide ${
                    phoneError
                      ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                      : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                  }`}
                  placeholder="05074445588"
                />
              </div>
              {phoneError ? (
                <p className="text-xs text-red-600 mt-2 font-semibold">{phoneError}</p>
              ) : (
                <p className="text-xs text-gray-600 mt-2 font-medium">
                  Başında 0 olacak şekilde 11 hane (Örn: 05074445588)
                </p>
              )}
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
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                      placeholder="Dükkanınızın adı"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        İl <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                        placeholder="İstanbul"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">
                        İlçe <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900"
                        placeholder="Kadıköy"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Sektör <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
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
                    ) : coords ? (
                      <span>
                        Konum: {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
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

            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kvkkApproved}
                  onChange={(e) => setKvkkApproved(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  <a
                    href="/yasal/kvkk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 font-semibold hover:text-primary-700 underline"
                  >
                    KVKK Aydınlatma Metni
                  </a>
                  'ni okudum ve onaylıyorum. <span className="text-red-500">*</span>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsApproved}
                  onChange={(e) => setTermsApproved(e.target.checked)}
                  required
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  <a
                    href={role === 'merchant' ? '/yasal/esnaf-kosullari' : '/yasal/musteri-kosullari'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 font-semibold hover:text-primary-700 underline"
                  >
                    {role === 'merchant'
                      ? 'Esnaf Üyelik ve Hizmet Koşulları'
                      : 'Müşteri Üyelik ve Hizmet Koşulları'}
                  </a>
                  'nı okudum ve kabul ediyorum. <span className="text-red-500">*</span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !kvkkApproved || !termsApproved || (role === 'merchant' && !coords)}
              className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                'Kaydı Tamamla'
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/giris', { replace: true });
            }}
            className="mt-5 w-full text-center text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Farklı bir yöntemle giriş yap
          </button>
        </div>
      </div>
    </div>
  );
}
