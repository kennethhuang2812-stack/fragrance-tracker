// Offline support. The page and price data always come fresh from the network
// (skipping the browser's HTTP cache); the saved copy is only used when offline.
const CACHE = 'jr-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // job feeds always go straight to the network
  const fresh = url.origin === location.origin &&
    (req.mode === 'navigate' || url.pathname.endsWith('/') || /\.(html|json|webmanifest)$/.test(url.pathname));
  if (fresh) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => {
      if (r.ok && !url.pathname.endsWith('data.json')) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req.mode === 'navigate' ? 'index.html' : req, c)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return r;
  })));
});
