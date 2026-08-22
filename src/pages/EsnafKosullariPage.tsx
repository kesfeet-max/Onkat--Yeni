import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

export function EsnafKosullariPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-6">
          <BrandLogo to="/" size="lg" />
        </div>

        <Link to="/" className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Ana Sayfa
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-10">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Esnaf Üyelik ve Hizmet Koşulları
          </h1>
          <p className="text-sm text-gray-500 mb-8">Son güncelleme: 08 Ağustos 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Konu</h2>
              <p className="text-gray-700 leading-relaxed">
                İşbu sözleşme, Onkatı sadakat sistemine dahil olan esnaf ile Onkatı arasındaki hak ve yükümlülükleri düzenler.
                Esnaf, sisteme üye olarak bu koşulları kabul etmiş sayılır.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Esnaf Yükümlülükleri</h2>
              <p className="text-gray-700 leading-relaxed">
                Esnaf, sunduğu mal ve hizmetlerin kalitesinden, puan/indirim oranlarının doğru yansıtılmasından ve
                müşteri memnuniyetinden bizzat sorumludur. Esnaf, platform üzerinden sunduğu bilgilerin doğruluğunu
                ve güncelliğini sağlamakla yükümlüdür.
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
                <li>Sunulan ürün ve hizmetlerin kalite standartlarına uygunluğu</li>
                <li>Puan ve indirim oranlarının doğru ve güncel tutulması</li>
                <li>Müşteri şikayetlerinin makul sürede çözümlenmesi</li>
                <li>Platform kurallarına ve yasal düzenlemelere uyum</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Mali Hükümler</h2>
              <p className="text-gray-700 leading-relaxed">
                Onkatı, sistem üzerinden yapılan işlemler için esnaftan belirlenen komisyon bedelini tahsil eder.
                Komisyon oranları ve ödeme koşulları, esnafın sisteme dahil olması sırasında kendisine bildirilir.
                Onkatı, komisyon oranlarında değişiklik yapma hakkını saklı tutar; değişiklikler en az 15 gün
                öncesinden esnafa bildirilir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Fesih</h2>
              <p className="text-gray-700 leading-relaxed">
                Onkatı, sistemin işleyişini bozan veya müşteri mağduriyeti yaratan esnafın üyeliğini tek taraflı
                feshetme hakkına sahiptir. Fesih durumunda esnafın birikmiş hakları, varsa borçları mahsup edilerek
                tasfiye edilir.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Esnaf da dilediği zaman yazılı bildirimde bulunarak üyeliğini sonlandırabilir. Bu durumda
                mevcut müşteri puanlarının kullanımına ilişkin geçiş süreci uygulanır.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Fikri Mülkiyet</h2>
              <p className="text-gray-700 leading-relaxed">
                Onkatı platformuna ait tüm yazılım, tasarım, logo ve içerikler Onkatı'nın fikri mülkiyetindedir.
                Esnaf, platform içeriklerini yalnızca kendi işletmesinin tanıtımı amacıyla ve Onkatı'nın
                belirlediği kurallar çerçevesinde kullanabilir.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Uyuşmazlık Çözümü</h2>
              <p className="text-gray-700 leading-relaxed">
                İşbu sözleşmeden doğan uyuşmazlıklarda Türkiye Cumhuriyeti kanunları uygulanır.
                Taraflar, uyuşmazlıkların çözümünde öncelikle arabuluculuk yoluna başvurmayı kabul eder.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}