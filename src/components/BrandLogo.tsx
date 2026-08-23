import { Link } from 'react-router-dom';

/**
 * Onkatı kurumsal logosu: saydam arka planlı, 3B altın "ON" ay-yıldız amblemi +
 * "Onkatı / ESNAF SADAKAT SİSTEMİ" marka metni.
 */
const LOGO_SRC =
  'https://mgx-backend-cdn.metadl.com/generate/images/1358219/2026-08-22/u7awbyaaakfa/onkati-wordmark-gold-transparent.png';

type LogoSize = 'sm' | 'md' | 'lg';

/**
 * Responsive yükseklikler (yatay logo, genişlik otomatik — görsel oranı 3:2).
 * Görselin kendi iç boşluğu olduğu için kutu yüksekliği bilinçli olarak yüksek tutulur;
 * negatif dikey marj ile fazladan boşluk layout'u bozmaz.
 * - sm (panel üst barı, yanında başlık metni var): mobil 56px / masaüstü 64px
 * - md: mobil 72px / masaüstü 80px
 * - lg (giriş, kayıt, ana sayfa, alt bilgi): mobil 96px / masaüstü 112px
 *   Mobilde logo ilk dikkat çeken unsur olsun diye önceki 56px'in yaklaşık iki katı.
 */
const SIZE_CLASSES: Record<LogoSize, string> = {
  sm: 'h-14 sm:h-16 md:h-16 -my-1.5 md:-my-2',
  md: 'h-[4.5rem] sm:h-20 md:h-20 -my-2 md:-my-2.5',
  lg: 'h-24 sm:h-24 md:h-28 -my-2.5 md:-my-3',
};

interface BrandLogoProps {
  /** Tıklanınca gidilecek adres. `null` verilirse link sarmalayıcı kullanılmaz. */
  to?: string | null;
  size?: LogoSize;
  /** Saydam logoyu kart gibi göstermek için hafif çerçeve ekler (varsayılan: kapalı). */
  framed?: boolean;
  className?: string;
}

export function BrandLogo({ to = '/', size = 'md', framed = false, className = '' }: BrandLogoProps) {
  const image = (
    <img
      src={LOGO_SRC}
      alt="Onkatı Esnaf Sadakat Sistemi"
      className={[
        SIZE_CLASSES[size],
        'w-auto max-w-[52vw] sm:max-w-[60vw] object-contain select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]',
        framed ? 'rounded-lg ring-1 ring-white/10 px-2' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={false}
    />
  );

  if (!to) {
    return <span className="inline-flex items-center">{image}</span>;
  }

  return (
    <Link to={to} aria-label="Onkatı ana sayfa" className="inline-flex items-center shrink-0">
      {image}
    </Link>
  );
}

export default BrandLogo;