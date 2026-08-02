import { useState, useEffect, useRef } from 'react';

const PWA_INSTALLED_KEY = 'pwa_installed';

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
    // 1. Daha önce kurulmuş mu kontrol et
    if (localStorage.getItem(PWA_INSTALLED_KEY) === 'true') {
      setShowBanner(false);
      return;
    }

    // 2. Standalone modda mı kontrol et
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      // Standalone modda açıldıysa kurulmuş demektir — bayrağı kaydet
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      setShowBanner(false);
      return;
    }

    // 3. Kurulmamış ve standalone değil — banner'ı göster
    setShowBanner(true);

    // beforeinstallprompt olayını global olarak yakala
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    // appinstalled olayını dinle — kurulum tamamlandığında bayrağı kaydet
    const appInstalledHandler = () => {
      localStorage.setItem(PWA_INSTALLED_KEY, 'true');
      setShowBanner(false);
    };
    window.addEventListener('appinstalled', appInstalledHandler);

    // Standalone moda geçiş dinle (kurulum sonrası)
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
    // deferredPrompt hazırsa doğrudan tarayıcının yükleme pop-up'ını aç
    if (deferredPromptRef.current) {
      try {
        deferredPromptRef.current.prompt();
        const result = await deferredPromptRef.current.userChoice;
        if (result.outcome === 'accepted') {
          // Kullanıcı kabul etti — bayrağı kaydet ve banner'ı gizle
          localStorage.setItem(PWA_INSTALLED_KEY, 'true');
          setShowBanner(false);
        }
      } catch (err) {
        console.warn('PWA install prompt error:', err);
      }
      deferredPromptRef.current = null;
    }

    // Bildirim izni iste (sessizce, hata vermeden)
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Kullanıcı reddetti veya hata — sessizce devam
      }
    }
  };

  // Banner gösterilmeyecekse render etme
  if (!showBanner) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-inner">
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