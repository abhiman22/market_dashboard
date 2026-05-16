self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Pass all network requests through — no offline cache needed (live financial data)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

// Handle incoming push messages from the server
self.addEventListener('push', (event) => {
  let data = { title: 'Market Insights', body: '' };
  if (event.data) {
    try { data = event.data.json(); } catch (_) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: '/' }
    })
  );
});

// Tap on notification opens / focuses the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
