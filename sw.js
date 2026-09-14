const CACHE_NAME = 'stepplify-offline-v8';
const OFFLINE_URL = '/404.html?mode=offline';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/catalog.html',
  '/map.html',
  '/404.html',
  '/styles.css',
  '/script.js',
  '/assets/logo-icon.png'
];

// 1. Install Event - Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.log('Precache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Serve from Network, fallback to Cache/Offline Page
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests for web pages/assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid response, clone & cache static assets
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Network failed (offline / server unreachable)
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // If navigating to a page, return offline 404 page
        if (event.request.mode === 'navigate') {
          const offlinePage = await caches.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
          return caches.match('/404.html');
        }
      })
  );
});
