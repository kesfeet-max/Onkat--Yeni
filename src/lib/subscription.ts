/**
 * Esnaf abonelik durumu hesaplama katmanı.
 *
 * ÖNEMLİ KURAL (2026 güncellemesi):
 * Süresi dolan esnaf ARTIK otomatik olarak engellenmez. Deneme süresi veya
 * abonelik süresi bitse bile esnaf puan yükleyebilir ve çalışmaya devam eder.
 * İşlem yapma yetkisi YALNIZCA admin hesabı manuel olarak pasife aldığında kapanır.
 *
 * Veritabanındaki abonelik alanları (subscription_status, trial_ends_at,
 * subscription_paid_until) henüz migration çalışmadığı veya RLS/seçim nedeniyle
 * boş döndüğü senaryolarda uygulamanın çökmemesi için TÜM alanlar opsiyonel
 * kabul edilir ve güvenli varsayılanlara düşülür.
 */

/** Ücretsiz deneme süresi (gün) */
export const TRIAL_DAYS = 30;

/** Süre bitimine bu kadar gün kalınca "yakında bitiyor" uyarısı gösterilir. */
export const PAYMENT_WARNING_DAYS = 7;

/** Ham veritabanı satırı — hiçbir alanın var olduğu garanti edilmez. */
export interface MerchantSubscriptionSource {
  is_active?: boolean | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_paid_until?: string | null;
  created_at?: string | null;
}

export type SubscriptionPhase = 'trial' | 'paid' | 'expired' | 'suspended';

/** Uyarı şiddeti — banner ve rozet renkleri buna göre seçilir. */
export type SubscriptionWarningLevel = 'none' | 'warning' | 'critical';

export interface MerchantSubscriptionState {
  /** Panelde işlem yapılabilir mi? (yalnızca manuel pasife alma kapatır) */
  isActive: boolean;
  /** Hesap yönetici tarafından MANUEL olarak pasife alınmış mı? */
  isSuspended: boolean;
  /** Ücretsiz deneme süresi devam ediyor mu? */
  inTrial: boolean;
  /** Ödemesi onaylanmış aktif abonelik var mı? */
  hasPaidAccess: boolean;
  /** Süre dolmuş, ödeme bekleniyor mu? (engellemez, sadece uyarır) */
  isOverdue: boolean;
  /** Süre bitimine PAYMENT_WARNING_DAYS gün veya daha az kaldı mı? */
  isEndingSoon: boolean;
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
  /** Geçerli dönemden kalan gün (deneme veya ödenmiş abonelik) */
  daysLeft: number;
  /** Süre dolduysa kaç gün geçtiği (gecikme gün sayısı) */
  overdueDays: number;
  statusLabel: string;
  statusMessage: string;
  /** Panel üstündeki banner için uyarı şiddeti */
  warningLevel: SubscriptionWarningLevel;
  warningTitle: string;
  warningMessage: string;
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

function daysSince(target: Date | null, now: number): number {
  if (!target) return 0;
  const passed = Math.floor((now - target.getTime()) / MS_PER_DAY);
  return passed > 0 ? passed : 0;
}

/**
 * Yönetici tarafından MANUEL kapatılmış sayılan abonelik durumları.
 * 'expired' / 'overdue' burada YOKTUR — süre dolması artık engelleme sebebi değildir.
 */
const SUSPENDED_STATUSES = new Set(['suspended', 'cancelled', 'canceled', 'passive', 'inactive', 'blocked']);
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

  const hasPaidAccess = paidUntilDate ? paidUntilDate.getTime() > now : false;
  const inTrial = !hasPaidAccess && trialEndDate ? trialEndDate.getTime() > now : false;

  // Yalnızca yöneticinin manuel kapatması işlem yetkisini kaldırır.
  const flaggedInactive = source?.is_active === false;
  const isSuspended = flaggedInactive || SUSPENDED_STATUSES.has(status);

  // Süre dolsa bile esnaf çalışmaya devam eder.
  const isActive = !isSuspended;

  const isOverdue = !hasPaidAccess && !inTrial;
  const needsPayment = isOverdue || isSuspended;

  const trialDaysLeft = daysBetween(trialEndDate, now);
  const paidDaysLeft = daysBetween(paidUntilDate, now);
  const daysLeft = hasPaidAccess ? paidDaysLeft : inTrial ? trialDaysLeft : 0;

  const overdueReference = paidUntilDate && paidUntilDate.getTime() > (trialEndDate?.getTime() ?? 0)
    ? paidUntilDate
    : trialEndDate;
  const overdueDays = isOverdue ? daysSince(overdueReference, now) : 0;

  const isEndingSoon = !isOverdue && daysLeft > 0 && daysLeft <= PAYMENT_WARNING_DAYS;

  let phase: SubscriptionPhase;
  if (isSuspended) {
    phase = 'suspended';
  } else if (hasPaidAccess || PAID_STATUSES.has(status)) {
    phase = 'paid';
  } else if (inTrial) {
    phase = 'trial';
  } else {
    phase = 'expired';
  }

  let statusLabel: string;
  let statusMessage: string;
  let warningLevel: SubscriptionWarningLevel = 'none';
  let warningTitle = '';
  let warningMessage = '';

  switch (phase) {
    case 'paid':
      statusLabel = 'Aboneliğiniz Aktif';
      statusMessage = paidDaysLeft
        ? `Aboneliğiniz aktif olarak devam ediyor. Kalan süre: ${paidDaysLeft} gün.`
        : 'Aboneliğiniz aktif olarak devam ediyor.';
      if (isEndingSoon) {
        warningLevel = 'warning';
        warningTitle = `Aboneliğinizin bitimine ${paidDaysLeft} gün kaldı`;
        warningMessage =
          'Kesintisiz devam etmek için abonelik ödemenizi yakında gerçekleştirmenizi rica ederiz.';
      }
      break;
    case 'trial':
      statusLabel = 'Ücretsiz Deneme Sürenizde';
      statusMessage = `Ücretsiz deneme sürenizde tüm özellikler açık. Kalan süre: ${trialDaysLeft} gün.`;
      if (isEndingSoon) {
        warningLevel = 'warning';
        warningTitle = `Deneme sürenizin bitimine ${trialDaysLeft} gün kaldı`;
        warningMessage =
          'Lütfen abonelik ödemenizi gerçekleştirin. Ödemeniz olmasa da paneliniz çalışmaya devam eder, ancak kontrol sonrası hesabınız kapatılabilir.';
      }
      break;
    case 'suspended':
      statusLabel = 'Mağazanız Pasif';
      statusMessage =
        'Hesabınız yönetici tarafından pasife alınmıştır. Ödemeniz onaylanana kadar müşteri QR kodu okutamaz ve puan işlemi yapılamaz.';
      warningLevel = 'critical';
      warningTitle = 'Hesabınız pasif durumda';
      warningMessage =
        'Hesabınız yönetici tarafından pasife alınmıştır. Havale/EFT dekontunuzu ilettiğinizde hesabınız tekrar açılacaktır.';
      break;
    default:
      statusLabel = 'Ödemeniz Bekleniyor';
      statusMessage =
        'Kullanım süreniz doldu. Paneliniz çalışmaya devam ediyor; lütfen abonelik ödemenizi gerçekleştirin.';
      warningLevel = 'critical';
      warningTitle = 'Abonelik ödemeniz bekleniyor';
      warningMessage =
        overdueDays > 0
          ? `Ödeme sürenizin geçmesinin üzerinden ${overdueDays} gün geçti. Lütfen abonelik ödemenizi gerçekleştirin, aksi takdirde hesabınız kontrol sonrası kapatılabilir.`
          : 'Lütfen abonelik ödemenizi gerçekleştirin, aksi takdirde hesabınız kontrol sonrası kapatılabilir.';
      break;
  }

  return {
    isActive,
    isSuspended,
    inTrial,
    hasPaidAccess,
    isOverdue,
    isEndingSoon,
    needsPayment,
    phase,
    trialEndDate,
    paidUntilDate,
    trialDaysLeft,
    paidDaysLeft,
    daysLeft,
    overdueDays,
    statusLabel,
    statusMessage,
    warningLevel,
    warningTitle,
    warningMessage,
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