// Offline support: keeps a copy of the app so it opens without signal at the
// airfield. Bump VERSION whenever any file below changes: that is what tells
// installed apps there is an update (the page then reloads itself once).
const VERSION = "mb-lppm-15";
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "js/data.js",
  "js/poh.js",
  "js/calc.js",
  "js/changes.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

// GitHub Pages lets browsers keep files for 10 minutes. "reload" and
// "no-cache" ask the server every time, so an update is never missed.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
  );
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
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
