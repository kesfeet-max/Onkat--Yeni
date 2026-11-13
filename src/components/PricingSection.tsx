import { Link } from 'react-router-dom';
import {
  Gift,
  BadgeCheck,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  CreditCard,
  HandCoins,
} from 'lucide-react';

/**
 * Esnafa özel tekil kurumsal paket modeli.
 * Karmaşık kademeli tablo yerine iki net adım: ücretsiz ilk 14 gün + yıllık paket.
 */
const PLAN_STEPS = [
  {
    step: '1. Adım',
    title: 'İlk 14 Gün Tamamen Ücretsiz',
    price: '0 TL',
    priceNote: 'ilk 14 gün',
    tagline: 'Riski olmayan başlangıç',
    description: 'Tüm özellikleri 14 gün boyunca hiçbir ödeme yapmadan, taahhüt almadan deneyin.',
    perks: ['Kredi kartı gerekmez', 'Risk yok, taahhüt yok', 'Dilediğin zaman bırak'],
    featured: false,
    icon: Gift,
  },
  {
    step: '2. Adım',
    title: 'Yıllık Avantajlı Paket',
    price: '3.000 TL',
    priceNote: '/ yıl',
    tagline: 'Aylık sadece 250 TL',
    description:
      'Yıl boyunca sabit tek fiyat. Sürpriz ek maliyet yok, ciro üzerinden komisyon yok, tüm özellikler sınırsız açık.',
    perks: ['Sürpriz ek maliyet yok', 'Ciro üzerinden komisyon yok', '1 yıl boyunca sınırsız kullanım'],
    featured: true,
    icon: BadgeCheck,
  },
] as const;

/** Fiyat kartlarının altındaki güven veren kısa vurgular. */
const PRICING_ASSURANCES = [
  { icon: CreditCard, text: 'İlk ay için kredi kartı bilgisi istenmez' },
  { icon: HandCoins, text: 'Ciro üzerinden komisyon kesintisi yok' },
  { icon: ShieldCheck, text: 'Gizli masraf ve uzun vadeli taahhüt yok' },
] as const;

/**
 * Ana sayfadaki esnaf fiyatlandırma bölümü.
 * Tek odak noktası: şeffaf, sade ve kurumsal bir yıllık paket.
 */
export function PricingSection() {
  return (
    <section
      id="fiyatlandirma"
      className="bg-gradient-to-b from-white via-primary-50/60 to-white py-8 sm:py-14 lg:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Bölüm başlığı */}
        <div className="mx-auto mb-6 max-w-2xl text-center sm:mb-10 lg:mb-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-700 ring-1 ring-secondary-500/25 sm:px-4 sm:py-1.5 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Tek Paket, Tek Fiyat
          </span>
          <h2 className="mt-3 font-heading text-xl font-bold leading-snug text-primary-800 sm:mt-5 sm:text-3xl md:text-4xl">
            Esnaf Yıllık Kurumsal Paket
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-gray-600 sm:mt-4 sm:text-base">
            Kurulum ücreti yok, cihaz masrafı yok. Kasandaki telefonla hemen kullanmaya başla.
          </p>
          <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-secondary-500 sm:mt-4 sm:w-20" />
        </div>

        {/* İki sade adım */}
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-2 lg:items-stretch">
          {PLAN_STEPS.map(({ step, title, price, priceNote, tagline, description, perks, featured, icon: StepIcon }) => (
            <div
              key={step}
              className={`relative flex h-full flex-col overflow-hidden rounded-2xl p-4 transition-all duration-300 sm:rounded-3xl sm:p-7 ${
                featured
                  ? 'border border-secondary-500/40 bg-gradient-to-br from-primary-800 via-primary-800 to-primary-900 shadow-2xl'
                  : 'border border-gray-200/80 bg-white shadow-lg hover:border-primary-200'
              }`}
            >
              {/* Altın ışıma — yalnızca öne çıkan kartta */}
              {featured && (
                <>
                  <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-secondary-500/25 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-primary-500/30 blur-3xl" />
                  <span className="absolute right-3 top-3 rounded-full bg-secondary-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-900 sm:right-6 sm:top-6 sm:text-[11px]">
                    En Avantajlı
                  </span>
                </>
              )}

              <div className="relative flex items-center gap-2.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${
                    featured
                      ? 'bg-secondary-500/20 text-secondary-400 ring-1 ring-secondary-500/40'
                      : 'bg-primary-600/10 text-primary-700 ring-1 ring-primary-600/15'
                  }`}
                >
                  <StepIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-[10px] font-bold uppercase tracking-[0.14em] sm:text-[11px] ${
                      featured ? 'text-secondary-400' : 'text-secondary-700'
                    }`}
                  >
                    {step}
                  </p>
                  <h3
                    className={`font-heading text-sm font-bold leading-snug sm:text-lg ${
                      featured ? 'text-white' : 'text-primary-800'
                    }`}
                  >
                    {title}
                  </h3>
                </div>
              </div>

              {/* Fiyat */}
              <div className="relative mt-4 sm:mt-6">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span
                    className={`font-heading text-3xl font-extrabold leading-none tracking-tight sm:text-5xl ${
                      featured ? 'text-secondary-400' : 'text-primary-800'
                    }`}
                  >
                    {price}
                  </span>
                  <span
                    className={`text-xs font-semibold sm:text-sm ${featured ? 'text-primary-100' : 'text-gray-500'}`}
                  >
                    {priceNote}
                  </span>
                </div>
                <p
                  className={`mt-1.5 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold sm:mt-2 sm:text-xs ${
                    featured ? 'bg-secondary-500 text-primary-900' : 'bg-primary-50 text-primary-700'
                  }`}
                >
                  {tagline}
                </p>
              </div>

              <p
                className={`relative mt-3 text-[12px] leading-relaxed sm:mt-4 sm:text-sm ${
                  featured ? 'text-primary-100' : 'text-gray-600'
                }`}
              >
                {description}
              </p>

              <ul
                className={`relative mt-3 space-y-1.5 border-t pt-3 sm:mt-5 sm:space-y-2 sm:pt-4 ${
                  featured ? 'border-white/15' : 'border-gray-100'
                }`}
              >
                {perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2">
                    <CheckCircle2
                      className={`mt-[1px] h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
                        featured ? 'text-secondary-400' : 'text-primary-600'
                      }`}
                    />
                    <span
                      className={`text-[12px] leading-snug sm:text-sm ${featured ? 'text-primary-50' : 'text-gray-700'}`}
                    >
                      {perk}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Harekete geçirici buton */}
        <div className="mt-5 sm:mt-8">
          <Link
            to="/kayit?role=merchant"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-700 to-primary-800 px-4 py-3.5 text-center font-heading text-sm font-bold text-white shadow-xl ring-1 ring-secondary-500/30 transition-all hover:from-primary-800 hover:to-primary-900 hover:shadow-2xl hover:ring-secondary-500/60 active:scale-[0.99] sm:gap-3 sm:rounded-2xl sm:px-8 sm:py-5 sm:text-lg"
          >
            İlk Ayını Ücretsiz Başlat
            <ArrowRight className="h-4 w-4 shrink-0 text-secondary-400 transition-transform duration-300 group-hover:translate-x-1 sm:h-5 sm:w-5" />
          </Link>
          <p className="mt-2 text-center text-[11px] leading-snug text-gray-500 sm:mt-3 sm:text-sm">
            Kayıt 2 dakika sürer. İlk ay için ödeme bilgisi istenmez.
          </p>
        </div>

        {/* Güven vurguları */}
        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:mt-7 sm:grid-cols-3 sm:gap-3">
          {PRICING_ASSURANCES.map(({ icon: AssuranceIcon, text }) => (
            <div
              key={text}
              className="flex items-center gap-2 rounded-lg border border-primary-100/80 bg-white/70 px-2.5 py-2 sm:px-3 sm:py-2.5"
            >
              <AssuranceIcon className="h-3.5 w-3.5 shrink-0 text-primary-600 sm:h-4 sm:w-4" />
              <span className="text-[11px] font-medium leading-snug text-primary-800 sm:text-[13px]">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
