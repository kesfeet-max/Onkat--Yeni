/**
 * Esnaf abonelik durumu hesaplama katmanı.
 *
 * Veritabanındaki abonelik alanları (subscription_status, trial_ends_at,
 * subscription_paid_until) henüz migration çalışmadığı veya RLS/seçim nedeniyle
 * boş döndüğü senaryolarda uygulamanın çökmemesi için TÜM alanlar opsiyonel
 * kabul edilir ve güvenli varsayılanlara düşülür.
 */

/** Ücretsiz deneme süresi (gün) */
export const TRIAL_DAYS = 30;

/** Ham veritabanı satırı — hiçbir alanın var olduğu garanti edilmez. */
export interface MerchantSubscriptionSource {
  is_active?: boolean | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_paid_until?: string | null;
  created_at?: string | null;
}

export type SubscriptionPhase = 'trial' | 'paid' | 'expired' | 'suspended';

export interface MerchantSubscriptionState {
  /** Panelde işlem yapılabilir mi? */
  isActive: boolean;
  /** Hesap yönetici tarafından pasife alınmış mı? */
  isSuspended: boolean;
  /** Ücretsiz deneme süresi devam ediyor mu? */
  inTrial: boolean;
  /** Ödemesi onaylanmış aktif abonelik var mı? */
  hasPaidAccess: boolean;
  /** Ödeme yapılması gerekiyor mu? (kırmızı uyarı noktası bu alana bağlıdır) */
  needsPayment: boolean;
  phase: SubscriptionPhase;
  /** Deneme süresi bitiş tarihi (hesaplanamazsa null) */
  trialEndDate: Date | null;
  /** Aboneliğin geçerli olduğu son tarih (yoksa null) */
  paidUntilDate: Date | null;
  /** Deneme süresinden kalan gün sayısı (negatif olmaz) */
  trialDaysLeft: number;
  /** Ödenmiş abonelikten kalan gün sayısı (negatif olmaz) */
  paidDaysLeft: number;
  statusLabel: string;
  statusMessage: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Geçersiz/boş tarih değerlerinde null döndüren güvenli ayrıştırıcı. */
function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(target: Date | null, now: number): number {
  if (!target) return 0;
  const remaining = Math.ceil((target.getTime() - now) / MS_PER_DAY);
  return remaining > 0 ? remaining : 0;
}

/** Yönetici tarafından kapatılmış sayılan abonelik durumları. */
const SUSPENDED_STATUSES = new Set(['suspended', 'cancelled', 'canceled', 'expired', 'passive', 'inactive']);
/** Ödemesi onaylanmış sayılan abonelik durumları. */
const PAID_STATUSES = new Set(['active', 'paid', 'subscribed']);

/**
 * Ham esnaf satırından güvenli abonelik durumu üretir.
 * `source` null/undefined olsa bile asla hata atmaz.
 */
export function resolveMerchantSubscription(
  source?: MerchantSubscriptionSource | null
): MerchantSubscriptionState {
  const now = Date.now();
  const status = (source?.subscription_status || '').toString().trim().toLowerCase();

  const createdAt = parseDate(source?.created_at);
  const explicitTrialEnd = parseDate(source?.trial_ends_at);
  const trialEndDate =
    explicitTrialEnd ||
    (createdAt ? new Date(createdAt.getTime() + TRIAL_DAYS * MS_PER_DAY) : null);

  const paidUntilDate = parseDate(source?.subscription_paid_until);

  const hasPaidAccess = paidUntilDate ? paidUntilDate.getTime() > now : PAID_STATUSES.has(status);
  const inTrial = !hasPaidAccess && trialEndDate ? trialEndDate.getTime() > now : false;

  // is_active alanı okunamadıysa (undefined) kullanıcıyı kilitlememek için aktif kabul edilir.
  const flaggedInactive = source?.is_active === false;
  const isSuspended = flaggedInactive || SUSPENDED_STATUSES.has(status);

  const isActive = !isSuspended && (hasPaidAccess || inTrial || status === '' || PAID_STATUSES.has(status));
  const needsPayment = !isActive || (!hasPaidAccess && !inTrial);

  let phase: SubscriptionPhase;
  if (isSuspended) {
    phase = 'suspended';
  } else if (hasPaidAccess) {
    phase = 'paid';
  } else if (inTrial) {
    phase = 'trial';
  } else {
    phase = 'expired';
  }

  const trialDaysLeft = daysBetween(trialEndDate, now);
  const paidDaysLeft = daysBetween(paidUntilDate, now);

  let statusLabel: string;
  let statusMessage: string;

  switch (phase) {
    case 'paid':
      statusLabel = 'Aboneliğiniz Aktif';
      statusMessage = paidDaysLeft
        ? `Aboneliğiniz aktif olarak devam ediyor. Kalan süre: ${paidDaysLeft} gün.`
        : 'Aboneliğiniz aktif olarak devam ediyor. Kesintisiz hizmet için ödemelerinizi zamanında yapmanız gerekir.';
      break;
    case 'trial':
      statusLabel = 'Ücretsiz Deneme Sürenizde';
      statusMessage = `Ücretsiz deneme sürenizde tüm özellikler açık. Kalan süre: ${trialDaysLeft} gün.`;
      break;
    case 'suspended':
      statusLabel = 'Mağazanız Pasif';
      statusMessage =
        'Hesabınız şu anda pasif durumda. Ödemeniz onaylanana kadar müşteri QR kodu okutamaz ve puan işlemi yapılamaz.';
      break;
    default:
      statusLabel = 'Kullanım Süreniz Doldu';
      statusMessage =
        'Hesabınızın kullanım süresi dolmuştur, lütfen ödeme yapınız. Ödemeniz onaylanana kadar puan işlemi yapılamaz.';
      break;
  }

  return {
    isActive,
    isSuspended,
    inTrial,
    hasPaidAccess,
    needsPayment,
    phase,
    trialEndDate,
    paidUntilDate,
    trialDaysLeft,
    paidDaysLeft,
    statusLabel,
    statusMessage,
  };
}

/** Mağaza kodunu (ONK-0001) her koşulda güvenli üretir. */
export function buildStoreCode(storeId?: number | string | null): string {
  const numeric = Number(storeId);
  const safe = Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
  return `ONK-${String(safe).padStart(4, '0')}`;
}

/** Tarihi Türkçe uzun formatta güvenli biçimlendirir. */
export function formatTrDate(date?: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return 'Belirtilmedi';
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}