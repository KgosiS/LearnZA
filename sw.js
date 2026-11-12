const SHELL_CACHE = "learnza-shell-v1";
const MATERIAL_CACHE = "learnza-materials-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/share-card.png",
  "./materials/guide.css",
  "./data/materials.js"
];
const MATERIAL_PATHS = new Set([
  "materials/fractions.html",
  "materials/water-cycle.html",
  "materials/reading-clues.html",
  "materials/web-basics.html"
].map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("learnza-") && ![SHELL_CACHE, MATERIAL_CACHE].includes(key)).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", event => {
  const port = event.ports[0];
  if (!port) return;
  const url = new URL(event.data?.url || "", self.registration.scope);
  if (url.origin !== self.location.origin || !MATERIAL_PATHS.has(url.pathname)) {
    port.postMessage({ error: "That learning guide can't be saved for offline reading." });
    return;
  }

  event.waitUntil((async () => {
    try {
      const cache = await caches.open(MATERIAL_CACHE);
      if (event.data.type === "SAVE_MATERIAL") {
        await cache.add(url.href);
      } else if (event.data.type === "REMOVE_MATERIAL") {
        await cache.delete(url.href);
      } else {
        throw new Error("Unknown offline storage request.");
      }
      port.postMessage({ ok: true });
    } catch (error) {
      port.postMessage({ error: error.message || "The guide could not be saved." });
    }
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (MATERIAL_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(MATERIAL_CACHE);
      const saved = await cache.match(request);
      if (saved) return saved;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return new Response("This guide isn't available offline yet. Connect to the internet and save it for later.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
