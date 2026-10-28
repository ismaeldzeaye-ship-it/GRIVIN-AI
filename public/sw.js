// GREVIN AI - Service Worker for Background Push Notifications & Offline Caching
const CACHE_NAME = 'grevin-ai-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Cache first with network fallback for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Ignore API requests and Vite internal modules from static caching
  if (event.request.url.includes('/api/') || event.request.url.includes('/@vite/') || event.request.url.includes('/src/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        })
      );
    })
  );
});

// REAL PUSH NOTIFICATIONS: Triggers even when the browser / app is completely closed
self.addEventListener('push', (event) => {
  let data = {
    title: 'GREVIN AI — MARKET SIGNAL',
    body: 'New institutional signal alert received.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'grevin-ai-alert-' + Date.now(),
    data: { url: '/' },
    vibrate: [200, 100, 200, 100, 200]
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    tag: data.tag || 'grevin-ai-alert',
    renotify: true,
    requireInteraction: true,
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || { url: '/' },
    actions: [
      { action: 'open_signal', title: 'Open Signal' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
