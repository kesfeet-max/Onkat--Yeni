const CACHE_NAME = 'onkati-v3';
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.json'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

/**
 * PUSH EVENT — Gerçek Web Push bildirimi geldiğinde tetiklenir
 * 
 * Bu event YALNIZCA sunucudan (Edge Function push-send) VAPID imzalı
 * WebPush protokolü ile gönderilen mesajlarda tetiklenir.
 * 
 * Telefon kilitliyken, uygulama kapalıyken veya arka plandayken bile çalışır.
 * Heads-up notification (üstten açılır bildirim) için:
 * - requireInteraction: true
 * - vibrate pattern tanımlı
 * - silent: false (ses çalar)
 * - renotify: true (aynı tag ile bile tekrar bildirir)
 * - urgency: Edge Function'dan "high" olarak gönderilmeli (HTTP header)
 */
self.addEventListener('push', (event) => {
  let data = {};
  
  // Push payload'ı parse et
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // JSON parse edilemezse text olarak al
      data = { body: event.data.text() };
    }
  }

  const title = data.title || '🔔 Onkatı - Yeni Bildirim';
  
  const options = {
    body: data.body || data.message || 'Yeni bir kampanya bildiriminiz var!',
    icon: data.icon || '/favicon.svg',
    badge: '/favicon.svg',
    image: data.image || undefined, // Büyük resim (varsa)
    
    // Ses ve titreşim — heads-up notification için kritik
    vibrate: [300, 100, 300, 100, 300], // Güçlü titreşim paterni
    silent: false, // Ses AÇIK — telefon sesli moddaysa bildirim sesi çalar
    
    // Görünürlük ve etkileşim
    requireInteraction: true, // Kullanıcı kapatana kadar bildirim ekranda kalır
    renotify: true, // Aynı tag ile bile yeniden bildirim göster
    tag: data.tag || 'onkati-campaign-' + Date.now(),
    
    // Zaman damgası — bildirimin ne zaman oluşturulduğunu gösterir
    timestamp: data.timestamp || Date.now(),
    
    // Tıklama verisi
    data: {
      url: data.url || '/panel',
      campaign_id: data.campaign_id || null,
      store_name: data.store_name || '',
      timestamp: Date.now(),
      // Uygulamayı açmak için gerekli bilgiler
      openUrl: data.url || '/panel'
    },
    
    // Aksiyon butonları
    actions: [
      { action: 'open', title: '📋 Görüntüle', icon: '/favicon.svg' },
      { action: 'dismiss', title: '✕ Kapat' }
    ]
  };

  // showNotification çağrısı — bu, OS bildirim paneline düşer
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Bildirime tıklama — kullanıcı bildirimi tıkladığında
 * Uygulamayı açar veya mevcut pencereye odaklanır
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  if (action === 'dismiss') return;

  // data alanı yoksa bile güvenli fallback — "/panel" sayfasına yönlendir
  const notifData = event.notification.data || {};
  const url = notifData.url || notifData.openUrl || '/panel';
  const targetUrl = url.startsWith('http') ? url : (self.location.origin + url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Zaten açık bir pencere varsa ona odaklan ve navigate et
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      return self.clients.openWindow(targetUrl);
    })
  );
});

/**
 * Push subscription değişikliği — tarayıcı subscription'ı yenilediğinde
 * Yeni subscription'ı sunucuya kaydetmek için client'a mesaj gönder
 */
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

// Bildirim kapandığında (analytics için)
self.addEventListener('notificationclose', (event) => {
  // İleride analytics veya loglama yapılabilir
  const data = event.notification.data;
  if (data?.campaign_id) {
    // Campaign bildirim kapatma logu
    console.log('[SW] Bildirim kapatıldı:', data.campaign_id);
  }
});