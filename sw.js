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
const CACHE_VERSION = "salishmap-shell-v23";   // 2026-08-09a: UI-ONLY polish pass, four items, all four DAVID'S CALLS (2026-08-09). (1) Hover dwell HOVER_DELAY_MS = 300 before the readout opens — he judged 300 ms right. (2) Once the readout is OPEN it is THROTTLED, OPEN_SETTLE_MS = 100, leading edge + trailing timer (he chose throttle over debounce): it was following the cursor on requestAnimationFrame at ~60/s, now at most 10/s and never more than 100 ms stale. (3) The Key legend's explanatory prose is COLLAPSED behind a click-to-open disclosure (legendMore()); anything that DECODES a mark — colour bar, arrow swatches, Quartering's Beaufort strip — deliberately stays outside the collapse, and both hidden safety caveats were verified to survive in the tap readout first. Wave Height legend 218 -> 60 px, map top 478 -> 320; phone Key panel 406 px (scrolling) -> 140. (4) The Wave Height legend is now a TRUE 0-3 m axis (his option B: ticks evenly spaced, colours bunched left) and the WH_COL ramp is his OPTION A — the old ramp ended near-black and shed chroma to keep darkening, landing 2.0/2.5/3.0 m as three near-neutral greys; A pays for the top in HUE instead (indigo -> lilac -> magenta), 2v3 m deltaE 6.5 -> 17.9, at the knowing cost of the low end 0.6v1.0 m 10.3 -> 7.5 where 93.7% of the water sits. WH_EDGES UNCHANGED. UI ONLY: physics.js UNCHANGED at sha1 db0083056cb1
// v22 was 2026-08-08c: About-blurb TRIM only (David, 2026-08-08) — the v21 changelog entry was cut roughly in half (677 chars): the cyan-swatch fix note, the refit sample counts and the per-band condemned-window figure came out; every user-facing caveat stayed (no ring is not calm / wind sea only, no ocean swell / direction only and uncalibrated / heuristic, not a wave forecast). NOTHING else changed — no code, no physics.js (still db0083056cb1), no display behaviour. This bump exists ONLY because index.html changed and phone/Safari users would otherwise keep the v21 shell
// v21 was 2026-08-08b: THE WAVE LAYER GOES PUBLIC AGAIN (David's "option 2", 2026-08-08). STEEP_ON flips from the ?dev=1 gate to true, so the "Waves" Layer option is enabled for everyone and the 2026-08-04 withdrawal wording (disabled option label, phone label, per-mode note) is DELETED. All THREE displays ship: Wave Steepness keeps ALL THREE ring levels (grey Medium / orange High / magenta Very high) with NO wind memory; Wave Height SHIPS (new — continuous metres, Hamp = Hs x hf via one extra fast-path hazSpec per cell in decodeSteep, stretched 13-stop WAVEH ramp, uSmooth shader uniform that is 0 for every other layer); Quartering (beta) SHIPS, labelled uncalibrated. Also fixed: the Wave Height Key drew its "current set" arrow swatch in the RINGS display's cyan (#00b4d8/#023047), but Wave Height arrows come from drawArrows() in near-black rgba(20,20,30,.92) — the swatch is now a dark arrow matching the ink. UI ONLY: physics.js UNCHANGED at sha1 db0083056cb1 (the option-D refit shipped in v20); physics_regression 12/12, quarter_tests 9 EXPECTED failures
// v20 was 2026-08-08a: OPTION D — physics.js REFITTED (David's call). windSea()'s open-ocean saturation coefficient 0.24 is replaced by a law refitted against SalishSeaCast WaveWatch III (604 days, 3 Strait of Georgia stations, 260,928 samples), with two constants PINNED to Gemmrich & Pawlowicz (2020)'s published buoy values (mh 0.50 SPM, Ah 0.09) rather than fitted. The old law read Hs 1.48x high in the median; the new one is 0.949 and flat to 0.96-1.06 across every wind bin 5-60 kt, with no blanket multiplier. relaxSea() (wind memory) ships DORMANT — no caller passes history, so it returns the equilibrium sea unchanged and force_explorer.html is numerically untouched. Falsely-condemned good 2-hour windows drop 41.7% -> 22.1% (all winds) and 21.8% -> 2.7% at High. index.html UNCHANGED; this bump exists because physics.js is precached below. modelHash was 3e07c2026658 and no longer holds
// v19 was 2026-08-07b: force_explorer.html DEBANDED — it was the only public page still painting the withdrawn five-level absolute scale. Steepness now follows the maps' reporting pass (bands 0–1 unnamed, Medium grey, only High/Very high are warnings); the quartering pills drop the band word and colour entirely for "<n>% of worst · Q x.xx" plus an explicit uncalibrated label (option (e+)). Also debanded: the danger rose's steepness cutline rings and the session recorder's table/CSV/PDF exports. index.html and physics.js UNCHANGED — this bump exists only because force_explorer.html is precached below
// v18 was 2026-08-07a: base legibility under the wind fill (one base map — USGS topo — with #baseInk on the tile <img> and the contrast lift on the layer container; base selector removed), collapsible About, desktop ➤ arrows toggle, and the Roughness-layer reporting pass (Sea State / Wave Steepness / Quartering (beta), no Low ring, grey Medium, no Shaded cells, black wind arrows); physics.js untouched
// v17 was 2026-08-04a: Roughness layer WITHDRAWN from the public UI (disabled Layer option + note) pending WaveWatch III band revalidation; physics.js untouched

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
