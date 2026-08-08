const CACHE_NAME = 'onkati-v2';
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

// Push notifications - Sesli ve yüksek öncelikli
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Onkatı - Yeni Bildirim';
  const options = {
    body: data.body || 'Yeni bir kampanya bildiriminiz var!',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'onkati-campaign-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: {
      url: data.url || '/dashboard',
      campaign_id: data.campaign_id || null,
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Görüntüle' },
      { action: 'dismiss', title: 'Kapat' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Bildirime tıklama
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  if (action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Zaten açık bir pencere varsa ona odaklan
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      return self.clients.openWindow(url);
    })
  );
});

// Bildirim kapandığında
self.addEventListener('notificationclose', (event) => {
  // Analytics veya loglama yapılabilir
});