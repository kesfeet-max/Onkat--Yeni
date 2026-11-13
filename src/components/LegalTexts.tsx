/**
 * Müşteri Koşulları ve KVKK metinlerinin tek kaynağı.
 * Hem /yasal/* sayfalarında hem de kayıt formundaki modalda kullanılır.
 */

export function MusteriKosullariContent() {
  return (
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
  );
}

export function KVKKContent() {
  return (
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
  );
}
