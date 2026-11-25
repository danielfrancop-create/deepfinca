const CACHE_PREFIX = 'finca-sauces-';
const CACHE_NAME = 'finca-sauces-v2';
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        await cache.add(url);
      } catch (error) {
        console.warn('No se pudo precargar el recurso:', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let response;
    try {
      response = await fetch(request, { cache: 'no-cache' });
    } catch (error) {
      const cachedResponse = await cache.match(request, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;
      if (request.mode === 'navigate') {
        const cachedShell = await cache.match('./index.html');
        if (cachedShell) return cachedShell;
      }
      throw error;
    }

    if (response.ok && response.type === 'basic') {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.warn('No se pudo actualizar el caché del recurso:', request.url, error);
      }
    }
    return response;
  })());
});
