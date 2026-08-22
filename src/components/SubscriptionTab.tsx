import { useState } from 'react';
import {
  Copy,
  Check,
  Building2,
  MessageCircle,
  CalendarClock,
  ShieldCheck,
  AlertTriangle,
  Banknote,
  Sparkles,
  Info,
} from 'lucide-react';
import { TRIAL_DAYS, formatTrDate, type MerchantSubscriptionState } from '../lib/subscription';

/** Havale / EFT bilgileri — sistemde BAŞKA hiçbir ödeme yöntemi yoktur. */
const BANK_NAME = 'İş Bankası';
const ACCOUNT_HOLDER = 'Mustafa Koçak';
const IBAN = 'TR02 0006 4000 0014 5030 8033 64';
const WHATSAPP_NUMBER = '905073376385';

interface SubscriptionTabProps {
  storeCode: string;
  storeName: string;
  fullName: string;
  /** Merkezî hesaplanan abonelik durumu (eksik DB alanlarına karşı güvenli). */
  subscription: MerchantSubscriptionState;
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, ' ').trim());
    } catch {
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`truncate text-sm font-bold text-gray-800 ${mono ? 'font-mono tracking-tight' : ''}`}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </div>
  );
}

export function SubscriptionTab({ storeCode, storeName, fullName, subscription }: SubscriptionTabProps) {
  const isActive = subscription.isActive;
  const trialEndText = formatTrDate(subscription.trialEndDate);
  const paidUntilText = subscription.paidUntilDate ? formatTrDate(subscription.paidUntilDate) : null;

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Merhaba, ödememi Havale/EFT ile yaptım. Dekontumu gönderiyorum.\n\nAd Soyad: ${fullName}\nİşletme: ${storeName}\nMağaza Kodu: ${storeCode}`
  )}`;

  return (
    <div className="space-y-4 pb-4">
      {/* Durum kartı */}
      <div
        className={`rounded-2xl border p-4 shadow-sm ${
          isActive ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {isActive ? (
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
          )}
          <div className="min-w-0">
            <p className={`text-base font-bold ${isActive ? 'text-emerald-800' : 'text-red-800'}`}>
              {subscription.statusLabel}
            </p>
            <p className={`mt-1 text-sm ${isActive ? 'text-emerald-700' : 'text-red-700'}`}>
              {subscription.statusMessage}
            </p>
            {paidUntilText && (
              <p className={`mt-1 text-xs font-semibold ${isActive ? 'text-emerald-600' : 'text-red-600'}`}>
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
            <p className="text-sm font-bold text-gray-800">1 Ay ({TRIAL_DAYS} Gün)</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Bitiş Tarihi</p>
            <p className="text-sm font-bold text-gray-800">{trialEndText}</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Sisteme kayıt olduğunuz günden itibaren 30 gün boyunca tam yetkili ve aktif olarak kullanırsınız.
          Deneme süresi bittikten sonra ödemesi onaylanmayan hesaplar otomatik olarak pasife alınır.
        </p>
      </div>

      {/* Kampanya fiyatları */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-bold text-gray-800">Kampanya Fiyatlarımız</h3>
        </div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          “1 aylık ücretsiz deneme süreniz sona erdiğinde veya sistemden kesintisiz faydalanmak için kampanya
          fiyatlarımız:”
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border-2 border-amber-300 bg-white px-3 py-3">
            <div>
              <p className="text-sm font-bold text-gray-800">İlk 6 Ay</p>
              <p className="text-xs text-gray-500">Kampanyalı özel fiyat</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-amber-600">500 TL</p>
              <p className="text-[11px] font-semibold text-gray-400">/ ay</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Sonraki Aylar</p>
              <p className="text-xs text-gray-500">Standart abonelik</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-gray-700">1000 TL</p>
              <p className="text-[11px] font-semibold text-gray-400">/ ay</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mağaza kodu vurgusu */}
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-600 p-4 text-center shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">Mağaza Kodunuz</p>
        <p className="my-1 font-mono text-3xl font-extrabold uppercase tracking-widest text-white">{storeCode}</p>
        <p className="text-xs font-semibold text-emerald-50">
          Havale / EFT açıklama kısmına MUTLAKA bu kodu yazmanız gerekmektedir.
        </p>
      </div>

      {/* Havale / EFT bilgileri — TEK ödeme yöntemi */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-bold text-gray-800">Havale / EFT ile Ödeme</h3>
        </div>
        <p className="mb-3 text-xs font-semibold text-emerald-700">Sistemdeki tek ödeme yöntemidir.</p>
        <div className="space-y-2">
          <CopyRow label="Banka" value={BANK_NAME} />
          <CopyRow label="Alıcı Adı" value={ACCOUNT_HOLDER} />
          <CopyRow label="IBAN" value={IBAN} mono />
          <CopyRow label="Açıklama (Zorunlu)" value={storeCode} mono />
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-xs leading-relaxed text-blue-800">
            Ödemenizi yaptıktan sonra dekontunuzu WhatsApp üzerinden gönderin. Havale kontrolü yapıldıktan sonra
            hesabınız yetkilimiz tarafından aktif edilir.
          </p>
        </div>
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
              hiçbir şekilde talep edilmez. Ödemeler yalnızca yukarıdaki Havale / EFT bilgileri ile yapılır.
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