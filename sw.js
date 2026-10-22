/* AzNetMove service worker — caches the app so it works offline.
   Bump VERSION whenever files change so phones pick up the update. */
const VERSION = 'aznetmove-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/main.css',
  'js/state.js',
  'js/ui.js',
  'js/app.js',
  'js/modules/welcome.js',
  'js/modules/ip.js',
  'js/modules/vnet.js',
  'js/modules/nsg.js',
  'js/modules/routing.js',
  'js/modules/netgroups.js',
  'js/modules/firewall.js',
  'js/modules/traffic.js',
  'js/modules/endpoints.js',
  'js/modules/dns.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so you always get the latest when online), cache fallback when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
