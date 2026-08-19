import { Link } from 'react-router-dom';

/** Yeni lüks altın tonlu Onkatı logosu (koyu yeşil zeminli, marka metni dahil) */
const LOGO_SRC = '/assets/onkati-logo-gold.png';

type LogoSize = 'sm' | 'md' | 'lg';

/**
 * Responsive yükseklikler:
 * - mobil: 32px - 36px
 * - masaüstü: 40px - 48px
 */
const SIZE_CLASSES: Record<LogoSize, string> = {
  sm: 'h-8 md:h-10',
  md: 'h-9 md:h-11',
  lg: 'h-9 md:h-12',
};

interface BrandLogoProps {
  /** Tıklanınca gidilecek adres. `null` verilirse link sarmalayıcı kullanılmaz. */
  to?: string | null;
  size?: LogoSize;
  /** Logonun kendi koyu yeşil zeminini kart gibi göstermek için çerçeve ekler. */
  framed?: boolean;
  className?: string;
}

export function BrandLogo({ to = '/', size = 'md', framed = true, className = '' }: BrandLogoProps) {
  const image = (
    <img
      src={LOGO_SRC}
      alt="Onkatı Esnaf Sadakat Sistemi"
      className={[
        SIZE_CLASSES[size],
        'w-auto object-contain select-none',
        framed ? 'rounded-lg ring-1 ring-white/10 shadow-sm' : '',
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