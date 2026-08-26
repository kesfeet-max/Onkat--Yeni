/**
 * Ad Soyad ve Telefon Numarası alanları için ortak doğrulama / normalizasyon kuralları.
 *
 * Kurallar:
 * 1. Ad Soyad alanına e-posta adresi (veya "@" içeren, e-posta benzeri) girdi yazılamaz.
 * 2. Telefon numarası her zaman başında 0 olacak şekilde, boşluksuz ve eksiksiz
 *    11 hane olmak zorundadır. Örn: 05074445588
 *
 * Bu modül hem anlık (onChange) maskeleme hem de form submit doğrulaması için kullanılır.
 */

/** Telefon numarasının zorunlu hane sayısı (baştaki 0 dahil). */
export const PHONE_LENGTH = 11;

/** Ad Soyad alanı için kullanıcıya gösterilen standart uyarı. */
export const FULL_NAME_ERROR = 'Lütfen geçerli bir ad ve soyad giriniz.';

/** Telefon alanı için kullanıcıya gösterilen standart uyarı. */
export const PHONE_ERROR =
  'Telefon numarası, başında 0 olacak şekilde 11 haneli olmalıdır. Örn: 05074445588';

export interface FieldValidation {
  valid: boolean;
  message?: string;
}

/* --------------------------------------------------------------------------- */
/* Telefon Numarası                                                            */
/* --------------------------------------------------------------------------- */

/** Metindeki rakam dışındaki tüm karakterleri (boşluk, parantez, tire, +) temizler. */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * Telefon girdisini `0XXXXXXXXXX` (11 hane) formatına normalize eder.
 *
 * - `+90`, `0090`, `90` ülke kodu varyasyonları temizlenir
 * - Kullanıcı baştaki 0'ı yazmasa bile (örn. `5073376385`) otomatik olarak eklenir
 * - Baştaki tekrarlı sıfırlar teke indirilir (örn. `00507...` -> `0507...`)
 * - Sonuç en fazla 11 haneye kısaltılır
 */
export function normalizePhoneInput(raw: string): string {
  let digits = digitsOnly(raw);
  if (!digits) return '';

  // Ülke kodu varyasyonlarını ayıkla
  if (digits.startsWith('0090')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('90') && digits.length > PHONE_LENGTH) {
    digits = digits.slice(2);
  }

  // Baştaki tekrarlı sıfırları teke indir
  digits = digits.replace(/^0+/, '0');

  // Başında 0 yoksa otomatik ekle
  if (!digits.startsWith('0')) {
    digits = `0${digits}`;
  }

  return digits.slice(0, PHONE_LENGTH);
}

/** Telefon numarasının tam 11 hane ve başında 0 olup olmadığını kontrol eder. */
export function isValidPhone(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length === PHONE_LENGTH && digits.startsWith('0') && digits[1] !== '0';
}

/** Form submit sırasında kullanılacak telefon doğrulaması. */
export function validatePhone(value: string, options: { required?: boolean } = {}): FieldValidation {
  const { required = true } = options;
  const normalized = normalizePhoneInput(value);

  if (!normalized) {
    return required
      ? { valid: false, message: 'Telefon numarası zorunludur.' }
      : { valid: true };
  }

  if (!isValidPhone(normalized)) {
    return { valid: false, message: PHONE_ERROR };
  }

  return { valid: true };
}

/* --------------------------------------------------------------------------- */
/* Ad Soyad                                                                    */
/* --------------------------------------------------------------------------- */

/** Ad Soyad alanında kabul edilen karakterler (Türkçe harfler, boşluk, kesme, tire, nokta). */
const NAME_ALLOWED_PATTERN = /^[A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]+$/;
const NAME_DISALLOWED_CHARS = /[^A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]/g;
const NAME_LETTERS_ONLY = /[^A-Za-zÇĞİÖŞÜçğıöşü]/g;

const EMAIL_STRICT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAIL_PROVIDER_PATTERN = /(gmail|hotmail|outlook|yahoo|icloud|yandex|mynet|proton|windowslive)/i;
const DOMAIN_SUFFIX_PATTERN = /\.(com|net|org|edu|gov|info|io|co|tr|de|nl)\b/i;
const AT_DISGUISE_PATTERN = /\(\s*at\s*\)|\[\s*at\s*\]/i;

/** Girdinin e-posta adresi veya e-posta benzeri bir metin olup olmadığını tespit eder. */
export function looksLikeEmail(value: string): boolean {
  const text = (value ?? '').trim();
  if (!text) return false;

  if (text.includes('@')) return true;
  if (EMAIL_STRICT_PATTERN.test(text)) return true;
  if (AT_DISGUISE_PATTERN.test(text)) return true;
  if (MAIL_PROVIDER_PATTERN.test(text)) return true;
  if (DOMAIN_SUFFIX_PATTERN.test(text)) return true;

  return false;
}

/**
 * Ad Soyad input'u için anlık maskeleme.
 *
 * "@", rakam ve diğer geçersiz karakterlerin input'a yazılmasını engeller;
 * böylece kullanıcı Ad Soyad alanına e-posta adresi yazamaz.
 */
export function sanitizeFullNameInput(raw: string): string {
  return (raw ?? '').replace(NAME_DISALLOWED_CHARS, '').slice(0, 60);
}

/** Fazla boşlukları temizleyerek kaydedilecek nihai Ad Soyad değerini üretir. */
export function normalizeFullName(value: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Form submit sırasında kullanılacak Ad Soyad doğrulaması.
 *
 * @param options.requireSurname Ad ve soyadın birlikte girilmesi zorunlu mu (varsayılan: true)
 * @param options.required Alan zorunlu mu (varsayılan: true)
 */
export function validateFullName(
  value: string,
  options: { requireSurname?: boolean; required?: boolean } = {}
): FieldValidation {
  const { requireSurname = true, required = true } = options;
  const text = normalizeFullName(value);

  if (!text) {
    return required
      ? { valid: false, message: 'Ad Soyad alanı zorunludur.' }
      : { valid: true };
  }

  // E-posta adresi veya e-posta benzeri girdi kesinlikle kabul edilmez
  if (looksLikeEmail(text)) {
    return { valid: false, message: FULL_NAME_ERROR };
  }

  if (/\d/.test(text) || !NAME_ALLOWED_PATTERN.test(text)) {
    return { valid: false, message: FULL_NAME_ERROR };
  }

  if (text.replace(NAME_LETTERS_ONLY, '').length < 3) {
    return { valid: false, message: FULL_NAME_ERROR };
  }

  if (requireSurname) {
    const parts = text
      .split(' ')
      .filter((part) => part.replace(NAME_LETTERS_ONLY, '').length >= 2);
    if (parts.length < 2) {
      return { valid: false, message: FULL_NAME_ERROR };
    }
  }

  return { valid: true };
}