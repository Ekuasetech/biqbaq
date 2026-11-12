// Biqbaq's service worker (Q-61). It does one thing: when a page cannot load because there is
// no connection, it shows a friendly offline page. It keeps nothing else, so no account,
// payment or private page is ever stored on the device, and every visit gets the live site.
const CACHE = "biqbaq-offline-v1";
const OFFLINE = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Older versions of this worker's store are removed.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only page visits; everything else goes to the network untouched.
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
});
