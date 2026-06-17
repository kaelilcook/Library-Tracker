// JavaScript source code
self.addEventListener("install", () => {
    console.log("Service Worker installed");
});

self.addEventListener("fetch", (event) => {

    const url = new URL(event.request.url);

    // only cache your own site
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request);
        })
    );
});