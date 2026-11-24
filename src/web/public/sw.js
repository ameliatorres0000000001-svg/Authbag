// Anajak Secondhand service worker: makes the app installable and keeps the shell available offline.
// API calls and photos are never cached here, so every reading always comes from the server.
const SHELL = 'hengz-shell-v4';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // network first; the cached shell only when offline
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    // hashed build files never change: cache after the first load
    // never keep an HTML answer (the SPA fallback for a missing file) as a stylesheet/script: that left the app unstyled
    const good = (r) => r.ok && !(r.headers.get('content-type') || '').includes('text/html');
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req);
      if (hit && good(hit)) return hit;
      const r = await fetch(req);
      if (good(r)) c.put(req, r.clone()); else if (hit) c.delete(req);
      return r;
    }));
  }
});

// Expert notifications (Web Push): show them with sound/vibration, open the request when tapped.
self.addEventListener('push', (e) => {
  let n = { title: 'Anajak Secondhand', body: '', url: '/', tag: undefined };
  try { n = { ...n, ...e.data.json() }; } catch { /* plain or empty message */ }
  e.waitUntil(self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, renotify: !!n.tag, requireInteraction: true,
    icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', vibrate: [120, 60, 120], data: { url: n.url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
