// Caladay service worker — hand-rolled app-shell caching for the static
// export. Registered only on the production web build (see
// components/ServiceWorkerRegistrar.tsx); never in the Capacitor app.
//
// Offline model: after one full online visit, the app shell, its hashed
// build assets, and the solutions CSV are all cached, so a cold offline
// launch works. Bump VERSION to invalidate the precache.
const VERSION = "v1";
const PRECACHE = `caladay-precache-${VERSION}`;
const RUNTIME = "caladay-runtime";

// trailingSlash: true — exported routes are directories, keep keys canonical.
const PAGES = ["/", "/leaderboard/", "/privacy/", "/support/"];
const CORE = [
  ...PAGES,
  "/solutions-cache.csv",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Precache the app shell, then parse the cached pages for their hashed
// /_next/static assets (JS chunks, CSS, font preloads) and cache those too.
// This makes every route — including ones never visited — work offline
// after a single visit, without coupling the SW to the build pipeline.
async function precacheShell() {
  const cache = await caches.open(PRECACHE);
  await cache.addAll(CORE);
  const assets = new Set();
  for (const page of PAGES) {
    const res = await cache.match(page);
    if (!res) continue;
    const html = await res.clone().text();
    for (const match of html.matchAll(/\/_next\/static\/[^"'\s)]+/g)) {
      assets.add(match[0]);
    }
  }
  const runtime = await caches.open(RUNTIME);
  await Promise.all(
    [...assets].map(async (url) => {
      if (await runtime.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await runtime.put(url, res);
      } catch {
        // Missed asset: the cache-first fetch handler will retry online.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== PRECACHE && key !== RUNTIME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch cross-origin (Supabase, analytics) or non-GET requests.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((cache) => cache.put(event.request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Difficulty data: stale-while-revalidate so it stays fresh but never blocks.
  if (url.pathname === "/solutions-cache.csv") {
    event.respondWith(
      caches.open(PRECACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const refresh = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      })
    );
    return;
  }

  // Page navigations: network-first, falling back to the cached page, then
  // the cached shell. Normalize for trailingSlash ("/leaderboard" and
  // "/leaderboard/" must hit the same key).
  if (event.request.mode === "navigate") {
    const key = url.pathname.endsWith("/") ? url.pathname : url.pathname + "/";
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PRECACHE).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(async () => {
          const exact = await caches.match(key);
          return exact || (await caches.match(url.pathname)) || caches.match("/");
        })
    );
    return;
  }

  // Everything else same-origin (icons, splash, fonts outside _next):
  // network with cache fallback, caching successful responses on the way.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(event.request)) || Response.error())
  );
});
