import { useEffect, useRef, useState } from 'react';
import { X, Share, PlusSquare, MoreVertical, Download, MonitorSmartphone } from 'lucide-react';

/** Uygulamanın gerçekten kurulduğunu KALICI olarak saklar (localStorage). */
const PWA_INSTALLED_KEY = 'pwa_installed';
/** Kullanıcı çarpıya bastığında sadece o oturum için gizler (sessionStorage). */
const PWA_SESSION_DISMISSED_KEY = 'pwa_banner_dismissed_session';
/** Önceki sürümde kalıcı gizleme için kullanılan anahtar; artık geçersiz, temizlenir. */
const LEGACY_DISMISSED_KEY = 'pwa_banner_dismissed';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    /** index.html içinde erken yakalanan kurulum teklifi olayı. */
    __onkatiInstallPrompt?: InstallPromptEvent | null;
  }
}

/**
 * Safari gizli modunda ve bazı eski iOS sürümlerinde depolama erişimi hata
 * fırlatır. Hata kutuyu tamamen susturmasın diye tüm erişimler güvenli sarmalanır.
 */
const safeStorage = {
  get(store: 'local' | 'session', key: string): string | null {
    try {
      return (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  set(store: 'local' | 'session', key: string, value: string) {
    try {
      (store === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
    } catch {
      // Depolama kullanılamıyorsa durum yalnızca bellekte tutulur
    }
  },
  remove(store: 'local' | 'session', key: string) {
    try {
      (store === 'local' ? window.localStorage : window.sessionStorage).removeItem(key);
    } catch {
      // Sessizce devam
    }
  },
};

/** Uygulama ana ekrandan (standalone) açıldıysa kurulu kabul edilir. */
function isStandaloneMode(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

type Platform =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'mac-safari'
  | 'android-samsung'
  | 'android-firefox'
  | 'android'
  | 'desktop';

/** Kurulum rehberini doğru göstermek için tarayıcı/cihaz tespiti. */
function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ kendini masaüstü Mac olarak tanıtır; dokunmatik ekranla ayırt edilir
  const isIpadOs = /Macintosh/.test(ua) && (window.navigator.maxTouchPoints || 0) > 1;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || isIpadOs;

  if (isIos) {
    if (/CriOS/i.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS|YaBrowser|Instagram|FBAN|FBAV|Line|Twitter/i.test(ua)) return 'ios-other';
    return 'ios-safari';
  }

  if (/Android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung';
    if (/Firefox/i.test(ua)) return 'android-firefox';
    return 'android';
  }

  if (/Macintosh/.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg|Firefox/i.test(ua)) {
    return 'mac-safari';
  }

  return 'desktop';
}

interface GuideStep {
  icon: typeof Share;
  text: string;
}

/** Her platform için ana ekrana ekleme adımları. */
function getGuide(platform: Platform): { title: string; steps: GuideStep[] } {
  switch (platform) {
    case 'ios-safari':
      return {
        title: 'iPhone / iPad (Safari)',
        steps: [
          { icon: Share, text: 'Ekranın altındaki (iPad’de üstteki) Paylaş simgesine dokunun.' },
          { icon: PlusSquare, text: 'Listeyi aşağı kaydırıp "Ana Ekrana Ekle" seçeneğine dokunun.' },
          { icon: Download, text: 'Sağ üstteki "Ekle" butonuna dokunun. Onkatı ana ekranınızda!' },
        ],
      };
    case 'ios-chrome':
      return {
        title: 'iPhone / iPad (Chrome)',
        steps: [
          { icon: Share, text: 'Adres çubuğunun sağındaki Paylaş simgesine dokunun.' },
          { icon: PlusSquare, text: '"Ana Ekrana Ekle" seçeneğine dokunun.' },
          { icon: Download, text: '"Ekle" butonuna dokunun.' },
        ],
      };
    case 'ios-other':
      return {
        title: 'iPhone / iPad',
        steps: [
          { icon: MoreVertical, text: 'Menüden "Safari’de Aç" seçeneğine dokunun.' },
          { icon: Share, text: 'Safari’de alttaki Paylaş simgesine dokunun.' },
          { icon: PlusSquare, text: '"Ana Ekrana Ekle" → "Ekle" adımlarını tamamlayın.' },
        ],
      };
    case 'mac-safari':
      return {
        title: 'Mac (Safari)',
        steps: [
          { icon: Share, text: 'Araç çubuğundaki Paylaş simgesine veya üst menüden "Dosya"ya tıklayın.' },
          { icon: PlusSquare, text: '"Dock’a Ekle" seçeneğini seçin.' },
          { icon: Download, text: '"Ekle" butonuna tıklayın.' },
        ],
      };
    case 'android-samsung':
      return {
        title: 'Samsung Internet',
        steps: [
          { icon: MoreVertical, text: 'Alttaki menü (☰) simgesine dokunun.' },
          { icon: PlusSquare, text: '"Sayfayı ekle" → "Ana ekran" seçeneğine dokunun.' },
          { icon: Download, text: '"Ekle" butonuna dokunun.' },
        ],
      };
    case 'android-firefox':
      return {
        title: 'Android (Firefox)',
        steps: [
          { icon: MoreVertical, text: 'Sağdaki üç nokta (⋮) menüsüne dokunun.' },
          { icon: PlusSquare, text: '"Yükle" veya "Ana ekrana ekle" seçeneğine dokunun.' },
          { icon: Download, text: 'Onaylayın.' },
        ],
      };
    case 'android':
      return {
        title: 'Android',
        steps: [
          { icon: MoreVertical, text: 'Sağ üstteki üç nokta (⋮) menüsüne dokunun.' },
          { icon: PlusSquare, text: '"Uygulamayı yükle" veya "Ana ekrana ekle" seçeneğine dokunun.' },
          { icon: Download, text: '"Yükle" butonuna dokunun.' },
        ],
      };
    default:
      return {
        title: 'Bilgisayar',
        steps: [
          { icon: MonitorSmartphone, text: 'Adres çubuğunun sağındaki yükleme (⊕) simgesine tıklayın.' },
          { icon: MoreVertical, text: 'Simge yoksa tarayıcı menüsünden "Uygulamayı yükle"yi seçin.' },
          { icon: Download, text: '"Yükle" butonuna tıklayın.' },
        ],
      };
  }
}

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

/**
 * Ana ekrana ekleme davet kutusu — tüm tarayıcı ve cihazlarda çalışır.
 *
 * - Chrome / Edge / Android: tarayıcının yerel kurulum penceresi açılır.
 * - Safari (iPhone, iPad, Mac) ve kurulum penceresi sunmayan diğer tarayıcılar:
 *   cihaza özel, adım adım "Ana Ekrana Ekle" rehberi açılır.
 * - "X" sadece o oturumu gizler; gerçek kurulum kalıcı olarak gizler.
 */
export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const deferredPromptRef = useRef<InstallPromptEvent | null>(null);
  const [platform] = useState<Platform>(() => detectPlatform());

  const content = variant === 'merchant'
    ? {
        title: '💵 Esnaf Paneli Her An Elinin Altında Olsun! 💰',
        description: 'QR kodları saniyesinde okutmak için paneli ekranına ekle.',
        button: '💸 EKRANIMA EKLE',
      }
    : {
        title: '💰 Puanların Unutulmasın, Gözünün Önünde Olsun! 💸',
        description: 'Kasada sıra beklemeden puan kazanmak için Onkatı\'yı telefonunun ana ekranına ekle! 🚀',
        button: '💵 TELEFONA EKLE',
      };

  useEffect(() => {
    safeStorage.remove('local', LEGACY_DISMISSED_KEY);

    const isDismissedForSession = () => safeStorage.get('session', PWA_SESSION_DISMISSED_KEY) === 'true';

    const markInstalled = () => {
      safeStorage.set('local', PWA_INSTALLED_KEY, 'true');
      setShowGuide(false);
      setShowBanner(false);
    };

    const markUninstalled = () => {
      safeStorage.remove('local', PWA_INSTALLED_KEY);
      setShowBanner(!isDismissedForSession());
    };

    const evaluate = () => {
      if (isStandaloneMode()) {
        markInstalled();
        return;
      }

      const capturedPrompt = window.__onkatiInstallPrompt ?? null;
      if (capturedPrompt) {
        deferredPromptRef.current = capturedPrompt;
        markUninstalled();
        return;
      }

      // Safari kurulum/silme olayı bildirmez; tarayıcıda açıldıysa kurulu değildir.
      setShowBanner(!isDismissedForSession());
    };

    evaluate();

    const beforeInstallHandler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as InstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      window.__onkatiInstallPrompt = promptEvent;
      markUninstalled();
    };

    const canInstallHandler = () => {
      if (window.__onkatiInstallPrompt) {
        deferredPromptRef.current = window.__onkatiInstallPrompt;
        markUninstalled();
      }
    };

    const appInstalledHandler = () => {
      deferredPromptRef.current = null;
      window.__onkatiInstallPrompt = null;
      safeStorage.remove('session', PWA_SESSION_DISMISSED_KEY);
      markInstalled();
    };

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') evaluate();
    };

    // Eski Safari (iOS 13 ve öncesi) MediaQueryList.addEventListener desteklemez
    let mediaQuery: MediaQueryList | null = null;
    const standaloneListener = (event: MediaQueryListEvent) => {
      if (event.matches) markInstalled();
    };
    try {
      mediaQuery = window.matchMedia('(display-mode: standalone)');
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', standaloneListener);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(standaloneListener);
      }
    } catch {
      mediaQuery = null;
    }

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('onkati-can-install', canInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('onkati-can-install', canInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', standaloneListener);
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(standaloneListener);
        }
      }
    };
  }, []);

  const handleInstall = async () => {
    const installPrompt = deferredPromptRef.current ?? window.__onkatiInstallPrompt ?? null;

    // Kurulum penceresi yoksa (Safari, Firefox, Samsung vb.) adım adım rehber açılır
    if (!installPrompt) {
      setShowGuide(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      deferredPromptRef.current = null;
      window.__onkatiInstallPrompt = null;

      if (outcome === 'accepted') {
        safeStorage.set('local', PWA_INSTALLED_KEY, 'true');
        safeStorage.remove('session', PWA_SESSION_DISMISSED_KEY);
        setShowBanner(false);

        if ('Notification' in window && Notification.permission === 'default') {
          try {
            await Notification.requestPermission();
          } catch {
            // Bildirim izni alınamazsa sessizce devam
          }
        }
      }
    } catch (err) {
      // Yerel pencere açılamazsa rehber yedek olarak gösterilir
      console.warn('PWA install prompt error:', err);
      setShowGuide(true);
    }
  };

  const handleDismiss = () => {
    safeStorage.set('session', PWA_SESSION_DISMISSED_KEY, 'true');
    setShowGuide(false);
    setShowBanner(false);
  };

  if (!showBanner) return null;

  const guide = getGuide(platform);

  return (
    <>
      <div className="pwa-banner" role="dialog" aria-label="Ana ekrana ekle">
        <div className="pwa-banner-inner">
          <button type="button" onClick={handleDismiss} className="pwa-banner-close" aria-label="Kapat">
            <X className="w-4 h-4" />
          </button>
          <div className="pwa-banner-text">
            <h3 className="pwa-banner-title">{content.title}</h3>
            <p className="pwa-banner-desc">{content.description}</p>
          </div>
          <button type="button" onClick={handleInstall} className="pwa-banner-btn">
            {content.button}
          </button>
        </div>
      </div>

      {showGuide && (
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-3"
          onClick={() => setShowGuide(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ana ekrana ekleme rehberi"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-500/60 bg-slate-900 p-5 text-white shadow-2xl"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400">{guide.title}</p>
                <h3 className="mt-1 text-lg font-bold">3 adımda ana ekrana ekle</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
                aria-label="Rehberi kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3">
              {guide.steps.map(({ icon: StepIcon, text }, index) => (
                <li key={text} className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-extrabold text-slate-900">
                    {index + 1}
                  </span>
                  <StepIcon className="mt-1 h-5 w-5 shrink-0 text-amber-400" />
                  <span className="text-sm leading-relaxed text-white/90">{text}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-extrabold text-slate-900"
            >
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
}
