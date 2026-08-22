import { Link } from 'react-router-dom';

/**
 * Onkatı kurumsal logosu: saydam arka planlı, 3B altın "ON" ay-yıldız amblemi +
 * "Onkatı / ESNAF SADAKAT SİSTEMİ" marka metni.
 */
const LOGO_SRC =
  'https://mgx-backend-cdn.metadl.com/generate/images/1358219/2026-08-22/u7awbyaaakfa/onkati-wordmark-gold-transparent.png';

type LogoSize = 'sm' | 'md' | 'lg';

/**
 * Responsive yükseklikler (yatay logo olduğu için genişlik otomatik):
 * - mobil: 36px - 44px
 * - masaüstü: 44px - 56px
 */
const SIZE_CLASSES: Record<LogoSize, string> = {
  sm: 'h-9 md:h-11',
  md: 'h-10 md:h-12',
  lg: 'h-11 md:h-14',
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
        'w-auto object-contain select-none',
        framed ? 'rounded-lg ring-1 ring-white/10 px-2 py-1' : '',
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