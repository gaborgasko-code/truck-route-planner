/**
 * Truck Route Planner - dataset loader.
 *
 * Tries to fetch the JSON files in data/ first (so operators can edit them
 * without a rebuild), and falls back to the generated offline copy in
 * embedded-data.js when fetch is unavailable or blocked - which is what
 * happens when the app is opened directly from the file system.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});

  var FILES = {
    tollRates: 'data/toll_rates.json',
    parkings: 'data/safe_parkings.json',
    regulations: 'data/trailer_regulations.json',
    euRules: 'data/eu_driving_rules.json'
  };

  var cache = null;
  var pending = null;

  function embedded() {
    return TRP.EMBEDDED_DATA || {
      tollRates: { rates: {} }, parkings: { parkings: [] },
      regulations: { regulations: {} }, euRules: { groups: [] }
    };
  }

  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
      return response.json();
    });
  }

  /**
   * Load all datasets.
   * @returns {Promise<{tollRates:Object, parkings:Array, regulations:Object, source:string}>}
   */
  function load() {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;

    var keys = Object.keys(FILES);
    pending = Promise.all(keys.map(function (key) {
      return fetchJson(FILES[key]).catch(function () { return null; });
    })).then(function (results) {
      var fallback = embedded();
      var loaded = {};
      var usedFallback = false;
      keys.forEach(function (key, i) {
        if (results[i]) {
          loaded[key] = results[i];
        } else {
          loaded[key] = fallback[key];
          usedFallback = true;
        }
      });

      cache = {
        tollRates: loaded.tollRates || { rates: {} },
        parkingsDoc: loaded.parkings || { parkings: [] },
        parkings: (loaded.parkings && loaded.parkings.parkings) || [],
        regulations: loaded.regulations || { regulations: {} },
        euRules: loaded.euRules || { groups: [] },
        source: usedFallback ? 'embedded' : 'files'
      };
      pending = null;
      return cache;
    });

    return pending;
  }

  /** Synchronous access after `load()` has resolved (null before that). */
  function get() {
    return cache;
  }

  /** Drop the cache so the next `load()` re-reads the JSON files. */
  function reset() {
    cache = null;
    pending = null;
  }

  TRP.dataStore = { load: load, get: get, reset: reset, FILES: FILES };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.dataStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
