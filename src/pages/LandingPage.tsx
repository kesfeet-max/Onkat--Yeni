import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PwaInstallBanner } from '../components/PwaInstallBanner';
import { BrandLogo } from '../components/BrandLogo';
import {
  TrendingUp,
  Shield,
  Users,
  ChevronDown,
  ChevronUp,
  MapPin,
  QrCode,
  Wallet,
  Store,
  Award,
  MessageCircle,
  Clock
} from 'lucide-react';

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
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
        <div className="flex justify-between items-center h-16">
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
          <div className="hidden lg:flex justify-center">
            <div className="relative">
              <div className="absolute -inset-4 bg-secondary-400/20 blur-3xl rounded-full"></div>
              <div className="relative bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-heading font-bold text-secondary-400">%25</div>
                    <div className="text-sm text-primary-200 mt-1">Varan Puanlar</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-heading font-bold text-secondary-400">0</div>
                    <div className="text-sm text-primary-200 mt-1">Pos Komisyonu</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-heading font-bold text-secondary-400">0</div>
                    <div className="text-sm text-primary-200 mt-1">Cihaz Masrafı</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-heading font-bold text-secondary-400">GPS</div>
                    <div className="text-sm text-primary-200 mt-1">Güvenlik Kilidi</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
            Biz Kimiz? Felsefemiz Nereden Geliyor?
          </h2>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              Biz, kurumsal devlerin sadece kendi kasalarını dolduran puan sistemlerine karşı,
              mahalle kültürüyle birleştirici bir <span className="font-semibold text-primary-600">dayanışma direnişiyiz</span>.
            </p>
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              <span className="text-secondary-600 font-semibold">'Damlaya damlaya göl olur'</span> vizyonuyla,
              hem halkımızın bütçesine net %25'e varan puanlar kazandırıyoruz hem de esnafımızın ciro gücü mahallede çalışıyor.
            </p>
            <div className="flex flex-wrap gap-4 mt-8">
              <div className="flex items-center gap-2 text-primary-700">
                <Award className="w-5 h-5 text-secondary-500" />
                <span className="font-medium">Cihaz yok</span>
              </div>
              <div className="flex items-center gap-2 text-primary-700">
                <Award className="w-5 h-5 text-secondary-500" />
                <span className="font-medium">Pos komisyonu yok</span>
              </div>
              <div className="flex items-center gap-2 text-primary-700">
                <Award className="w-5 h-5 text-secondary-500" />
                <span className="font-medium">Yardımat gücü yok</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-primary-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
                Net Kazanç
              </h3>
              <p className="text-gray-600 text-sm">
                Her alışverişte %25'e varan puanlar kazan. Puanlar birikir, cebin dolar.
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-secondary-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-secondary-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
                Güvenli Sistem
              </h3>
              <p className="text-gray-600 text-sm">
                GPS kilidiyle sahte işlemler engellenir. Askeri düzeyde kripto.
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
                Mahalle Dayanışması
              </h3>
              <p className="text-gray-600 text-sm">
                Esnaf ve müşteri birlikte güçlenir. Mahalle ekonomisi canlanır.
              </p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-secondary-100 rounded-xl flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6 text-secondary-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
                Basit Kullanım
              </h3>
              <p className="text-gray-600 text-sm">
                QR kod tara, onayla, kazan. Şifremetik güzergah.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
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
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-8 rounded-2xl">
            <h3 className="text-2xl font-heading font-bold text-primary-700 mb-6 flex items-center gap-3">
              <Wallet className="w-7 h-7" />
              Müşteriler İçin
            </h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
                <div>
                  <p className="font-semibold text-gray-900">Kayıt Ol</p>
                  <p className="text-gray-600 text-sm">Telefon numaran ile hızlı kayıt.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
                <div>
                  <p className="font-semibold text-gray-900">QR Tara</p>
                  <p className="text-gray-600 text-sm">Esnafın karekodunu kamerayla oku.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
                <div>
                  <p className="font-semibold text-gray-900">Tutar Gir & Onayla</p>
                  <p className="text-gray-600 text-sm">Alışveriş tutarını gir, esnaftan onaylat.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-secondary-500 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
                <div>
                  <p className="font-semibold text-gray-900">Kazan!</p>
                  <p className="text-gray-600 text-sm">Her harcamanın %25'e varanı puana dönüşür.</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 p-8 rounded-2xl">
            <h3 className="text-2xl font-heading font-bold text-secondary-700 mb-6 flex items-center gap-3">
              <Store className="w-7 h-7" />
              Esnaflar İçin
            </h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-secondary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">1</span>
                <div>
                  <p className="font-semibold text-gray-900">Dükkanını Kaydet</p>
                  <p className="text-gray-600 text-sm">Dükkan bilgilerin ve konumunu gir.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-secondary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">2</span>
                <div>
                  <p className="font-semibold text-gray-900">Karekod Oluştur</p>
                  <p className="text-gray-600 text-sm">Panelinden QR kodunu indir ve kasana as.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-secondary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">3</span>
                <div>
                  <p className="font-semibold text-gray-900">Müşterileri Onayla</p>
                  <p className="text-gray-600 text-sm">Müşteri telefonunu al, onayla butonuna bas.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">4</span>
                <div>
                  <p className="font-semibold text-gray-900">Büyü!</p>
                  <p className="text-gray-600 text-sm">Sadık müşterilerle ciron artsın.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: 'Esnaf olarak bu sistemde neden hiçbir cihaz kurmuyorum?',
      answer: 'Çünkü tüm işlem bileşenlerinde döner. Siz sadece gözünüzle bakarak kontrol eder, parmağınızla onaylarsınız. Ekstra masrafa, teknik arızaya gerek yok! Sadece bir QR kod ve akıllı telefon yeterli.',
    },
    {
      question: 'Kazanılan puanlar (TL\'ler) ne kadar süre geçerlidir?',
      answer: 'Biriktirdiğiniz puanlar aydan itibaren istediğiniz zaman aynı dükkan harcanabilir. Paranız asla kaybolmaz, puanlarınız süresiz olarak hesabınızda kalır.',
    },
    {
      question: 'Sistemimiz güvenli mi?',
      answer: 'Evet. Sistemimizin çift yönlü konumsal (GPS) çalıştırılması ve askeri düzeyde kriptolu olarak sunulması ile korunmaktadır. Dükkan dışından sahte işlem yapılması engellenir. Tüm verileriniz güvenle saklanır.',
    },
  ];

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Sıkça Sorulan Sorular
          </h2>
          <p className="text-gray-600">Güven tazeleyelim</p>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full mt-4"></div>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-heading font-semibold text-lg text-gray-900 pr-4">
                  {faq.question}
                </span>
                <span className="flex-shrink-0">
                  {openIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-primary-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5">
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-gray-600 leading-relaxed mt-4">{faq.answer}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
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
