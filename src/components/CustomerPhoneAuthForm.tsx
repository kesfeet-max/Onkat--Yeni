import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, User, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { toast } from '../lib/toast';
import {
  PHONE_LENGTH,
  normalizePhoneInput,
  sanitizeFullNameInput,
  normalizeFullName,
  validateFullName,
  validatePhone,
} from '../lib/validation';

/**
 * Müşteri için tek ekranlık giriş / kayıt formu.
 *
 * Yalnızca "Ad Soyad" ve "Telefon Numarası" istenir. Şifre, SMS kodu veya
 * e-posta hiçbir aşamada sorulmaz: numara kayıtlıysa müşteri tanınır,
 * değilse ad soyad ile saniyesinde hesap açılır.
 */
export function CustomerPhoneAuthForm() {
  const { signInCustomerWithPhone } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nameResult = validateFullName(fullName);
    const phoneResult = validatePhone(phone);
    setNameError(nameResult.valid ? null : nameResult.message ?? null);
    setPhoneError(phoneResult.valid ? null : phoneResult.message ?? null);
    if (!nameResult.valid || !phoneResult.valid) return;

    setLoading(true);
    const result = await signInCustomerWithPhone(normalizePhoneInput(phone), normalizeFullName(fullName));
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success(
      result.isNew ? 'Hoş geldiniz!' : 'Tekrar hoş geldiniz!',
      result.isNew ? 'Hesabınız oluşturuldu' : result.fullName || undefined
    );
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
        <label htmlFor="customer-full-name" className="block text-sm font-semibold text-gray-800 mb-2">
          Ad Soyad
        </label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="customer-full-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(sanitizeFullNameInput(e.target.value));
              setNameError(null);
            }}
            className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 bg-white text-gray-900 text-base transition-all focus:ring-2 ${
              nameError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:border-primary-500 focus:ring-primary-200'
            }`}
            placeholder="Örn: Ayşe Yılmaz"
          />
        </div>
        {nameError && <p className="text-xs text-red-600 mt-1.5 font-semibold">{nameError}</p>}
      </div>

      <div>
        <label htmlFor="customer-phone" className="block text-sm font-semibold text-gray-800 mb-2">
          Telefon Numarası
        </label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            id="customer-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={PHONE_LENGTH}
            value={phone}
            onChange={(e) => {
              setPhone(normalizePhoneInput(e.target.value));
              setPhoneError(null);
            }}
            className={`w-full pl-12 pr-4 py-3.5 rounded-xl border-2 bg-white text-gray-900 text-base tracking-wide transition-all focus:ring-2 ${
              phoneError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:border-primary-500 focus:ring-primary-200'
            }`}
            placeholder="05XX XXX XX XX"
          />
        </div>
        {phoneError && <p className="text-xs text-red-600 mt-1.5 font-semibold">{phoneError}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary-600 text-white py-4 rounded-xl font-bold text-base hover:bg-primary-700 transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Giriş yapılıyor...
          </>
        ) : (
          'Devam Et'
        )}
      </button>

      <p className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
        Şifre veya SMS kodu gerekmez. Numaranız kayıtlıysa hesabınız açılır, değilse saniyeler içinde
        yeni hesabınız oluşturulur.
      </p>
    </form>
  );
}
