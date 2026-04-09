// ═══════════════════════════════════════════════════
// Gupy Pulse — Service Worker v2
// Suporta: Cache offline + Web Push Notifications
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'gupy-pulse-v2';
const OFFLINE_ASSETS = ['/out-app-gupy/', '/out-app-gupy/index.html', '/out-app-gupy/manifest.json'];

// ── Install: cache assets ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network first, fallback to cache ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push: receive notification ──
self.addEventListener('push', e => {
  let data = { title: 'Gupy Pulse', body: 'Nova atualização disponível.' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/out-app-gupy/icon-512.png',
      badge: '/out-app-gupy/icon-512.png',
      tag: data.tag || 'gupy-pulse',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/out-app-gupy/' }
    })
  );
});

// ── Notification click: open app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/out-app-gupy/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('out-app-gupy') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
