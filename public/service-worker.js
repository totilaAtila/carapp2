const CACHE_NAME = 'carapp-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/index.css',
  '/assets/index.js',
  // sql.js se încarcă dinamic, deci nu-l includem aici
];

// Instalare service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Interceptare requests
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Returnează din cache sau fetch de pe net
        return response || fetch(event.request);
      })
  );
});