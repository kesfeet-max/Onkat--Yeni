import { Link } from 'react-router-dom';
import {
  Gift,
  CalendarClock,
  Crown,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  CreditCard,
  HandCoins,
  Rocket,
} from 'lucide-react';

/**
 * Esnafa özel kademeli lansman fiyatlandırma adımları.
 * Her aşama; süre etiketi, fiyat gösterimi ve kısa açıklama içerir.
 */
const PRICING_STAGES = [
  {
    stage: '1. Aşama',
    period: 'İlk 1 Ay',
    icon: Gift,
    price: 'Tamamen Ücretsiz',
    priceNote: null as string | null,
    highlight: true,
    badge: 'Risksiz Deneme',
    description: 'Sistemi tüm özellikleriyle bir ay boyunca hiçbir ücret ödemeden deneyin.',
    perks: ['Kredi kartı gerekmez', 'Taahhüt yok', 'İstediğiniz an bırakın'],
  },
  {
    stage: '2. Aşama',
    period: '2 - 6. Aylar',
    icon: CalendarClock,
    price: '500 TL',
    priceNote: '/ ay',
    highlight: false,
    badge: 'İndirimli Lansman Dönemi',
    description: 'Lansman dönemine özel indirimli sabit fiyatla 5 ay boyunca kullanmaya devam edin.',
    perks: ['Sabit aylık ücret', 'Ciro üzerinden komisyon yok', 'Sürpriz masraf yok'],
  },
  {
    stage: '3. Aşama',
    period: '7. Aydan İtibaren',
    icon: Crown,
    price: '1.000 TL',
    priceNote: '/ ay',
    highlight: false,
    badge: 'Standart Abonelik',
    description: 'Sabit aylık abonelikle sınırsız kullanım ve tüm özellikler açık kalır.',
    perks: ['Sınırsız işlem', 'Tüm özellikler dahil', 'Kesintisiz destek'],
  },
] as const;

/** Fiyat kartının altındaki güven veren kısa vurgular. */
const PRICING_ASSURANCES = [
  { icon: CreditCard, text: 'İlk ay için kredi kartı bilgisi istenmez' },
  { icon: HandCoins, text: 'Ciro üzerinden komisyon kesintisi yok' },
  { icon: ShieldCheck, text: 'Gizli masraf ve uzun vadeli taahhüt yok' },
] as const;

/**
 * Ana sayfadaki esnafa özel kademeli fiyatlandırma / kampanya bölümü.
 * Amaç: esnafın sistemi risksiz test etmesini ve kayıt olmasını kolaylaştırmak.
 */
export function PricingSection() {
  return (
    <section id="fiyatlandirma" className="bg-gradient-to-b from-white via-primary-50/60 to-white py-6 sm:py-12 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Bölüm başlığı */}
        <div className="mb-4 text-center sm:mb-9 lg:mb-14">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-700 ring-1 ring-secondary-500/25 sm:px-4 sm:py-1.5 sm:text-sm">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Esnafa Özel Lansman Kampanyası
          </span>
          <h2 className="mt-2 font-heading text-xl font-bold leading-snug text-primary-700 sm:mt-5 sm:text-3xl md:text-4xl">
            Risksiz Başla, Kademeli Öde
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-snug text-gray-600 sm:mt-4 sm:text-base sm:leading-relaxed">
            İlk ay tamamen ücretsiz. Sonrasında ciro üzerinden komisyon değil, sadece net ve sabit bir aylık
            abonelik ödersiniz.
          </p>
          <div className="mx-auto mt-2.5 h-1 w-14 rounded-full bg-secondary-500 sm:mt-4 sm:w-24" />
        </div>

        {/* Kademeli fiyat kartı */}
        <div className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary-200 bg-white p-3.5 shadow-xl sm:rounded-3xl sm:p-7 lg:p-10">
            {/* Dekoratif yumuşak ışıma */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-secondary-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-primary-200/40 blur-3xl" />

            <div className="relative">
              <div className="mb-3 flex items-center gap-2 sm:mb-7 sm:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-md sm:h-12 sm:w-12">
                  <Rocket className="h-4 w-4 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-sm font-bold text-primary-800 sm:text-xl">
                    Esnaf Aboneliği — 3 Aşamalı Fiyatlandırma
                  </p>
                  <p className="text-[11px] leading-snug text-gray-600 sm:text-sm">
                    Kurulum ücreti yok, cihaz masrafı yok. Kasandaki telefonla hemen kullanmaya başla.
                  </p>
                </div>
              </div>

              {/* Aşamalar */}
              <ol className="grid grid-cols-1 gap-2.5 sm:gap-5 lg:grid-cols-3">
                {PRICING_STAGES.map(({ stage, period, icon: StageIcon, price, priceNote, highlight, badge, description, perks }) => (
                  <li
                    key={stage}
                    className={`relative flex h-full flex-col rounded-2xl border-2 p-3 transition-all duration-300 sm:p-5 ${
                      highlight
                        ? 'border-secondary-400 bg-secondary-50/70 shadow-lg ring-2 ring-secondary-400/30'
                        : 'border-gray-100 bg-gray-50/70 hover:border-primary-200 hover:bg-white hover:shadow-lg'
                    }`}
                  >
                    {/* Aşama etiketi */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:text-[11px] ${
                          highlight
                            ? 'bg-secondary-500 text-primary-900'
                            : 'bg-primary-600/10 text-primary-700 ring-1 ring-primary-600/20'
                        }`}
                      >
                        {stage}
                      </span>
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
                          highlight ? 'bg-secondary-500/20 text-secondary-700' : 'bg-primary-600/10 text-primary-700'
                        }`}
                      >
                        <StageIcon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] font-semibold text-gray-500 sm:mt-3 sm:text-sm">{period}</p>

                    {/* Fiyat — okunması en kolay alan */}
                    <div className="mt-1 flex flex-wrap items-baseline gap-1 sm:mt-1.5">
                      <span
                        className={`font-heading text-xl font-extrabold leading-none tracking-tight sm:text-3xl ${
                          highlight ? 'text-secondary-700' : 'text-primary-800'
                        }`}
                      >
                        {price}
                      </span>
                      {priceNote && (
                        <span className="text-[11px] font-semibold text-gray-500 sm:text-sm">{priceNote}</span>
                      )}
                    </div>

                    <p
                      className={`mt-1.5 inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-semibold sm:mt-2.5 sm:text-[11px] ${
                        highlight ? 'bg-white text-secondary-700' : 'bg-white text-primary-700'
                      }`}
                    >
                      {badge}
                    </p>

                    <p className="mt-1.5 text-[11px] leading-snug text-gray-600 sm:mt-3 sm:text-sm sm:leading-relaxed">
                      {description}
                    </p>

                    <ul className="mt-2 space-y-1 sm:mt-4 sm:space-y-1.5">
                      {perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-1.5 sm:gap-2">
                          <CheckCircle2
                            className={`mt-[1px] h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
                              highlight ? 'text-secondary-600' : 'text-primary-600'
                            }`}
                          />
                          <span className="text-[11px] leading-snug text-gray-700 sm:text-sm">{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>

              {/* Harekete geçirici buton */}
              <div className="mt-4 sm:mt-8">
                <Link
                  to="/kayit?role=merchant"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3.5 text-center font-heading text-sm font-bold text-white shadow-xl transition-all hover:from-primary-700 hover:to-primary-800 hover:shadow-2xl active:scale-[0.99] sm:gap-3 sm:rounded-2xl sm:px-8 sm:py-5 sm:text-lg"
                >
                  İlk Ayını Ücretsiz Başlat
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 sm:h-5 sm:w-5" />
                </Link>
                <p className="mt-2 text-center text-[11px] leading-snug text-gray-500 sm:mt-3 sm:text-sm">
                  Kayıt 2 dakika sürer. İlk ay için ödeme bilgisi istenmez.
                </p>
              </div>

              {/* Güven vurguları */}
              <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-gray-100 pt-3 sm:mt-7 sm:grid-cols-3 sm:gap-3 sm:pt-6">
                {PRICING_ASSURANCES.map(({ icon: AssuranceIcon, text }) => (
                  <div key={text} className="flex items-center gap-2 rounded-lg bg-primary-50/60 px-2.5 py-2 sm:px-3 sm:py-2.5">
                    <AssuranceIcon className="h-3.5 w-3.5 shrink-0 text-primary-600 sm:h-4 sm:w-4" />
                    <span className="text-[11px] font-medium leading-snug text-primary-800 sm:text-[13px]">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}