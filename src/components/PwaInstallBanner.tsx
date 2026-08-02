import { useState, useEffect, useRef } from 'react';

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
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
    // Standalone mod kontrolü
    const standaloneCheck =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(standaloneCheck);

    if (standaloneCheck) {
      setShowBanner(false);
      return;
    }

    // Standalone değilse her zaman göster
    setShowBanner(true);

    // beforeinstallprompt olayını global olarak yakala
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Standalone moda geçiş dinle
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const standaloneListener = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsStandalone(true);
        setShowBanner(false);
      }
    };
    mediaQuery.addEventListener('change', standaloneListener);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
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

  // Standalone modda veya gösterilmemesi gerekiyorsa render etme
  if (isStandalone || !showBanner) return null;

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