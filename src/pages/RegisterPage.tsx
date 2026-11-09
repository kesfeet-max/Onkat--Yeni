import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { CustomerPhoneAuthForm } from '../components/CustomerPhoneAuthForm';
import { Phone, Lock, User, Building2, MapPin, AlertCircle, Store, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
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

const SECTORS = [
  { value: 'market', label: 'Market / Bakkal' },
  { value: 'restoran', label: 'Restoran / Kafe' },
  { value: 'temizlik', label: 'Temizlik / Kuru Temizleme' },
  { value: 'kozmetik', label: 'Kozmetik / Kuaför' },
  { value: 'elektronik', label: 'Elektronik' },
  { value: 'giyim', label: 'Giyim / Tekstil' },
  { value: 'diger', label: 'Diğer' },
];

const inputClass =
  'w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white focus:ring-2 focus:ring-secondary-200 focus:border-secondary-500 transition-all text-gray-900';

/** Esnaf kaydı: ad soyad, telefon, şifre ve dükkan bilgileri (e-posta istenmez). */
function MerchantRegisterForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    password: '',
    store_name: '',
    city: '',
    district: '',
    sector: '',
    latitude: 0,
    longitude: 0,
  });

  useEffect(() => {
    getCurrentLocation().then((location) => {
      if (location) setForm((prev) => ({ ...prev, latitude: location.latitude, longitude: location.longitude }));
      setIsLocating(false);
    });
  }, []);

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameResult = validateFullName(form.full_name);
    if (!nameResult.valid) return setError(nameResult.message ?? 'Geçersiz ad soyad');
    const phoneResult = validatePhone(form.phone);
    if (!phoneResult.valid) return setError(phoneResult.message ?? 'Geçersiz telefon');
    if (form.password.length < 6) return setError('Şifre en az 6 karakter olmalıdır');

    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ...form,
          phone: normalizePhoneInput(form.phone),
          full_name: normalizeFullName(form.full_name),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Kayıt başarısız');
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate('/giris?role=merchant'), 2000);
    } catch {
      setError('Kayıt sırasında bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-heading font-bold text-gray-900 mb-1">Kayıt Başarılı!</h2>
        <p className="text-gray-600 text-sm">Esnaf girişine yönlendiriliyorsunuz...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">Ad Soyad</label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            autoComplete="name"
            value={form.full_name}
            onChange={(e) => update('full_name', sanitizeFullNameInput(e.target.value))}
            className={`${inputClass} pl-12`}
            placeholder="Yetkili adı soyadı"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">Telefon Numarası</label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={PHONE_LENGTH}
            value={form.phone}
            onChange={(e) => update('phone', normalizePhoneInput(e.target.value))}
            className={`${inputClass} pl-12 tracking-wide`}
            placeholder="05XX XXX XX XX"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">Esnaf Şifresi</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className={`${inputClass} pl-12 pr-12`}
            placeholder="En az 6 karakter"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">Dükkan Adı</label>
        <div className="relative">
          <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={form.store_name}
            onChange={(e) => update('store_name', e.target.value)}
            className={`${inputClass} pl-12`}
            placeholder="Dükkanınızın adı"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">İl</label>
          <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} className={inputClass} placeholder="İstanbul" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">İlçe</label>
          <input type="text" value={form.district} onChange={(e) => update('district', e.target.value)} className={inputClass} placeholder="Kadıköy" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-2">Sektör</label>
        <select value={form.sector} onChange={(e) => update('sector', e.target.value)} className={inputClass}>
          <option value="">Sektör seçin</option>
          {SECTORS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-sm text-blue-800 font-medium">
        <MapPin className="w-4 h-4 flex-shrink-0" />
        {isLocating ? (
          <span>Konumunuz belirleniyor...</span>
        ) : form.latitude ? (
          <span>Konum: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</span>
        ) : (
          <span className="text-red-600">Konum erişimi gerekli. Tarayıcı izinlerini kontrol edin.</span>
        )}
      </div>

      <p className="text-[11px] sm:text-xs text-gray-500 leading-relaxed text-center">
        Kaydolarak{' '}
        <a href="/yasal/kvkk" target="_blank" rel="noopener noreferrer" className="text-primary-600 font-semibold underline">KVKK Aydınlatma Metni</a>{' '}
        ve{' '}
        <a href="/yasal/esnaf-kosullari" target="_blank" rel="noopener noreferrer" className="text-primary-600 font-semibold underline">Esnaf Üyelik Koşulları</a>{' '}
        hakkında bilgilendirildiğinizi kabul etmiş olursunuz.
      </p>

      <button
        type="submit"
        disabled={loading || !form.latitude}
        className="w-full bg-secondary-500 text-primary-900 py-4 rounded-xl font-bold hover:bg-secondary-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Kaydediliyor...' : 'Esnaf Kaydını Tamamla'}
      </button>
    </form>
  );
}

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [role, setRole] = useState<UserRole>(searchParams.get('role') === 'merchant' ? 'merchant' : 'customer');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/panel');
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <BrandLogo to="/" size="lg" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-gray-900">
              {role === 'customer' ? 'Üye Ol' : 'Esnaf Kaydı'}
            </h1>
            <p className="text-gray-500 mt-1.5 text-sm">
              {role === 'customer' ? 'Ad soyad ve telefon numaranızla saniyeler içinde' : 'Dükkanınızı Onkatı’ya ekleyin'}
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

          {role === 'customer' ? <CustomerPhoneAuthForm /> : <MerchantRegisterForm />}

          <p className="mt-6 text-center text-gray-500 text-sm">
            {role === 'customer' ? 'Esnaf mısınız? ' : 'Hesabınız var mı? '}
            <Link
              to={role === 'customer' ? '/kayit?role=merchant' : '/giris?role=merchant'}
              className="text-primary-600 font-semibold hover:text-primary-700"
            >
              {role === 'customer' ? 'Esnaf Kaydı' : 'Esnaf Girişi'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
