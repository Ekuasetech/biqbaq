// Biqbaq's service worker (Q-61, Q-66). When a page cannot load because there is no
// connection, it shows a friendly offline page; and it shows phone notifications, opening the
// right page when one is tapped. It keeps nothing else, so no account, payment or private page
// is ever stored on the device, and every visit gets the live site.
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

// A phone notification from Biqbaq's server: a short title and line, and the page to open.
self.addEventListener("push", (event) => {
  let message = { title: "Biqbaq", body: "", url: "/", tag: undefined };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // Unreadable: the plain notification still says something happened.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // One per conversation: a new message replaces the last one rather than piling up.
      tag: message.tag,
      renotify: Boolean(message.tag),
      data: { url: message.url },
    }),
  );
});

// Tapping opens the page, in an open Biqbaq window if there is one. Only Biqbaq's own pages.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = typeof event.notification.data?.url === "string" && event.notification.data.url.startsWith("/") ? event.notification.data.url : "/";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.navigate(target).then((client) => (client ?? open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
