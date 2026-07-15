import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Handshake,
  TrendingUp,
  Shield,
  Users,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  MapPin,
  QrCode,
  Wallet,
  Store,
  Award
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
    </div>
  );
}

function Navbar() {
  return (
    <nav className="bg-primary-600 shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-2xl font-heading font-bold text-white">Onkatı</span>
          </Link>
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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormData({ name: '', email: '', message: '' });
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-primary-700 mb-4">
            Bizimle İletişime Geçin
          </h2>
          <p className="text-gray-600">Esnaf ve müşterilerin soru/sorunları için bize ulaşın</p>
          <div className="w-24 h-1 bg-secondary-500 mx-auto rounded-full mt-4"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="bg-gray-50 p-8 rounded-2xl">
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-heading font-bold text-gray-900 mb-2">Mesajınız Alındı!</h3>
                <p className="text-gray-600">En kısa sürede size dönüş yapacağız.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Ad Soyad
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder="Adınızı soyadınızı girin"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    E-posta
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder="E-posta adresinizi girin"
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Mesajınız
                  </label>
                  <textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    required
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
                    placeholder="Mesajınızı buraya yazın..."
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary-600 text-white py-4 rounded-lg font-semibold hover:bg-primary-700 transition-colors shadow-lg"
                >
                  Gönder
                </button>
              </form>
            )}
          </div>

          <div className="space-y-8">
            <div className="bg-primary-600 text-white p-8 rounded-2xl">
              <h3 className="text-xl font-heading font-semibold mb-6">İletişim Bilgileri</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Mail className="w-6 h-6 text-secondary-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium">Destek E-posta</p>
                    <a href="mailto:destek@onkati.com" className="text-primary-100 hover:text-secondary-300 transition-colors">
                      destek@onkati.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="w-6 h-6 text-secondary-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium">Destek Hattı</p>
                    <p className="text-primary-100">0850 123 45 67</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin className="w-6 h-6 text-secondary-400 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-medium">Adres</p>
                    <p className="text-primary-100">
                      İstanbul, Türkiye
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-secondary-50 border border-secondary-200 p-6 rounded-2xl">
              <p className="text-gray-700 text-sm leading-relaxed">
                <span className="font-semibold">Not:</span> Esnaf ve müşteri verileri KVKK kapsamında korunmaktadır.
                Tüm işlemler askeri düzeyde şifreleme ile güvenli bir şekilde gerçekleştirilir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
