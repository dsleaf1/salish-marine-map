/* Salish Marine Map — app-shell service worker (Unified_Map_Phone_Plan step 4).
 *
 * Caches ONLY the static app shell (HTML, Leaflet, physics.js, icons, manifest).
 * It deliberately does NOT touch cross-origin traffic — the R2 forecast data and
 * the ArcGIS/USGS basemap tiles pass straight through to the network. Offline
 * forecast storage lives in the page-managed "salishmap-data-v1" cache (see the
 * offline data store block in index.html); that cache is never versioned or
 * deleted here, so the user's saved packs survive every shell update.
 *
 * >>> BUMP CACHE_VERSION when index.html or any shell asset below changes. <<<
 * Keep it in step with the page's build string (2026-MM-DDx): changing the string
 * makes the new worker install a fresh shell cache and delete the stale
 * "salishmap-shell-*" caches on activate, so returning users pick up the release.
 *
 * Source of truth = cape_st_james/sw.js, deployed by cp to salish-marine-map/sw.js
 * (same recipe as index.html). The shell list carries BOTH document names so the
 * one file serves both trees: index.html (deployed) and unified_map.html (the
 * cape working copy under the local dev server).
 */
const CACHE_VERSION = "salishmap-shell-v10";   // 2026-07-22i: phone hides the redundant Wind arrows checkbox

const SHELL = [
  "./",
  "./index.html",
  "./unified_map.html",
  "./manifest.webmanifest",
  "./physics.js",
  "./force_explorer.html",
  "./vendor/leaflet.js",
  "./vendor/leaflet.css",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // Tolerant install: cache each asset individually and ignore misses, because the
  // two trees don't hold identical files (cape has unified_map.html but no
  // index.html route; deployed salish has index.html but no unified_map.html).
  // cache.addAll would fail the whole install on the first 404.
  // cache:"no-cache" forces revalidation past the browser's HTTP cache — without it a
  // shell bump can permanently capture a stale HTTP-cached copy into the new
  // versioned cache (seen live 2026-07-22 against python http.server's heuristic
  // freshness; GitHub Pages' max-age=600 has the same 10-minute window).
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(
        SHELL.map((u) => cache.add(new Request(u, { cache: "no-cache" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Delete only stale SHELL caches. "salishmap-data-*" (the user's saved offline
  // packs, managed by the page) must survive shell updates.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("salishmap-shell-") && k !== CACHE_VERSION)
            .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Cross-origin (R2 data, basemap tiles, anything else): leave alone. Any tile the
  // browser's own HTTP cache happens to hold may still appear offline — best-effort
  // only, never a promise (basemap is overlays-offline-only in v1 by design).
  if (url.origin !== self.location.origin) return;

  // Navigations: serve the cached app document so the installed PWA opens offline —
  // BUT only for the app's own routes (the directory root or the app document
  // itself). A navigation to any other same-origin file (force_explorer.html, the
  // physics PDF, reference docs) must resolve to THAT file, never get swapped for
  // the app shell (the documented hrdps-wind-map gotcha, commit 2899908).
  if (req.mode === "navigate") {
    const last = url.pathname.split("/").pop();
    const isAppDoc = last === "" || last === "index.html" || last === "unified_map.html";
    if (isAppDoc) {
      event.respondWith(
        caches.match(req, { ignoreSearch: true })
          .then((r) => r || caches.match("./index.html", { ignoreSearch: true }))
          .then((r) => r || caches.match("./unified_map.html", { ignoreSearch: true }))
          .then((r) => r || fetch(req))
      );
      return;
    }
    // Other navigations fall through to the cache-first handler below (shell files
    // like force_explorer.html open offline from the cache; everything else fetches).
  }

  // Same-origin GETs: cache-first (ignoreSearch so ?v= / ?lat= versioned URLs hit),
  // fall back to network on a miss.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
  );
});
