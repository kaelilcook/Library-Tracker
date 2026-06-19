// JavaScript source code
self.addEventListener("install", () => {
    console.log("Service Worker installed");
});


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

const CACHE_NAME = "library-cache-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {

      const files = [
        "./",
        "./index.html",
        "./Script2.js",
        "./style.css",
        "./manifest.json"
      ];

      for (const file of files) {
        try {
          await cache.add(file);
          console.log("CACHED:", file);
        } catch (err) {
          console.error("❌ FAILED:", file, err);
        }
      }

    })
  );
});