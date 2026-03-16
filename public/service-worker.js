// BookLens Service Worker
// Cache-first for static assets, network-first for API calls.

const CACHE_NAME = 'booklens-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/bookLens.svg',
  // app.js intentionally excluded — always fetched fresh from network
];

// ── Install: pre-cache static assets ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache failed for some assets:', err);
      })
    )
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches, then force-reload all tabs ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const oldKeys = keys.filter((k) => k !== CACHE_NAME);
      const isUpgrade = oldKeys.length > 0;
      await Promise.all(oldKeys.map((k) => caches.delete(k)));
      await self.clients.claim();
      // Force open tabs to reload once so they pick up the fresh app.js
      if (isUpgrade) {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
      }
    })
  );
});

// ── Fetch: route requests ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through non-GET requests (POST uploads, API calls)
  if (request.method !== 'GET') return;

  // Network-first for API endpoints
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // app.js always fetched from network — never cached
  if (url.pathname === '/app.js' || url.pathname.startsWith('/app.js')) {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Cache-first for everything else (static assets, CDN resources)
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && (request.url.startsWith(self.location.origin) || isCdnUrl(request.url))) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline — BookLens requires a network connection for new summaries.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'You are offline. Please reconnect to use this feature.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function isCdnUrl(url) {
  const cdnHosts = ['unpkg.com', 'cdn.tailwindcss.com', 'd3js.org', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  try {
    const { hostname } = new URL(url);
    return cdnHosts.some((h) => hostname.endsWith(h));
  } catch {
    return false;
  }
}
