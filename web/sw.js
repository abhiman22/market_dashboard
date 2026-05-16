// Service Worker — enables PWA install prompt
// Passes all requests through to the network; no offline caching needed
// since this app requires live financial data.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
