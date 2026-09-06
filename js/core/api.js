/**
 * Truck Route Planner - network layer.
 *
 * Free services only, no API keys:
 *   - Nominatim (OpenStreetMap) for geocoding and reverse geocoding
 *   - OSRM demo server for road routing
 *
 * Nominatim's usage policy allows at most one request per second, so all
 * Nominatim calls go through a serialised, throttled queue.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;

  /** Translate, tolerating i18n not being loaded (e.g. in unit tests). */
  function t(key, params) {
    return TRP.i18n ? TRP.i18n.t(key, params) : key;
  }

  /** Language Nominatim should answer in. */
  function acceptLanguage() {
    return TRP.i18n ? TRP.i18n.locale() : 'es-ES';
  }

  /* ------------------------------------------------------------ HTTP core */

  function withTimeout(url, options, timeoutMs) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;

    var timer = null;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(util.TrpError('TIMEOUT', t('err.TIMEOUT_MSG', { s: Math.round(timeoutMs / 1000) })));
      }, timeoutMs);
    });

    return Promise.race([fetch(url, opts), timeout]).then(function (response) {
      clearTimeout(timer);
      return response;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  /**
   * GET a JSON document with a timeout and one automatic retry.
   */
  function getJson(url, options) {
    var opts = options || {};
    var timeoutMs = opts.timeoutMs || CONFIG.HTTP_TIMEOUT_MS;
    var retries = opts.retries == null ? CONFIG.HTTP_RETRIES : opts.retries;

    function attempt(remaining) {
      return withTimeout(url, { headers: { Accept: 'application/json' } }, timeoutMs)
        .then(function (response) {
          if (!response.ok) {
            throw util.TrpError('HTTP_' + response.status, t('err.HTTP_MSG', { code: response.status }));
          }
          return response.json();
        })
        .catch(function (err) {
          if (remaining > 0) {
            return util.sleep(CONFIG.HTTP_RETRY_DELAY_MS).then(function () {
              return attempt(remaining - 1);
            });
          }
          if (err && err.code) throw err;
          throw util.TrpError('NETWORK', t('err.NETWORK_MSG'), err);
        });
    }

    return attempt(retries);
  }

  /* -------------------------------------------------- Nominatim throttling */

  var queueTail = Promise.resolve();
  var lastCall = 0;

  /** Serialise and throttle a task to respect the Nominatim usage policy. */
  function throttled(task) {
    var run = queueTail.then(function () {
      var wait = Math.max(0, CONFIG.NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastCall));
      return util.sleep(wait).then(function () {
        lastCall = Date.now();
        return task();
      });
    });
    /* Keep the chain alive even when a task rejects. */
    queueTail = run.then(function () {}, function () {});
    return run;
  }

  /* ------------------------------------------------------------ Geocoding */

  /**
   * Geocode a free-text address.
   * @returns {Promise<Array<{label, lat, lon, countryCode, type}>>}
   */
  function geocode(query, limit) {
    var text = String(query || '').trim();
    if (!text) {
      return Promise.reject(util.TrpError('EMPTY_QUERY', t('err.EMPTY_QUERY')));
    }
    var url = CONFIG.NOMINATIM_BASE + '/search?format=jsonv2&addressdetails=1&limit=' +
      (limit || 5) + '&accept-language=' + encodeURIComponent(acceptLanguage()) +
      '&q=' + encodeURIComponent(text);

    return throttled(function () { return getJson(url); }).then(function (results) {
      if (!Array.isArray(results) || results.length === 0) {
        throw util.TrpError('NOT_FOUND', t('err.NOT_FOUND_MSG', { q: text }));
      }
      return results.map(function (r) {
        return {
          label: r.display_name,
          lat: Number(r.lat),
          lon: Number(r.lon),
          countryCode: (r.address && r.address.country_code ? r.address.country_code : '').toUpperCase(),
          type: r.type || r.category || ''
        };
      });
    });
  }

  /** Geocode and return only the best match. */
  function geocodeOne(query) {
    return geocode(query, 1).then(function (list) { return list[0]; });
  }

  /**
   * Reverse geocode a coordinate to an ISO-2 country code.
   * Resolves to `null` (never rejects) when the country cannot be determined.
   */
  function reverseCountry(lat, lon) {
    var url = CONFIG.NOMINATIM_BASE + '/reverse?format=jsonv2&zoom=5&addressdetails=1' +
      '&accept-language=' + encodeURIComponent(acceptLanguage()) + '&lat=' +
      encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);
    return throttled(function () { return getJson(url, { retries: 0 }); })
      .then(function (result) {
        var code = result && result.address && result.address.country_code;
        return code ? String(code).toUpperCase() : null;
      })
      .catch(function () { return null; });
  }

  /* -------------------------------------------------------------- Routing */

  /**
   * Road route between two coordinates using the OSRM driving profile.
   * OSRM expects `lon,lat` order.
   *
   * @returns {Promise<{distanceKm, durationH, durationS, coords, raw}>}
   */
  function getRoute(from, to) {
    var url = CONFIG.OSRM_BASE + '/route/v1/driving/' +
      from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat +
      '?overview=full&geometries=geojson&alternatives=false&steps=false';

    return getJson(url).then(function (data) {
      if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
        throw util.TrpError('NO_ROUTE', t('err.NO_ROUTE_MSG'));
      }
      var route = data.routes[0];
      var line = (route.geometry && route.geometry.coordinates) || [];
      var coords = line.map(function (c) { return { lat: c[1], lon: c[0] }; });
      if (coords.length < 2) {
        throw util.TrpError('NO_ROUTE', t('err.EMPTY_GEOMETRY'));
      }
      return {
        distanceKm: route.distance / 1000,
        durationS: route.duration,
        durationH: route.duration / 3600,
        coords: coords,
        raw: route
      };
    });
  }

  TRP.api = {
    getJson: getJson,
    throttled: throttled,
    geocode: geocode,
    geocodeOne: geocodeOne,
    reverseCountry: reverseCountry,
    getRoute: getRoute
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
