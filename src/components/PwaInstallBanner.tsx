import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

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

/** Uygulama ana ekrandan (standalone) açıldıysa kurulu kabul edilir. */
function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

/**
 * Ana ekrana ekleme davet kutusu.
 *
 * Kapanma mantığı:
 * - Sağ üstteki "X": sadece o anki oturum için gizlenir (sessionStorage).
 *   Kullanıcı siteye daha sonra tekrar girdiğinde kutu yeniden görünür.
 * - Gerçek kurulum (`appinstalled` veya kurulum teklifinin kabul edilmesi):
 *   kalıcı olarak gizlenir (localStorage).
 * - Kullanıcı uygulamayı telefondan silerse tarayıcı yeniden `beforeinstallprompt`
 *   tetikler; bu durumda kalıcı kayıt temizlenir ve kutu tekrar aktif olur.
 */
export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showManualHint, setShowManualHint] = useState(false);
  const deferredPromptRef = useRef<InstallPromptEvent | null>(null);

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
    // Eski sürümdeki kalıcı kapatma kaydı artık kullanılmıyor; kullanıcıyı sonsuza kadar susturmasın.
    localStorage.removeItem(LEGACY_DISMISSED_KEY);

    const isDismissedForSession = () =>
      sessionStorage.getItem(PWA_SESSION_DISMISSED_KEY) === 'true';

    /** Uygulama kuruldu: kalıcı olarak gizle. */
    const markInstalled = () => {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      setShowManualHint(false);
      setShowBanner(false);
    };

    /** Tarayıcı kurulum teklifi veriyorsa uygulama telefonda yok demektir. */
    const markUninstalled = () => {
      localStorage.removeItem(PWA_INSTALLED_KEY);
      setShowBanner(!isDismissedForSession());
    };

    /** Mevcut duruma göre kutunun görünürlüğünü yeniden hesaplar. */
    const evaluate = () => {
      if (isStandaloneMode()) {
        markInstalled();
        return;
      }

      const capturedPrompt = window.__onkatiInstallPrompt ?? null;

      if (capturedPrompt) {
        // Kurulum teklifi mevcut → uygulama kurulu değil (veya silinmiş).
        deferredPromptRef.current = capturedPrompt;
        markUninstalled();
        return;
      }

      if (localStorage.getItem(PWA_INSTALLED_KEY) === 'true') {
        setShowBanner(false);
        return;
      }

      setShowBanner(!isDismissedForSession());
    };

    evaluate();

    const beforeInstallHandler = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as InstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      window.__onkatiInstallPrompt = promptEvent;
      // Uygulama silinip siteye tekrar girildiğinde bu olay yeniden tetiklenir.
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
      // Kurulum gerçekleştiğine göre oturum bazlı kapatma kaydı da gereksiz.
      sessionStorage.removeItem(PWA_SESSION_DISMISSED_KEY);
      markInstalled();
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const standaloneListener = (event: MediaQueryListEvent) => {
      if (event.matches) {
        markInstalled();
      }
    };

    // Kullanıcı sekmeye geri döndüğünde durum değişmiş olabilir (kurulum veya silme).
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        evaluate();
      }
    };

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('onkati-can-install', canInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);
    mediaQuery.addEventListener('change', standaloneListener);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('onkati-can-install', canInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
      mediaQuery.removeEventListener('change', standaloneListener);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, []);

  const handleInstall = async () => {
    const installPrompt = deferredPromptRef.current ?? window.__onkatiInstallPrompt ?? null;

    // Kurulum teklifi yoksa (örn. iOS Safari) elle ekleme yönlendirmesi göster.
    if (!installPrompt) {
      setShowManualHint(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;

      deferredPromptRef.current = null;
      window.__onkatiInstallPrompt = null;

      if (outcome === 'accepted') {
        // Gerçek kurulum: kalıcı olarak gizle.
        localStorage.setItem(PWA_INSTALLED_KEY, 'true');
        sessionStorage.removeItem(PWA_SESSION_DISMISSED_KEY);
        setShowBanner(false);

        if ('Notification' in window && Notification.permission === 'default') {
          try {
            await Notification.requestPermission();
          } catch {
            // Bildirim izni alınamazsa sessizce devam
          }
        }
      }
      // Kullanıcı kurulumu reddettiyse kutu açık kalır, tekrar denenebilir.
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
  };

  /** Sadece bu oturum için gizle; sonraki ziyarette kutu yeniden görünür. */
  const handleDismiss = () => {
    sessionStorage.setItem(PWA_SESSION_DISMISSED_KEY, 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-inner">
        {/* Kapatma Butonu — sadece bu oturum için gizler */}
        <button
          onClick={handleDismiss}
          className="pwa-banner-close"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="pwa-banner-text">
          <h3 className="pwa-banner-title">{content.title}</h3>
          <p className="pwa-banner-desc">{content.description}</p>
          {showManualHint && (
            <p className="pwa-banner-desc">
              {isIosDevice()
                ? 'Safari\'de alttaki Paylaş simgesine dokun, ardından "Ana Ekrana Ekle" seçeneğini seç.'
                : 'Tarayıcı menüsünü aç ve "Uygulamayı yükle" / "Ana ekrana ekle" seçeneğine dokun.'}
            </p>
          )}
        </div>
        <button onClick={handleInstall} className="pwa-banner-btn">
          {content.button}
        </button>
      </div>
    </div>
  );
}