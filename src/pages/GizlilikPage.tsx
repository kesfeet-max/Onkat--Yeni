import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function GizlilikPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Ana Sayfa
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-10">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Gizlilik Politikası
          </h1>
          <p className="text-sm text-gray-500 mb-8">Son güncelleme: 08 Ağustos 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Genel</h2>
              <p className="text-gray-700 leading-relaxed">
                Onkatı, platforma üye olan esnafların ve müşterilerin gizliliğini korumayı ilke edinmiştir.
                Bu politika, kişisel verilerin nasıl toplandığını, kullanıldığını, saklandığını ve korunduğunu
                açıklamaktadır.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Bilgi Toplama</h2>
              <p className="text-gray-700 leading-relaxed">
                Çerezler ve formlar aracılığıyla toplanan veriler, sistemin düzgün çalışması ve hizmet kalitesinin
                artırılması dışında kullanılmaz. Toplanan bilgiler şunları içerebilir:
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
                <li>Kimlik bilgileri (ad, soyad, e-posta, telefon)</li>
                <li>İşletme bilgileri (esnaflar için mağaza adı, konum, sektör)</li>
                <li>İşlem verileri (puan kazanma/harcama geçmişi)</li>
                <li>Teknik veriler (IP adresi, tarayıcı bilgisi, cihaz türü)</li>
                <li>Konum verileri (işlem güvenliği için GPS koordinatları)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Güvenlik</h2>
              <p className="text-gray-700 leading-relaxed">
                Tüm veriler SSL şifreleme ve modern güvenlik duvarları ile korunur. Üçüncü şahıslara satış veya
                devir yapılamaz. Verilerinizin güvenliği için aşağıdaki önlemler alınmaktadır:
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
                <li>256-bit SSL/TLS şifreleme ile veri iletimi</li>
                <li>Veritabanı düzeyinde şifreleme (encryption at rest)</li>
                <li>Düzenli güvenlik denetimleri ve penetrasyon testleri</li>
                <li>Erişim kontrolü ve yetkilendirme mekanizmaları</li>
                <li>Otomatik yedekleme ve felaket kurtarma planları</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Veri Paylaşımı</h2>
              <p className="text-gray-700 leading-relaxed">
                Kişisel verileriniz, yasal zorunluluklar dışında üçüncü taraflarla paylaşılmaz.
                Hizmet sağlayıcılarımız (hosting, e-posta servisleri vb.) ile paylaşılan veriler,
                yalnızca hizmetin sunulması için gerekli minimum düzeyde tutulur ve gizlilik
                sözleşmeleri ile korunur.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Kullanıcı Hakları</h2>
              <p className="text-gray-700 leading-relaxed">
                KVKK kapsamında aşağıdaki haklara sahipsiniz:
              </p>
              <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
                <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
                <li>İşlenmiş verilere ilişkin bilgi talep etme</li>
                <li>Verilerin düzeltilmesini veya silinmesini isteme</li>
                <li>Verilerin aktarıldığı üçüncü kişileri bilme</li>
                <li>İşlemenin durdurulmasını talep etme</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Değişiklikler</h2>
              <p className="text-gray-700 leading-relaxed">
                Gizlilik politikası üzerinde güncellemeler yapılması durumunda kullanıcılar bilgilendirilecektir.
                Güncellenmiş politika, yayınlandığı tarihten itibaren geçerli olur. Önemli değişiklikler
                e-posta veya uygulama içi bildirim yoluyla duyurulur.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">7. İletişim</h2>
              <p className="text-gray-700 leading-relaxed">
                Gizlilik politikamız hakkında sorularınız veya talepleriniz için bizimle iletişime geçebilirsiniz.
                Talepleriniz en geç 30 gün içinde yanıtlanacaktır.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}