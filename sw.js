/**
 * Truck Route Planner - service worker.
 *
 * Caches the application shell so the UI opens instantly and still starts
 * without a connection. Routing and geocoding obviously need the network, but
 * the app, the datasets and a previously opened page remain usable offline.
 *
 * Bump CACHE_VERSION after changing any shell file.
 *
 * created by Gabor Gasko
 */
'use strict';

var CACHE_VERSION = 'trp-shell-v2.4.0';

/*
 * The 22 translation packs in js/i18n/ are deliberately NOT listed here.
 * Precaching 22 files a visitor will never open would slow every install down
 * for nothing; the same-origin handler below caches each pack the first time
 * it is actually loaded, so the language in use stays available offline. The
 * two base languages (Spanish and English) ship inside js/core/i18n.js.
 */
var SHELL = [
  './',
  'index.html',
  'desktop.html',
  'mobile.html',
  'USER_GUIDE.html',
  'PRIVACY.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/desktop.css',
  'css/mobile.css',
  'assets/icon.svg',
  'assets/icon-maskable.svg',
  'data/toll_rates.json',
  'data/safe_parkings.json',
  'data/trailer_regulations.json',
  'data/eu_driving_rules.json',
  'js/core/config.js',
  'js/core/icons.js',
  'js/core/i18n.js',
  'js/core/consent.js',
  'js/core/analytics.js',
  'js/core/ga.js',
  'js/core/util.js',
  'js/core/geo.js',
  'js/core/embedded-data.js',
  'js/core/data-store.js',
  'js/core/api.js',
  'js/core/time-model.js',
  'js/core/eu-rules.js',
  'js/core/tolls.js',
  'js/core/stops.js',
  'js/core/regulations.js',
  'js/core/planner.js',
  'js/core/map-export.js',
  'js/core/device.js',
  'js/ui/render.js',
  'js/ui/map-view.js',
  'js/ui/consent-ui.js',
  'js/ui/app-common.js',
  'js/ui/desktop-app.js',
  'js/ui/mobile-app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      /* addAll fails atomically, so add individually and tolerate misses. */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_VERSION ? null : caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  /* Never cache routing or geocoding responses - they must always be live. */
  if (/nominatim|project-osrm/.test(url.hostname)) return;

  /* Map tiles: network only, they have their own browser cache. */
  if (/tile\.openstreetmap\.org/.test(url.hostname)) return;

  /*
   * Same-origin app files: network first, cache as a fallback.
   *
   * Cache-first would be faster, but it also serves a stale UI for one extra
   * load after every edit, which is confusing during development and after a
   * deployment. Network-first keeps the app current and still works offline.
   */
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || new Response('Offline and not cached.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }

  /* CDN assets (Leaflet): cache on first successful load. */
  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request).then(function (response) {
        if (response && (response.ok || response.type === 'opaque')) {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
