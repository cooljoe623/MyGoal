/* ============================================================
   SERVICE-WORKER.JS — offline caching for the PWA
   ============================================================ */

// Bump this version string every time app files change — it's the only
// thing that forces browsers to actually fetch the new files instead of
// silently continuing to serve a stale cached copy forever.
const CACHE_NAME = 'forester-mission-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/animations.css',
  './css/responsive.css',
  './js/utils.js',
  './js/storage.js',
  './js/notifications.js',
  './js/dashboard.js',
  './js/charts.js',
  './js/calendar.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for same-origin app files: always try to fetch the latest
// version first, and only fall back to the cached copy if the network is
// unavailable (offline). This trades a little speed for never being stuck
// on stale HTML/CSS/JS after an update — the old cache-first strategy could
// otherwise serve outdated app code indefinitely even after files changed
// on disk, since installing a new service worker only happens when
// service-worker.js itself changes byte-for-byte.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isSameOrigin = new URL(req.url).origin === location.origin;
  if (!isSameOrigin) {
    // Third-party CDN assets (fonts, Chart.js, etc.) — cache-first is fine here.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
