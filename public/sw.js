/**
 * Service Worker — caches all app assets for offline use.
 *
 * Strategy: Cache-first for versioned assets (hashed filenames),
 * network-first for the HTML shell and unversioned assets.
 */

const CACHE_NAME = "opendci-v1";

// Assets to precache on install (relative to base URL).
// Vite hashes JS/CSS filenames, so we only precache unversioned static files.
const PRECACHE_URLS = [
  "./",
  "./wasm_exec.js",
  "./opendci.wasm",
  "./docsis-config.jtd.json",
  "./mibs.json",
  "./mibs.snapshot",
  "./vendor-schemas.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // Non-fatal: some assets may not exist (e.g., mibs.snapshot)
        console.warn("SW precache partial failure:", err);
      })
    )
  );
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // For navigation requests (HTML), use network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For hashed assets (contain a hash pattern like .abc123.), use cache-first
  // For other assets, use stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // For non-hashed assets, revalidate in background
        const isHashed = /\.[a-f0-9]{8,}\./.test(url.pathname);
        if (!isHashed) {
          fetch(event.request)
            .then((response) => {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
            })
            .catch(() => {});
        }
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
