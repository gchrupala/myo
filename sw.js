// Offline support. App files are served from the cache at once.
//
// Bump VERSION with every change to the app files. The browser then installs
// this worker again with the new files, and the page reloads into them
// (see the controllerchange handler in js/app.js).
const VERSION = 'v12';
const APP_CACHE = `myo-app-${VERSION}`;
const FONT_CACHE = 'myo-fonts';
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'js/app.js',
  'js/store.js',
  'js/format.js',
  'js/i18n.js',
  'js/sync.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      // 'reload' skips the HTTP cache, which could still hold the old files.
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return (fallback && (await cache.match(fallback))) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    const fallback = request.mode === 'navigate' ? './' : null;
    event.respondWith(staleWhileRevalidate(request, APP_CACHE, fallback));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE, null));
  }
});
