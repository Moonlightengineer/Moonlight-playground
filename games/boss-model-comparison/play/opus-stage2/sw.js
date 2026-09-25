// generated at build time
const CACHE_PREFIX = 'boss-opus-stage2-';
const CACHE = 'boss-opus-stage2-cb8a4a7e89';
const ASSETS = ["./","./index.html","./assets/index-Ccc9WRz9.js","./assets/index-C-ql9nlT.css","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./manifest.webmanifest"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || !req.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('./index.html')) : Response.error())),
    ),
  );
});
