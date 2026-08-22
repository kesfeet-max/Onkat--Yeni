import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export function KVKKPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <BrandLogo to="/" size="lg" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-700" />
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-primary-700">
              Kişisel Verilerin Korunması ve İşlenmesi Aydınlatma Metni
            </h1>
          </div>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
            <p>
              İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca,
              Onkatı ("Platform") tarafından veri sorumlusu sıfatıyla, esnaf sadakat sistemi kapsamında
              üyelerimizin kişisel verilerinin işlenme şartları hakkında bilgilendirilmesi amacıyla hazırlanmıştır.
            </p>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                1. İşlenen Kişisel Verileriniz
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Kimlik Bilgileri:</strong> Ad, soyad</li>
                <li><strong>İletişim Bilgileri:</strong> Telefon numarası, e-posta adresi</li>
                <li><strong>İşlem Güvenliği Bilgileri:</strong> IP adresleri, log kayıtları, şifre</li>
                <li><strong>Müşteri İşlem Bilgileri:</strong> Puan, indirim ve kampanya kullanım geçmişi</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                2. İşlenme Amaçları
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Üyelik kaydının oluşturulması</li>
                <li>Esnaf sadakat ve indirim sisteminin işletilmesi</li>
                <li>Destek taleplerinin çözümlenmesi</li>
                <li>Kampanya bilgilendirmeleri (açık rıza halinde)</li>
                <li>Yasal yükümlülüklerin yerine getirilmesi</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                3. Kişisel Verilerin Aktarımı
              </h2>
              <p>
                Verileriniz kanuni yükümlülükler haricinde üçüncü kişilerle paylaşılmamakta,
                yalnızca güvenli sunucu ve teknoloji altyapısı tedarikçileriyle muhafaza edilmektedir.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                4. Haklarınız (KVKK Madde 11)
              </h2>
              <p>
                Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini
                veya silinmesini isteme haklarına sahipsiniz.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Bu metin, 6698 sayılı KVKK'nın 10. maddesi gereğince aydınlatma yükümlülüğü kapsamında hazırlanmıştır.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-primary-600 font-semibold hover:text-primary-700 text-sm">
            ← Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}