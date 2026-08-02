import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const PWA_INSTALLED_KEY = 'pwa_installed';
const PWA_DISMISSED_KEY = 'pwa_banner_dismissed';

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const deferredPromptRef = useRef<any>(null);

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
    // 1. Daha önce kapatılmış mı kontrol et
    if (localStorage.getItem(PWA_DISMISSED_KEY) === 'true') {
      setShowBanner(false);
      return;
    }

    // 2. Daha önce kurulmuş mu kontrol et
    if (localStorage.getItem(PWA_INSTALLED_KEY) === 'true') {
      setShowBanner(false);
      return;
    }

    // 3. Standalone modda mı kontrol et
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      setShowBanner(false);
      return;
    }

    // 4. Kurulmamış, kapatılmamış ve standalone değil — banner'ı göster
    setShowBanner(true);

    // beforeinstallprompt olayını global olarak yakala
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    // appinstalled olayını dinle
    const appInstalledHandler = () => {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      setShowBanner(false);
    };
    window.addEventListener('appinstalled', appInstalledHandler);

    // Standalone moda geçiş dinle
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const standaloneListener = (e: MediaQueryListEvent) => {
      if (e.matches) {
        localStorage.setItem(PWA_INSTALLED_KEY, 'true');
        setShowBanner(false);
      }
    };
    mediaQuery.addEventListener('change', standaloneListener);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      window.removeEventListener('appinstalled', appInstalledHandler);
      mediaQuery.removeEventListener('change', standaloneListener);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt();
        const result = await deferredPromptRef.current.userChoice;
        if (result.outcome === 'accepted') {
          localStorage.setItem(PWA_INSTALLED_KEY, 'true');
          setShowBanner(false);
        }
      } catch (err) {
        console.warn('PWA install prompt error:', err);
      }
      deferredPromptRef.current = null;
    }

    // Bildirim izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Sessizce devam
      }
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(PWA_DISMISSED_KEY, 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-inner">
        {/* Kapatma Butonu */}
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
        </div>
        <button onClick={handleInstall} className="pwa-banner-btn">
          {content.button}
        </button>
      </div>
    </div>
  );
}