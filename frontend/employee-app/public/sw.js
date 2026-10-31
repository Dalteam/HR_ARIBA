// ARIBA Employee — service worker (hand-written and small on purpose: a service worker that caches too much makes updates hard).
// What it does:
//  • keeps the app shell (index.html, the hashed JS/CSS/fonts/images under /_expo and /assets, the icons) so the app opens with no network;
//  • page loads: network first, the cached shell only when offline, so a new release is picked up on the next open;
//  • NEVER touches anything that is not a GET to this origin — the API lives on another origin and is never cached
//    (salaries, requests and tokens must always come live from the server).
const VERSION = 'ariba-employee-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ariba-employee-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const hashed = (url) => url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // the API and any other origin: straight to the network

  if (req.mode === 'navigate') {                               // opening / reloading the app
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return res; })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (hashed(url)) {                                           // build files carry a content hash: cache first is safe
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
