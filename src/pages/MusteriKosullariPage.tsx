import { Link } from 'react-router-dom';
import { Handshake, FileText } from 'lucide-react';

export function MusteriKosullariPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Handshake className="w-8 h-8 text-primary-600" />
            <span className="text-xl font-heading font-bold text-gray-900">Onkatı</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-secondary-100 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-secondary-700" />
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-primary-700">
              Müşteri Üyelik ve Hizmet Koşulları Sözleşmesi
            </h1>
          </div>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                1. Taraflar ve Konu
              </h2>
              <p>
                İşbu Sözleşme, Onkatı platformu ile müşteri ("Kullanıcı") arasında esnaf sadakat ve
                indirim sisteminden yararlanma şartlarını düzenler. Kullanıcı kayıt esnasında bunu onaylar.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                2. Üyelik ve Güvenlik
              </h2>
              <p>
                Kullanıcı verdiği bilgilerin doğru olduğunu kabul eder. Hesap güvenliği kullanıcıya aittir.
                Kötü niyetli kullanımda Onkatı üyeliği askıya alma hakkına sahiptir.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                3. Hizmet Kapsamı
              </h2>
              <p>
                Onkatı, yerel esnaflar ile müşterileri buluşturan aracı bir platformdur.
                Esnafların sunduğu mal, hizmet veya fiyat politikasından Onkatı doğrudan sorumlu değildir.
                İhtilaflarda Onkatı taraf değildir.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-heading font-bold text-primary-700 mb-3">
                4. Fesih ve Yetki
              </h2>
              <p>
                Kullanıcı dilediği zaman hesabını kapatabilir. Uyuşmazlıklarda Türkiye Cumhuriyeti
                kanunları geçerli olup tüketici mahkemeleri yetkilidir.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Bu sözleşme, üyelik kaydı sırasında onaylanmış sayılır ve taraflar arasında bağlayıcıdır.
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