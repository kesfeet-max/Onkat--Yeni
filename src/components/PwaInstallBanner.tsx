import { useState, useEffect, useRef } from 'react';

interface PwaInstallBannerProps {
  variant: 'customer' | 'merchant';
}

type FallbackHint = 'ios' | 'desktop' | null;

export function PwaInstallBanner({ variant }: PwaInstallBannerProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [fallbackHint, setFallbackHint] = useState<FallbackHint>(null);
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

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      // Eğer hint gösteriliyorsa kaldır (prompt hazır)
      setFallbackHint(null);
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

  const detectPlatform = (): FallbackHint => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

    if (isIOS || isSafari) {
      return 'ios';
    }

    // Masaüstü Chrome/Edge ama deferredPrompt henüz yakalanmadı
    return 'desktop';
  };

  const handleInstall = async () => {
    if (deferredPromptRef.current) {
      // deferredPrompt hazır — doğrudan PWA yükleme penceresini aç
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
      // deferredPrompt yok — platforma göre şık yönlendirme göster
      const hint = detectPlatform();
      setFallbackHint(hint);
    }

    // Bildirim izni iste (sessizce)
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

        {/* Fallback yönlendirme ipuçları */}
        {fallbackHint === 'ios' && (
          <div className="pwa-banner-hint">
            <span className="pwa-banner-hint-icon">📲</span>
            <span>
              Ekranın altındaki <strong>Paylaş</strong> (⬆️) butonuna bas → <strong>"Ana Ekrana Ekle"</strong> seçeneğini seç.
            </span>
          </div>
        )}

        {fallbackHint === 'desktop' && (
          <div className="pwa-banner-hint">
            <span className="pwa-banner-hint-icon">💻</span>
            <span>
              Adres çubuğunun sağındaki <strong>⊕ Uygulamayı Yükle</strong> simgesine tıklayın.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}