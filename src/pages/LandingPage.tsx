import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PwaInstallBanner } from '../components/PwaInstallBanner';
import { BrandLogo } from '../components/BrandLogo';
import {
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  MapPin,
  QrCode,
  Wallet,
  Store,
  MessageCircle,
  Clock,
  CheckCircle2,
  Percent,
  HandCoins,
  Zap,
  ShieldCheck,
  UserPlus,
  ScanLine,
  Calculator,
  Gift,
  Heart,
  PiggyBank,
  Megaphone,
  Sparkles,
  CalendarClock
} from 'lucide-react';

/**
 * Ana sayfa karşılama alanındaki 4 vurucu avantaj maddesi.
 * Üye olmayan ziyaretçiler (hem esnaf hem müşteri) için ilk izlenim alanı.
 */
const HERO_HIGHLIGHTS = [
  {
    icon: Percent,
    title: "%25'e Varan Puanlar",
    description: 'Müşterilere kazandıran oranlar',
  },
  {
    icon: HandCoins,
    title: '0 TL Komisyon',
    description: 'Esnaflar için sıfır kesinti',
  },
  {
    icon: Zap,
    title: 'Anında Puan',
    description: 'Saniyeler içinde cüzdan yüklemesi',
  },
  {
    icon: ShieldCheck,
    title: 'Güvenli Altyapı',
    description: 'Şeffaf ve korumalı sistem',
  },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <WhyOnkatiSection />
      <AboutSection />
      <HowItWorksSection />
      <FAQSection />
      <ContactSection />
      <PwaInstallBanner variant="customer" />
    </div>
  );
}

function Navbar() {
  return (
    <nav className="bg-primary-600 shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20 md:h-24">
          <BrandLogo to="/" size="lg" />
          <div className="flex items-center gap-4">
            <Link
              to="/giris"
              className="text-white hover:text-secondary-300 transition-colors px-4 py-2 text-sm font-medium"
            >
              Giriş Yap
            </Link>
            <Link
              to="/kayit"
              className="bg-secondary-500 text-primary-900 px-6 py-2 rounded-lg font-semibold text-sm hover:bg-secondary-400 transition-colors shadow-md"
            >
              Kayıt Ol
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold leading-tight mb-6">
              Birlikte
              <span className="text-secondary-400"> Güçlenelim</span>
            </h1>
            <p className="text-xl text-primary-100 mb-8 leading-relaxed">
              Mahalle kültürüyle buluşan yepyeni bir sadakat sistemi.
              Her alışverişte <span className="text-secondary-300 font-semibold">%25'e varan puanlar kazan</span>,
              esnafımızla birlikte büyü.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/kayit?role=customer"
                className="bg-secondary-500 text-primary-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-secondary-400 transition-all shadow-xl flex items-center gap-2"
              >
                <Wallet className="w-5 h-5" />
                Müşteri Ol
              </Link>
              <Link
                to="/kayit?role=merchant"
                className="bg-white text-primary-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all shadow-xl flex items-center gap-2"
              >
                <Store className="w-5 h-5" />
                Esnaf Ol
              </Link>
            </div>
          </div>
          {/* Avantaj kartları — üye olmayan ziyaretçiler için karşılama alanı */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-xl">
              <div className="absolute -inset-6 bg-secondary-400/20 blur-3xl rounded-full"></div>
              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HERO_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                  <div
                    key={title}
                    className="group relative overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-secondary-400/60 hover:bg-white/[0.16] hover:shadow-[0_22px_45px_-18px_rgba(0,0,0,0.6)]"
                  >
                    {/* Köşedeki altın ışıma */}
                    <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-secondary-400/25 blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100"></div>

                    <div className="relative flex items-start gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-secondary-400/40 bg-secondary-400/15 text-secondary-300 transition-transform duration-300 group-hover:scale-110">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-heading text-lg font-bold leading-snug text-white">
                          {title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-primary-100">
                          {description}
                        </p>
                      </div>
                    </div>

                    {/* Alt vurgu çizgisi */}
                    <div className="absolute bottom-0 left-0 h-[3px] w-0 rounded-full bg-gradient-to-r from-secondary-400 to-secondary-300 transition-all duration-500 group-hover:w-full"></div>
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

/**
 * "Mahalle Kültürü" bölümünün sağındaki 4 açıklayıcı kart.
 * Metinler net, profesyonel ve doğrulanabilir bilgiler içerir.
 */
const ABOUT_CARDS = [
  {
    icon: TrendingUp,
    title: 'Net Kazanç',
    description: "Her alışverişte %25'e varan puanlar birikir, cüzdanınız anında dolar."
  },
  {
    icon: HandCoins,
    title: 'Sıfır Komisyon',
    description: 'Esnaflarımız kazancından kesinti yaşamaz, tüm gelir işletmede kalır.'
  },
  {
    icon: Users,
    title: 'Mahalle Dayanışması',
    description: 'Esnaf ve müşteri birlikte güçlenir, mahalle ekonomisi canlanır.'
  },
  {
    icon: QrCode,
    title: 'Kolay Kullanım',
    description: 'Müşteri sabit QR kodunu gösterir, esnaf kasada okutup tutarı girer. Saniyeler içinde işlem tamamlanır.'
  }
];

const ABOUT_FEATURES = ['Cihaz masrafı yok', 'Pos komisyonu yok', 'Ekstra donanım gerektirmez'];

/** "Neden Onkatı?" bölümündeki esnaf tarafı avantajları. */
const MERCHANT_BENEFITS = [
  {
    icon: CalendarClock,
    label: 'Boş Zamanlara Çözüm',
    text: 'Dükkanın boş kaldığı sakin saatlerde müşterilerinize özel ek puan avantajları sunarak dükkanınızı yeniden hareketlendirin.'
  },
  {
    icon: HandCoins,
    label: 'Sıfır Komisyon & Maliyet',
    text: 'Banka POS komisyonları veya pahalı reklam ajansları yok; kazancınız tamamen cebinizde kalır.'
  },
  {
    icon: Heart,
    label: 'Sıcak Esnaf İlişkisi',
    text: 'Mahallenin favori esnafı olun, dijital dünyanın soğukluğunda kaybolmadan müşterinizle birebir bağ kurun.'
  }
] as const;

/** "Neden Onkatı?" bölümündeki müşteri tarafı avantajları. */
const CUSTOMER_BENEFITS = [
  {
    icon: PiggyBank,
    label: 'Gerçek Tasarruf',
    text: "Artan hayat pahalılığında ve enflasyonda bütçenizi koruyun; her alışverişte %25'e varan net puanlar biriktirin."
  },
  {
    icon: Store,
    label: 'Sıcak Esnaf Güveni',
    text: 'Tanıdığınız, bildiğiniz mahalle esnafından güvenle alışveriş yapın, her alışverişiniz size ve çevrenize geri dönsün.'
  },
  {
    icon: QrCode,
    label: 'Anında Cüzdan Kolaylığı',
    text: 'Karmaşık uygulamalar veya kartlar taşımanıza gerek yok; sabit QR kodunuzu gösterin, saniyeler içinde puanlarınız cüzdanınıza yansısın.'
  }
] as const;

interface BenefitCardProps {
  eyebrow: string;
  eyebrowIcon: typeof Store;
  title: string;
  benefits: readonly { icon: typeof Store; label: string; text: string }[];
  variant: 'merchant' | 'customer';
}

/**
 * "Neden Onkatı?" bölümünde kullanılan büyük avantaj kartı.
 * variant, esnaf (altın) ve müşteri (yeşil) renk şemasını belirler.
 */
function BenefitCard({ eyebrow, eyebrowIcon: EyebrowIcon, title, benefits, variant }: BenefitCardProps) {
  const isMerchant = variant === 'merchant';

  const styles = isMerchant
    ? {
        card: 'border-secondary-200 hover:border-secondary-400',
        glow: 'from-secondary-100/70',
        badge: 'bg-secondary-500/10 text-secondary-700 ring-1 ring-secondary-500/20',
        title: 'text-secondary-800',
        iconBox: 'bg-secondary-500/10 text-secondary-700 group-hover/item:bg-secondary-500 group-hover/item:text-white',
        rule: 'bg-secondary-500'
      }
    : {
        card: 'border-primary-200 hover:border-primary-400',
        glow: 'from-primary-100/70',
        badge: 'bg-primary-600/10 text-primary-700 ring-1 ring-primary-600/20',
        title: 'text-primary-800',
        iconBox: 'bg-primary-600/10 text-primary-700 group-hover/item:bg-primary-600 group-hover/item:text-white',
        rule: 'bg-primary-600'
      };

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border-2 bg-white p-7 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:p-9 ${styles.card}`}
    >
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br to-transparent blur-2xl ${styles.glow}`}
      />

      <div className="relative">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide sm:text-sm ${styles.badge}`}
        >
          <EyebrowIcon className="h-4 w-4" />
          {eyebrow}
        </span>

        <h3 className={`mt-5 font-heading text-2xl font-bold leading-snug sm:text-3xl ${styles.title}`}>
          {title}
        </h3>

        <div className={`mt-5 h-1 w-16 rounded-full ${styles.rule}`} />

        <ul className="mt-7 space-y-6">
          {benefits.map((benefit) => {
            const BenefitIcon = benefit.icon;

            return (
              <li key={benefit.label} className="group/item flex gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-300 ${styles.iconBox}`}
                >
                  <BenefitIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-heading text-base font-bold text-gray-900 sm:text-lg">{benefit.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600 sm:text-base">{benefit.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Yeşil karşılama alanının hemen altındaki ilk beyaz bölüm.
 * Esnaf ve müşteri tarafının kazancını yan yana iki büyük kartta anlatır.
 */
function WhyOnkatiSection() {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-4 py-1.5 text-sm font-semibold text-primary-700 ring-1 ring-primary-100">
            <Sparkles className="h-4 w-4" />
            Avantajlar ve Çözümler
          </span>
          <h2 className="mt-5 font-heading text-3xl font-bold text-primary-700 md:text-4xl">
            Neden Onkatı?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600">
            Onkatı tek taraflı bir kampanya değil; esnafın kazancını korurken müşterinin bütçesini rahatlatan
            karşılıklı bir kazanç bağıdır.
          </p>
          <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-secondary-500" />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <BenefitCard
            eyebrow="Esnaflar İçin Neden Onkatı?"
            eyebrowIcon={Megaphone}
            title="Reklam Bütçelerini Çöpe Atmayın, Sadık Müşteri Kazanın"
            benefits={MERCHANT_BENEFITS}
            variant="merchant"
          />
          <BenefitCard
            eyebrow="Müşteriler İçin Neden Onkatı?"
            eyebrowIcon={Wallet}
            title="Alışveriş Yaptıkça Kazanın, Bütçenizi Koruyun"
            benefits={CUSTOMER_BENEFITS}
            variant="customer"
          />
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Mahalle Kültürü, Modern Sadakatle Buluşuyor
          </h2>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              <span className="text-secondary-600 font-semibold">'Damla damla göl olur'</span> vizyonuyla;
              kurumsal devlerin kasalarını dolduran sistemlere karşı, mahalle esnafını ve komşularımızı
              birbirine bağlayan <span className="font-semibold text-primary-600">yerel bir dayanışma hareketi</span> kurduk.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Müşterilerimiz alışveriş yaptıkça biriken puanlarla bütçesini korurken, esnafımız
              komisyonsuz ve sadık bir müşteri ağı kazanır.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {ABOUT_FEATURES.map((feature) => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-4 py-2 text-sm font-medium text-primary-700 shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-secondary-500" />
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {ABOUT_CARDS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-secondary-200 hover:shadow-2xl"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-secondary-200/50 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-md transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="relative mb-2 font-heading text-lg font-semibold text-gray-900">
                  {title}
                </h3>
                <p className="relative text-sm leading-relaxed text-gray-600">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Gerçek işleyişe göre müşteri adımları.
 * Müşteri kendi sabit QR kodunu gösterir; esnafın kodunu taramaz.
 */
const CUSTOMER_STEPS = [
  {
    icon: UserPlus,
    title: 'Kayıt Ol',
    description: 'Telefon numaranla saniyeler içinde hızlıca kayıt ol, kişisel cüzdanını aç.'
  },
  {
    icon: QrCode,
    title: 'QR Kodunu Göster',
    description: 'Kasadaki alışveriş sırasında telefonundaki sabit kişisel QR kodunu esnafa göster.'
  },
  {
    icon: Zap,
    title: 'Puanını Al',
    description: 'Esnaf alışveriş tutarını girdiğinde puanın anında cüzdanına yansısın.'
  },
  {
    icon: Gift,
    title: 'Puanlarını Harca',
    description: 'Kazandığın puanları biriktir, aynı dükkanda sonraki alışverişlerinde indirim olarak doya doya kullan.'
  }
];

/**
 * Gerçek işleyişe göre esnaf adımları.
 * Esnaf kasada müşterinin QR kodunu okutur; kasaya karekod asmaz.
 */
const MERCHANT_STEPS = [
  {
    icon: Store,
    title: 'Hızlıca Katıl',
    description: 'İşletme bilgilerini girerek sisteme hemen dükkanını kaydet.'
  },
  {
    icon: ScanLine,
    title: 'Müşteri QR Kodunu Okut',
    description: 'Kasandaki telefon, tablet veya bilgisayardan esnaf paneline gir, müşterinin uzattığı QR kodu okut.'
  },
  {
    icon: Calculator,
    title: 'Tutar Gir & Onayla',
    description: 'Alışveriş tutarını sisteme gir ve puan yükleme işlemini anında onayla.'
  },
  {
    icon: Heart,
    title: 'Sadık Müşteri Kazan',
    description: "Müşterine %25'e varan puanlar vererek cironu artır, mahallenin favori esnafı ol."
  }
];

type FlowStep = {
  icon: typeof Store;
  title: string;
  description: string;
};

type FlowColumnProps = {
  title: string;
  headerIcon: typeof Store;
  steps: FlowStep[];
  variant: 'customer' | 'merchant';
};

/**
 * Nasıl Çalışır bölümünün tek bir sütununu (müşteri veya esnaf akışı) render eder.
 */
function FlowColumn({ title, headerIcon: HeaderIcon, steps, variant }: FlowColumnProps) {
  const isCustomer = variant === 'customer';

  const cardClass = isCustomer
    ? 'bg-gradient-to-br from-primary-50 to-primary-100 border-primary-100'
    : 'bg-gradient-to-br from-secondary-50 to-secondary-100 border-secondary-200';
  const titleClass = isCustomer ? 'text-primary-700' : 'text-secondary-700';
  const badgeClass = isCustomer
    ? 'bg-primary-600 text-white'
    : 'bg-secondary-600 text-white';
  const iconClass = isCustomer
    ? 'bg-white text-primary-600 ring-primary-200'
    : 'bg-white text-secondary-600 ring-secondary-200';
  const lineClass = isCustomer ? 'bg-primary-200' : 'bg-secondary-200';

  return (
    <div className={`rounded-2xl border p-6 sm:p-8 shadow-sm ${cardClass}`}>
      <h3 className={`mb-8 flex items-center gap-3 font-heading text-2xl font-bold ${titleClass}`}>
        <HeaderIcon className="h-7 w-7" />
        {title}
      </h3>

      <ol className="space-y-6">
        {steps.map(({ icon: Icon, title: stepTitle, description }, index) => (
          <li key={stepTitle} className="relative flex gap-4">
            {/* Adımları birbirine bağlayan dikey çizgi */}
            {index < steps.length - 1 && (
              <span
                className={`absolute left-[21px] top-12 h-[calc(100%+0.5rem)] w-0.5 ${lineClass}`}
                aria-hidden="true"
              ></span>
            )}

            <div className="relative z-10 shrink-0">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 shadow-sm ${iconClass}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow ${badgeClass}`}
              >
                {index + 1}
              </span>
            </div>

            <div className="pt-1">
              <p className="font-heading font-semibold text-gray-900">{stepTitle}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Nasıl Çalışır?
          </h2>
          <p className="mx-auto max-w-2xl text-gray-600">
            Kasada tek hareketle tamamlanan, cihaz gerektirmeyen basit bir akış.
          </p>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full mt-4"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          <FlowColumn
            title="Müşteriler İçin"
            headerIcon={Wallet}
            steps={CUSTOMER_STEPS}
            variant="customer"
          />
          <FlowColumn
            title="Esnaflar İçin"
            headerIcon={Store}
            steps={MERCHANT_STEPS}
            variant="merchant"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Sıkça Sorulan Sorular içeriği.
 * Metinler gerçek işleyişe göre yazılmıştır: bulut tabanlı web uygulaması,
 * havuz sistemi değil, komisyonsuz ve müşteriye ait sabit şifreli QR kod.
 */
const FAQ_ITEMS = [
  {
    icon: Store,
    question: 'Esnaf olarak bu sistemde neden hiçbir cihaz kurmuyorum?',
    answer:
      'Çünkü Onkatı tamamen bulut tabanlı bir web uygulamasıdır. Ekstra bir POS cihazı, kablo veya donanım maliyeti gerektirmez. Kasadaki akıllı telefonunuz, tabletiniz veya bilgisayarınız üzerinden saniyeler içinde işlem yapabilirsiniz.'
  },
  {
    icon: Wallet,
    question: 'Kazanılan puanlar ne kadar süre geçerlidir ve nerede harcanır?',
    answer:
      'Onkatı bir havuz sistemi değildir. Müşteriler kazandıkları puanları sadece puanı aldıkları aynı esnafta sonraki alışverişlerinde indirim veya nakit gibi harcayabilirler. Puanların geçerlilik süresi işletmenin kurallarına göre esnektir.'
  },
  {
    icon: HandCoins,
    question: 'Sistemde komisyon veya gizli masraf var mı?',
    answer:
      'Kesinlikle yok! Esnaflardan asla pos komisyonu veya kullanım ücreti alınmaz. Müşteriler için de tamamen ücretsizdir. Tamamen esnaf ile sadık müşterisi arasındaki kazanç bağıdır.'
  },
  {
    icon: ShieldCheck,
    question: 'İşlemlerin güvenliği nasıl sağlanıyor?',
    answer:
      'Her müşterinin kendine ait sabit ve şifreli bir QR kodu bulunur. Esnaf paneli üzerinden sadece yetkili işletme hesabıyla bu kod okunarak güvenli ve şeffaf bir şekilde puan yüklemesi gerçekleştirilir, böylece yetkisiz işlemlerin önüne geçilir.'
  }
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Sıkça Sorulan Sorular
          </h2>
          <p className="text-gray-600">Esnafımızın ve müşterilerimizin en çok merak ettikleri</p>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full mt-4"></div>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((faq, index) => {
            const isOpen = openIndex === index;
            const FaqIcon = faq.icon;

            return (
            <div
              key={faq.question}
              className={`overflow-hidden rounded-2xl border bg-white shadow-md transition-all duration-300 ${
                isOpen ? 'border-secondary-300 shadow-lg' : 'border-gray-100 hover:border-primary-200'
              }`}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-gray-50 sm:px-6"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isOpen ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-600'
                  }`}
                >
                  <FaqIcon className="h-5 w-5" />
                </span>
                <span className="flex-1 pr-2 font-heading text-base font-semibold text-gray-900 sm:text-lg">
                  {faq.question}
                </span>
                <span className="flex-shrink-0">
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-primary-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-6 sm:px-6">
                  <div className="border-t border-gray-100 pl-0 pt-4 sm:pl-14">
                    <p className="leading-relaxed text-gray-600">{faq.answer}</p>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Müşteri & Esnaf Destek Hattı
          </h2>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full mt-4"></div>
        </div>

        <div className="max-w-lg mx-auto">
          <div className="bg-white border border-gray-200 rounded-3xl shadow-xl p-8 md:p-10 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <MessageCircle className="w-8 h-8 text-green-600" />
            </div>

            <p className="text-gray-600 leading-relaxed mb-8">
              Onkatı sistemi hakkında sorularınız, üyelik ve iş birliği talepleriniz için doğrudan WhatsApp üzerinden iletişime geçebilirsiniz.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-center gap-3 text-gray-700">
                <MapPin className="w-5 h-5 text-primary-600 flex-shrink-0" />
                <span className="font-medium">Selçuklu / KONYA (Türkiye)</span>
              </div>
              <div className="flex items-center justify-center gap-3 text-gray-700">
                <Clock className="w-5 h-5 text-primary-600 flex-shrink-0" />
                <span className="font-medium">Pazartesi - Cumartesi: 09:00 - 18:00</span>
              </div>
            </div>

            <a
              href="https://wa.me/905073376385"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-3 w-full bg-green-500 hover:bg-green-600 text-white py-4 px-6 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp ile Hemen Bağlan
            </a>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-gray-500 text-xs leading-relaxed">
                Esnaf ve müşteri verileri KVKK kapsamında korunmaktadır. Tüm işlemler güvenli bir şekilde gerçekleştirilir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
