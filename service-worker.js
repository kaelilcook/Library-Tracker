// JavaScript source code
self.addEventListener("install", () => {
    console.log("Service Worker installed");
});

self.addEventListener("fetch", (event) => {

  const url = new URL(event.request.url);

  // ❌ ignore external images completely
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});