import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { UserRole } from '../types';

/** Google'ın resmi marka renklerini kullanan çok renkli "G" logosu. */
function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.97-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.46-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

interface GoogleAuthButtonProps {
  /**
   * Kullanıcının seçtiği rol (müşteri / esnaf). Google dönüşünde profil yoksa
   * bu rol ön seçili gelir. Giriş ekranında rol bilinmediği için boş bırakılır.
   */
  role?: UserRole;
  /** Buton üzerinde görünen metin. */
  label?: string;
  /** Butonun altında gösterilen kısa açıklama. */
  helperText?: string;
}

/**
 * "Google ile Devam Et" butonu.
 *
 * Mevcut e-posta/şifre formlarını değiştirmez; formların hemen üstünde
 * alternatif bir giriş yolu sunar. Supabase OAuth akışı başlatılır ve
 * kullanıcı `/google-tamamla` adresine geri döner.
 */
export function GoogleAuthButton({
  role,
  label = 'Google ile Devam Et',
  helperText,
}: GoogleAuthButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setLoading(true);

    const result = await signInWithGoogle(role);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Başarılı durumda tarayıcı Google'a yönlenir; spinner açık kalır.
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={label}
        className="group w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 bg-white text-gray-800 font-semibold text-[15px] sm:text-base shadow-sm hover:shadow-md hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="whitespace-nowrap">Google'a yönlendiriliyor...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110" />
            <span className="whitespace-nowrap">{label}</span>
          </>
        )}
      </button>

      {helperText && (
        <p className="mt-2 text-center text-[11px] sm:text-xs text-gray-500 font-medium">{helperText}</p>
      )}

      {/* Ayırıcı: Google butonu ile mevcut e-posta/şifre formu arasında */}
      <div className="flex items-center gap-3 my-5">
        <span className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">veya</span>
        <span className="flex-1 h-px bg-gray-200" />
      </div>
    </div>
  );
}
