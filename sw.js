const IS_LOCALHOST = (() => {
    const h = self.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
})();

const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `blundermate-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `blundermate-runtime-${CACHE_VERSION}`;

const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/main.js',
    '/engine.js',
    '/chessApi.js',
    '/gemini.js',
    '/ui.js',
    '/utils.js',
    '/strings.js',
    '/storage.js',
    '/vault.js',
    '/savedGames.js',
    '/engine/stockfish-18-lite-single.js',
    '/engine/stockfish-18-lite-single.wasm',
    '/logo.png',
    '/manifest.webmanifest',
];

const RUNTIME_CDN_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'cdnjs.cloudflare.com',
];

self.addEventListener('install', (event) => {
    if (IS_LOCALHOST) {
        self.skipWaiting();
        return;
    }
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    if (IS_LOCALHOST) {
        event.waitUntil((async () => {
            console.log('[SW] Disabled on localhost');
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
            await self.registration.unregister();
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(c => c.navigate(c.url));
        })());
        return;
    }
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys
                .filter(k => k !== APP_SHELL_CACHE && k !== RUNTIME_CACHE)
                .map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (IS_LOCALHOST) return;
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    if (url.pathname.startsWith('/api/')) return;

    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirst(req, APP_SHELL_CACHE));
        return;
    }

    if (RUNTIME_CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    }
});

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
    } catch (err) {
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
        throw err;
    }
}

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
    }).catch(() => cached);
    return cached || fetchPromise;
}
