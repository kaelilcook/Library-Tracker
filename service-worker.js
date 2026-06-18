// JavaScript source code
self.addEventListener("install", () => {
    console.log("Service Worker installed");
});

const CACHE_NAME = "library-cache";
const BASE = "/Library-Tracker/";

self.addEventListener("fetch", (event) => {

  const url = new URL(event.request.url);

  // ignore external resources (images, API calls, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 🧠 IMPORTANT: handle page navigation
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match("/Library-Tracker/index.html");
      })
    );
    return;
  }

  // normal asset handling
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        "/Library-Tracker/",
        "/Library-Tracker/index.html",
        "/Library-Tracker/Script2.js",
        "/Library-Tracker/style.css"
      ]);
    })
  );
});