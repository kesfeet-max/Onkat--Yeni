/**
 * Onkatı PWA Service Worker v4
 * 
 * ÖNEMLİ: Bu SW arka planda (PWA kapalıyken) push bildirimi almak için tasarlanmıştır.
 * - skipWaiting() + clients.claim() ile eski SW anında değiştirilir
 * - Push event'te showNotification çağrısı yapılır
 * - notificationclick ile uygulama açılır/yönlendirilir
 * - actions KULLANILMIYOR — bazı tarayıcılarda "URL kopyala" tetikler
 */

const CACHE_VERSION = 'onkati-v4';
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.json'
];

// ============================================================
// INSTALL — Yeni SW hemen aktif olur (eski SW beklenmez)
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Eski SW'yi beklemeden hemen aktif ol
  self.skipWaiting();
});

// ============================================================
// ACTIVATE — Eski cache'leri temizle ve tüm client'ları kontrol al
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
    }).then(() => {
      // Tüm açık sekmeleri/client'ları bu SW'nin kontrolüne al
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH — Network first, fallback to cache
// ============================================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// ============================================================
// PUSH EVENT — Sunucudan VAPID imzalı WebPush geldiğinde tetiklenir
// 
// Bu event:
// - Telefon kilitliyken çalışır
// - Uygulama kapalıyken çalışır  
// - Arka plandayken çalışır
// - Tarayıcı tamamen kapalıyken bile çalışır (Android Chrome)
//
// NOT: actions dizisi KASITLI OLARAK KULLANILMIYOR.
// Bazı tarayıcılar (özellikle Samsung Internet, bazı Android WebView)
// actions desteklemediğinde fallback olarak "URL kopyalamak için dokunun"
// gösterir. Bu yüzden sadece basit bildirim gösteriyoruz.
// ============================================================
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      try {
        data = { body: event.data.text() };
      } catch (e2) {
        data = { body: 'Yeni bir bildiriminiz var' };
      }
    }
  }

  const title = data.title || '🔔 Onkatı - Yeni Bildirim';
  
  // BASİT bildirim seçenekleri — actions YOK, sadece temel alanlar
  // Bu, tarayıcının "URL kopyala" fallback davranışını engeller
  const options = {
    body: data.body || data.message || 'Yeni bir kampanya bildiriminiz var!',
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [300, 100, 300, 100, 300],
    silent: false,
    requireInteraction: true,
    renotify: true,
    tag: data.tag || ('onkati-push-' + Date.now()),
    timestamp: data.timestamp || Date.now(),
    // data alanı — notificationclick'te kullanılır
    data: {
      url: data.url || '/panel',
      openUrl: data.url || '/panel',
      campaign_id: data.campaign_id || null,
      store_name: data.store_name || '',
      timestamp: Date.now()
    }
    // NOT: actions dizisi KASITLI olarak eklenmedi
    // Bazı tarayıcılar actions'ı desteklemediğinde "URL kopyala" gösterir
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ============================================================
// NOTIFICATION CLICK — Bildirime tıklandığında uygulama açılır
// ============================================================
self.addEventListener('notificationclick', (event) => {
  // Bildirimi kapat
  event.notification.close();

  // data alanından URL al — yoksa /panel'e yönlendir
  const notifData = event.notification.data || {};
  const path = notifData.url || notifData.openUrl || '/panel';
  const targetUrl = path.startsWith('http') ? path : (self.location.origin + path);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Açık bir pencere varsa ona odaklan ve yönlendir
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      // Hiç pencere yoksa yeni pencere aç
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ============================================================
// NOTIFICATION CLOSE — Bildirim kapatıldığında (analytics için)
// ============================================================
self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data;
  if (data && data.campaign_id) {
    console.log('[SW] Bildirim kapatıldı, campaign:', data.campaign_id);
  }
});

// ============================================================
// PUSH SUBSCRIPTION CHANGE — Tarayıcı subscription yenilediğinde
// Client'a mesaj gönderir, client yeni subscription'ı sunucuya kaydeder
// ============================================================
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
          newSubscription: event.newSubscription ? event.newSubscription.toJSON() : null,
          oldSubscription: event.oldSubscription ? event.oldSubscription.toJSON() : null
        });
      });
    })
  );
});