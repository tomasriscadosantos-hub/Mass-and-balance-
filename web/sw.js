// Offline support: keeps a copy of the app so it opens without signal at the
// airfield. Bump VERSION whenever any file below changes.
const VERSION = "mb-lppm-7";
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/data.js",
  "js/poh.js",
  "js/calc.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first, so updates show up straight away; the cache when offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // fonts and other sites: the browser handles them
  if (url.pathname.endsWith("/weather.json")) return; // weather is never served from the cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
