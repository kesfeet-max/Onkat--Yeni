import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Sayfayı yumuşak biçimde en üste kaydırır.
 *
 * Menü bağlantıları, modal kapanışları ve sekme değişimlerinde ortak olarak
 * kullanılır. Bazı eski tarayıcılar `behavior: 'smooth'` seçeneğini desteklemediği
 * için güvenli bir yedek yol bulunur.
 */
export function scrollWindowToTop(): void {
  if (typeof window === 'undefined') return;

  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  } catch {
    // Nesne parametresini desteklemeyen tarayıcılar için yedek
    window.scrollTo(0, 0);
  }
}

/**
 * Router seviyesinde çalışan yardımcı bileşen.
 *
 * Kullanıcı hangi sayfada olursa olsun (sayfanın altında kalmış olsa bile),
 * yeni bir rotaya geçildiği anda görünüm otomatik olarak en üste kaydırılır.
 * Böylece "Ana Sayfa", "Hakkımızda", "KVKK", "Gizlilik Politikası" gibi
 * bağlantılara tıklandığında sayfa ortasından/alt kısmından açılma sorunu olmaz.
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    scrollWindowToTop();
  }, [pathname, search]);

  return null;
}