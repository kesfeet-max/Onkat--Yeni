import { Link } from 'react-router-dom';
import { Handshake } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-primary-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Handshake className="w-8 h-8 text-secondary-400" />
              <span className="text-2xl font-heading font-bold">Onkati</span>
            </div>
            <p className="text-primary-100 text-sm leading-relaxed max-w-md">
              Mahalle kulturu ile birlestirici bir dayanisma direnciyiz.
              Damlaya damlaya gol olur vizyonuyla, hem halkimizin butcesine
              net %7 nakit katki sagliyoruz.
            </p>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Hizli Erisim</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Ana Sayfa
                </Link>
              </li>
              <li>
                <Link to="/hakkimizda" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Hakkimizda
                </Link>
              </li>
              <li>
                <Link to="/giris" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Giris Yap
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Yasal</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/yasal/kvkk" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  KVKK Aydinlatma Metni
                </Link>
              </li>
              <li>
                <Link to="/yasal/esnaf-kosullari" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Esnaf Uyelik ve Hizmet Kosullari
                </Link>
              </li>
              <li>
                <Link to="/yasal/musteri-kosullari" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Musteri Uyelik ve Hizmet Kosullari
                </Link>
              </li>
              <li>
                <Link to="/yasal/gizlilik" className="text-primary-100 hover:text-secondary-300 transition-colors text-sm">
                  Gizlilik Politikasi
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-500 mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-primary-200 text-sm">
              &copy; {new Date().getFullYear()} Onkati. Tum haklari saklidir.
            </p>
            <p className="text-primary-300 text-xs">
              Musteri ve Esnaf Verilerinin Korunmasi | Guvenli Altyapi
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
