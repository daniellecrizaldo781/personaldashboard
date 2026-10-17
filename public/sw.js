/* ===== Personal Dashboard Service Worker ===== */
const CACHE_NAME = 'personal-dashboard-v1';
const ASSETS_CACHE = 'assets-v1';
const DATA_CACHE = 'data-v1';

const ASSETS_TO_CACHE = [
  '/dashboard.html',
  '/manifest.json',
  '/assets/styles.css',
  '/assets/icons.js',
  '/assets/api.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== ASSETS_CACHE && name !== DATA_CACHE) {
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(DATA_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets and pages: cache first
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 &&
              networkResponse.type === 'basic') {
            caches.open(ASSETS_CACHE).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback for HTML pages when offline
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/dashboard.html');
        }
      })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = JSON.parse(event.data.text());
  } catch (e) {
    payload = { title: 'Notification', body: event.data.text() };
  }

  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'dashboard-notification',
    data: {
      url: payload.url || '/',
      ...payload.data
    },
    actions: [
      { action: 'open', title: 'Open', icon: '/icons/icon-192.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: payload.priority === 'Urgent',
    vibrate: payload.priority === 'Urgent' ? [200, 100, 200] : undefined
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
