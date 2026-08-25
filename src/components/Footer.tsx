import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { scrollWindowToTop } from './ScrollToTop';

/** Footer menülerinde kullanılan bağlantı. Tıklandığında sayfa en üste kaydırılır. */
function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        onClick={scrollWindowToTop}
        className="text-primary-100 hover:text-secondary-300 transition-colors text-sm"
      >
        {children}
      </Link>
    </li>
  );
}

export function Footer() {
  return (
    <footer className="bg-primary-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center mb-4">
              <BrandLogo to="/" size="lg" />
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
              <FooterLink to="/">Ana Sayfa</FooterLink>
              <FooterLink to="/hakkimizda">Hakkimizda</FooterLink>
              <FooterLink to="/giris">Giris Yap</FooterLink>
            </ul>
          </div>

          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Yasal</h3>
            <ul className="space-y-2">
              <FooterLink to="/yasal/kvkk">KVKK Aydinlatma Metni</FooterLink>
              <FooterLink to="/yasal/esnaf-kosullari">Esnaf Uyelik ve Hizmet Kosullari</FooterLink>
              <FooterLink to="/yasal/musteri-kosullari">Musteri Uyelik ve Hizmet Kosullari</FooterLink>
              <FooterLink to="/yasal/gizlilik">Gizlilik Politikasi</FooterLink>
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