const CACHE_NAME = 'finca-sauces-v3'; // Versión actualizada para forzar limpieza
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './Styles.txt',
  './Header.txt',
  './JavaScript.txt',
  './Modals.txt',
  './ViewDashboard.txt',
  './ViewPOS.txt',
  './ViewCashflow.txt',
  './ViewExternalIncome.txt',
  './ViewMap.txt',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.29/jspdf.plugin.autotable.min.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('Precache parcial falló:', err);
      });
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorar peticiones que NO sean GET (como los POST a GAS)
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Ignorar peticiones a Google Apps Script
  if (url.hostname === 'script.google.com' || url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // 3. Estrategia para CDNs (Network First, fallback a caché)
  if (url.hostname.includes('cdn.') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('cloudflare.com')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 4. Estrategia para archivos locales (Cache First, fallback a red)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
