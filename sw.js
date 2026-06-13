const CACHE = 'abedin-v41';
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/style.css',
  '/script.js',
  '/projects.json',
  '/manifest.webmanifest',
  '/assets/avatar-dhaka.webp',
  '/assets/contributions.json',
  '/assets/fonts/fonts.css',
  '/assets/favicon.svg',
  '/assets/favicon-32.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Decide which fallback to serve when offline + uncached.
async function offlineFallback(request) {
  // Navigation? Serve the branded offline.html page (precached).
  if (request.mode === 'navigate' || request.destination === 'document') {
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
  }
  // Image? Serve a tiny transparent SVG instead of a broken image.
  if (request.destination === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } }
    );
  }
  // Everything else (JSON/CSS/JS): readable plaintext with proper UTF-8.
  return new Response('Offline — check back when connected.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = e.request.mode === 'navigate' || e.request.destination === 'document';
  const isCritical = isNavigation
    || url.pathname.endsWith('.json')
    || url.pathname.endsWith('/sw.js')
    || url.pathname.endsWith('/script.js')
    || url.pathname.endsWith('/style.css');

  if (isCritical) {
    // NETWORK-FIRST for pages + core assets: deploys show up on the very next
    // load instead of two reloads later. Cache is only the offline fallback.
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(e.request).then(cached => cached || offlineFallback(e.request))
      )
    );
    return;
  }

  // CACHE-FIRST for immutable-ish assets (images, fonts) — fast and cheap,
  // refreshed in the background.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => cached || offlineFallback(e.request));
      return cached || network;
    })
  );
});
