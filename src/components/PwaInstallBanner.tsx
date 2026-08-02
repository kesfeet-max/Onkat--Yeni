import { useState, useEffect, useRef } from 'react';

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  const content = variant === 'merchant'
    ? {
        title: '💵 Müşterini Kaçırma! 💰',
        description: 'QR kodları saniyesinde okutmak için paneli ekrana sabitle.',
        button: '💸 MASAÜSTÜNE SABİTLE',
      }
    : {
        title: '💰 Puanların Kaybolmasın! 💸',
        description: 'Kasada bekleme, Onkatı\'yı tek tıkla ekrana sabitle! 🚀',
        button: '💵 EKRANA SABİTLE',
      };

  useEffect(() => {
    // Zaten standalone modda mı?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setShowBanner(false);
      return;
    }

    // Kullanıcı daha önce kapattı mı? (24 saat boyunca gösterme)
    const dismissed = localStorage.getItem('onkati_pwa_dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
        setShowBanner(false);
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS için: beforeinstallprompt olmaz ama yine de banner göster
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS && !isStandalone) {
      setTimeout(() => setShowBanner(true), 2000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
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
    } else {
      // iOS - kullanıcıya talimat göster
      alert('Safari menüsünden "Ana Ekrana Ekle" seçeneğini kullanın.');
    }

    // Bildirim izni iste
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Kullanıcı reddetti veya hata
      }
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('onkati_pwa_dismissed', Date.now().toString());
  };

  if (!showBanner) return null;

  return (
    <div className="pwa-banner">
      <button
        onClick={handleDismiss}
        className="pwa-banner-close"
        aria-label="Kapat"
      >
        ✕
      </button>
      <div className="pwa-banner-content">
        <h3 className="pwa-banner-title">{content.title}</h3>
        <p className="pwa-banner-desc">{content.description}</p>
      </div>
      <button onClick={handleInstall} className="pwa-banner-btn">
        {content.button}
      </button>
    </div>
  );
}