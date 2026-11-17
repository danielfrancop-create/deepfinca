const CACHE_NAME = 'finca-sauces-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './bridge.js',
  './Styles.txt',
  './Header.txt',
  './JavaScript.txt',
  './Modals.txt',
  './ViewDashboard.txt',
  './ViewPOS.txt',
  './ViewCashflow.txt',
  './ViewLoans.txt',
  './ViewPersonalExpenses.txt',
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
      // Intentamos cachear uno por uno o en lote de forma segura
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn(`No se pudo cachear: ${url}`, err)))
      );
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

  // Excluimos las peticiones a Google Apps Script para que siempre vayan a la red
  if (url.hostname === 'script.google.com') {
    return;
  }

  // Estrategia Network-first o Stale-while-revalidate para CDNs y fuentes externas
  if (url.hostname.includes('cdn.') || url.hostname.includes('fonts.googleapis.com')) {
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

  // Para archivos locales: Cache first, luego red
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
