/* Home-screen app support. Network first, so a new version shows up on the next
   open; the cache only lets the shell load without a connection. Client data
   (/api/) is never cached on the device. */
const CACHE = 'gc-crm-v1';
const SHELL = ['/crm/', '/crm/app.css', '/crm/app.js', '/crm/core.js', '/assets/favicon.svg',
  '/assets/fonts/assistant-400-hebrew.woff2', '/assets/fonts/suez-400-hebrew.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/crm/') && !SHELL.includes(url.pathname)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('/crm/')))
  );
});
