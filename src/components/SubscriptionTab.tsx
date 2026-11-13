import {
  MessageCircle,
  CalendarClock,
  ShieldCheck,
  AlertTriangle,
  Banknote,
  Sparkles,
} from 'lucide-react';
import { TRIAL_DAYS, formatTrDate, type MerchantSubscriptionState } from '../lib/subscription';

/** Ödeme onayı iletişim kanalı. */
const WHATSAPP_NUMBER = '905073376385';

interface SubscriptionTabProps {
  storeCode: string;
  storeName: string;
  fullName: string;
  /** Merkezî hesaplanan abonelik durumu (eksik DB alanlarına karşı güvenli). */
  subscription: MerchantSubscriptionState;
}

export function SubscriptionTab({ storeCode, storeName, fullName, subscription }: SubscriptionTabProps) {
  /**
   * Durum kartı rengi uyarı şiddetine göre belirlenir.
   * Süresi dolan esnaf artık engellenmediği için "isActive" tek başına yeterli değildir.
   */
  const isActive = subscription.warningLevel === 'none';
  const isCritical = subscription.warningLevel === 'critical';
  const trialEndText = formatTrDate(subscription.trialEndDate);
  const paidUntilText = subscription.paidUntilDate ? formatTrDate(subscription.paidUntilDate) : null;

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Merhaba, abonelik ödememi tamamladım. Dekontumu gönderiyorum.\n\nAd Soyad: ${fullName}\nİşletme: ${storeName}\nMağaza Kodu: ${storeCode}`
  )}`;

  return (
    <div className="space-y-4 pb-4">
      {/* Durum kartı */}
      <div
        className={`rounded-2xl border p-4 shadow-sm ${
          isActive
            ? 'border-emerald-200 bg-emerald-50'
            : isCritical
              ? 'border-orange-300 bg-orange-50'
              : 'border-amber-300 bg-amber-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {isActive ? (
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" />
          )}
          <div className="min-w-0">
            <p className={`text-base font-bold ${isActive ? 'text-emerald-800' : 'text-orange-900'}`}>
              {subscription.statusLabel}
            </p>
            <p className={`mt-1 text-sm ${isActive ? 'text-emerald-700' : 'text-orange-800'}`}>
              {subscription.statusMessage}
            </p>
            {paidUntilText && (
              <p className={`mt-1 text-xs font-semibold ${isActive ? 'text-emerald-600' : 'text-orange-700'}`}>
                Abonelik geçerlilik tarihi: {paidUntilText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Deneme süresi bilgisi */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-bold text-gray-800">Ücretsiz Deneme Süresi</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Deneme Süresi</p>
            <p className="text-sm font-bold text-gray-800">{TRIAL_DAYS} Gün</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bitiş Tarihi</p>
            <p className="text-sm font-bold text-gray-800">{trialEndText}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Sisteme kayıt olduğunuz günden itibaren {TRIAL_DAYS} gün boyunca tam yetkili ve aktif olarak kullanırsınız.
          Deneme süreniz bittiğinde paneliniz otomatik olarak kapanmaz, işlemlerinize devam edebilirsiniz. Ancak
          abonelik ödemenizi yapmadığınız takdirde hesabınız kontrol sonrası yetkilimiz tarafından kapatılabilir.
        </p>
      </div>

      {/* Kampanya fiyatları */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-bold text-gray-800">Esnaf Yıllık Kurumsal Paket</h3>
        </div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {TRIAL_DAYS} günlük ücretsiz deneme süreniz sona erdiğinde, yıl boyunca geçerli tek ve sabit fiyat:
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border-2 border-amber-300 bg-white px-3 py-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Yıllık Paket</p>
              <p className="text-xs text-gray-500">Aylık sadece 250 TL'ye denk gelir</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-amber-600">3.000 TL</p>
              <p className="text-[11px] font-semibold text-gray-400">/ yıl</p>
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-xs leading-relaxed text-amber-900">
              1 yıl boyunca tüm özellikler sınırsız açık. Sürpriz ek maliyet ve ciro üzerinden komisyon yok.
            </p>
          </div>
        </div>
      </div>

      {/* Mağaza kodu vurgusu */}
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-600 p-4 text-center shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">Mağaza Kodunuz</p>
        <p className="my-1 font-mono text-3xl font-extrabold uppercase tracking-widest text-white">{storeCode}</p>
        <p className="text-xs font-semibold text-emerald-50">
          Mağaza kodunuzu ödeme ve destek görüşmelerinde kullanabilirsiniz.
        </p>
      </div>

      {/* Kredi kartı yasağı bilgilendirmesi */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
          <div>
            <p className="text-sm font-bold text-gray-800">Kart Güvenliği Politikamız</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">
              Kart güvenliği ve yeni kayıt sürecimiz gereği panelimizde kredi kartı, banka kartı çekim formu veya
              herhangi bir online kart ödeme modülü <span className="font-bold">bulunmamaktadır</span>. Kart bilgileriniz
              hiçbir şekilde talep edilmez. Ödeme ve abonelik işlemleri için yetkili ekibimizle iletişime geçebilirsiniz.
            </p>
          </div>
        </div>
      </div>

      {/* WhatsApp onay butonu */}
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-4 text-center text-sm font-extrabold text-white shadow-lg transition hover:bg-[#1EBE5B] active:scale-[0.99]"
      >
        <MessageCircle className="h-5 w-5" />
        Ödemeyi Yaptım, Dekont Gönder / WhatsApp ile Onayla
      </a>
      <p className="pb-2 text-center text-[11px] text-gray-400">
        Mesajınızda adınız ve mağaza kodunuz otomatik olarak hazır gelir.
      </p>
    </div>
  );
}