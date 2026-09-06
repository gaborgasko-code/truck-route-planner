/**
 * Truck Route Planner - orchestration of a complete route plan.
 *
 * Pipeline: geocode -> road route -> time model -> country segments -> tolls
 *           -> rest stops -> safe parkings -> national regulations.
 *
 * All network work is asynchronous and reports progress, so the UI never
 * blocks. The planner is UI-agnostic and shared by the desktop and mobile
 * front ends.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var geo = TRP.geo;

  /* --------------------------------------------------- country resolution */

  /**
   * Offline pre-filter: if a point falls inside exactly one country bounding
   * box we can name the country without a network call. Every box in
   * toll_rates.json is a generous superset of the real border, so a unique
   * match is safe.
   */
  function makeBboxIndex(rates) {
    var list = [];
    Object.keys(rates).forEach(function (code) {
      var boxes = rates[code].bboxes || [];
      if (boxes.length) list.push({ code: code, boxes: boxes });
    });
    return list;
  }

  function uniqueBboxCountry(index, lat, lon) {
    var match = null;
    for (var i = 0; i < index.length; i++) {
      var entry = index[i];
      for (var b = 0; b < entry.boxes.length; b++) {
        if (geo.bboxContains(entry.boxes[b], lat, lon)) {
          if (match && match !== entry.code) return null; /* ambiguous */
          match = entry.code;
          break;
        }
      }
    }
    return match;
  }

  function cacheKey(lat, lon) {
    var d = CONFIG.COUNTRY_CACHE_DECIMALS;
    return lat.toFixed(d) + ',' + lon.toFixed(d);
  }

  function loadCountryCache() {
    var cache = util.storageGet(CONFIG.COUNTRY_CACHE_KEY, {});
    return cache && typeof cache === 'object' ? cache : {};
  }

  function saveCountryCache(cache) {
    var keys = Object.keys(cache);
    if (keys.length > CONFIG.COUNTRY_CACHE_MAX) {
      var trimmed = {};
      keys.slice(keys.length - CONFIG.COUNTRY_CACHE_MAX).forEach(function (k) { trimmed[k] = cache[k]; });
      cache = trimmed;
    }
    util.storageSet(CONFIG.COUNTRY_CACHE_KEY, cache);
  }

  /* ------------------------------------------------------------- planning */

  function checkCancelled(token) {
    if (token && token.cancelled) {
      throw util.TrpError('CANCELLED', 'Calculation cancelled.');
    }
  }

  function resolveEndpoint(input, label) {
    var value = input || {};
    var text = String(value.text || '').trim();
    if (isFinite(Number(value.lat)) && isFinite(Number(value.lon)) && value.lat !== null && value.lat !== '') {
      return Promise.resolve({
        label: value.label || text,
        query: text,
        lat: Number(value.lat),
        lon: Number(value.lon),
        countryCode: (value.countryCode || '').toUpperCase()
      });
    }
    if (!text) {
      return Promise.reject(util.TrpError('EMPTY_QUERY', 'Please enter the ' + label + ' address.'));
    }
    return TRP.api.geocodeOne(text).then(function (hit) {
      return {
        label: hit.label,
        query: text,
        lat: hit.lat,
        lon: hit.lon,
        countryCode: hit.countryCode
      };
    });
  }

  /**
   * Plan a complete truck route.
   *
   * @param {{origin:Object, destination:Object, vehicle?:Object,
   *          departure?:string, tollDetail?:string}} request
   * @param {{onProgress?:function, token?:{cancelled:boolean}}} [hooks]
   * @returns {Promise<Object>} the full route plan
   */
  function planRoute(request, hooks) {
    var opts = hooks || {};
    var token = opts.token || { cancelled: false };
    var report = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    var vehicle = Object.assign({}, CONFIG.DEFAULT_VEHICLE, request.vehicle || {});
    var interval = CONFIG.TOLL_DETAIL_PRESETS[request.tollDetail || CONFIG.DEFAULT_TOLL_DETAIL] ||
      CONFIG.TOLL_SAMPLE_INTERVAL_KM;

    var state = { warnings: [] };

    report({ pct: 3, message: 'Loading toll, parking and regulation data...' });

    return TRP.dataStore.load().then(function (data) {
      state.data = data;
      if (data.source === 'embedded') {
        state.warnings.push('Datasets were read from the built-in offline copy (the JSON files could not be fetched).');
      }
      checkCancelled(token);

      report({ pct: 8, message: 'Locating the origin address...' });
      return resolveEndpoint(request.origin, 'origin');
    }).then(function (origin) {
      state.origin = origin;
      checkCancelled(token);
      report({ pct: 16, message: 'Locating the destination address...' });
      return resolveEndpoint(request.destination, 'destination');
    }).then(function (destination) {
      state.destination = destination;
      checkCancelled(token);
      report({ pct: 24, message: 'Requesting the road route from OSRM...' });
      return TRP.api.getRoute(state.origin, state.destination);
    }).then(function (route) {
      state.route = route;
      checkCancelled(token);

      report({ pct: 34, message: 'Applying EU driving and rest time rules...' });
      var itinerary = TRP.timeModel.buildItinerary(route.distanceKm, request.departure, {
        speedKmh: vehicle.speedKmh
      });
      state.time = itinerary.model;
      state.itinerary = itinerary.events;
      state.departure = itinerary.departure.toISOString();
      state.arrival = itinerary.arrival.toISOString();
      state.warnings = state.warnings.concat(
        TRP.timeModel.weekendWarnings(itinerary.departure, itinerary.arrival)
      );

      /* ---- country segments for the toll estimate ---- */
      var rates = TRP.tolls.normaliseRates(state.data.tollRates);
      var index = makeBboxIndex(rates);
      var cache = loadCountryCache();
      var networkCalls = 0;
      var failures = 0;

      function resolve(lat, lon, i, total) {
        checkCancelled(token);
        var pct = 36 + Math.round((i / Math.max(1, total)) * 40);
        report({
          pct: pct,
          message: 'Analysing country segments ' + (i + 1) + ' / ' + total + '...'
        });

        var key = cacheKey(lat, lon);
        if (cache[key]) return Promise.resolve(cache[key]);

        var offline = uniqueBboxCountry(index, lat, lon);
        if (offline) {
          cache[key] = offline;
          return Promise.resolve(offline);
        }

        networkCalls++;
        return TRP.api.reverseCountry(lat, lon).then(function (code) {
          if (code) {
            cache[key] = code;
            return code;
          }
          failures++;
          return CONFIG.UNKNOWN_COUNTRY;
        });
      }

      return TRP.tolls.buildSegments(route.coords, interval, resolve).then(function (result) {
        saveCountryCache(cache);
        state.countrySamples = result.samples;
        state.countrySegments = result.segments;
        state.countryLookups = { network: networkCalls, failures: failures, intervalKm: interval };

        /* Fall back to the endpoint countries when detection failed badly. */
        var classified = result.segments.filter(function (s) { return s.country !== CONFIG.UNKNOWN_COUNTRY; });
        if (!classified.length && route.distanceKm > 0) {
          var fallbackCode = state.origin.countryCode || state.destination.countryCode;
          if (fallbackCode) {
            state.countrySegments = [{ country: fallbackCode, km: route.distanceKm, fromKm: 0, toKm: route.distanceKm }];
            state.warnings.push('Country detection was unavailable; the whole route was attributed to ' +
              fallbackCode + '. The toll figure is a rough approximation.');
          } else {
            state.warnings.push('Country detection was unavailable, so no toll estimate could be produced.');
          }
        } else if (failures > 0) {
          state.warnings.push(failures + ' of ' + result.samples.length +
            ' sample points could not be attributed to a country; their distance is excluded from the toll estimate.');
        }
        return state;
      });
    }).then(function () {
      checkCancelled(token);
      report({ pct: 80, message: 'Estimating tolls and fuel...' });

      var vehicleFactor = TRP.tolls.vehicleTollFactor(vehicle);
      state.tolls = TRP.tolls.estimateTolls(state.countrySegments, state.data.tollRates, {
        vehicleFactor: vehicleFactor
      });
      state.fuel = TRP.tolls.estimateFuel(state.route.distanceKm, vehicle);
      state.costs = {
        toll: state.tolls.totalCost,
        fuel: state.fuel.cost,
        total: util.round(state.tolls.totalCost + state.fuel.cost, 2),
        perKm: state.route.distanceKm > 0
          ? util.round((state.tolls.totalCost + state.fuel.cost) / state.route.distanceKm, 3)
          : 0
      };
      if (state.tolls.unknownCountries.length) {
        state.warnings.push('No toll rate on file for: ' + state.tolls.unknownCountries.join(', ') +
          '. Those kilometres are costed at zero.');
      }

      report({ pct: 88, message: 'Suggesting rest stops and safe parkings...' });
      var stops = TRP.stops.suggestStops(state.route.coords, CONFIG.REST_STOP_INTERVAL_KM);
      state.stops = TRP.stops.attachParkings(stops, state.data.parkings,
        CONFIG.PARKING_SEARCH_RADIUS_KM, CONFIG.PARKING_RESULTS_PER_STOP);
      state.parkings = TRP.stops.collectParkings(state.stops);
      var withoutParking = state.stops.filter(function (s) { return !s.parkings.length; }).length;
      if (withoutParking > 0) {
        state.warnings.push(withoutParking + ' suggested stop(s) have no known safe parking within ' +
          CONFIG.PARKING_SEARCH_RADIUS_KM + ' km in the sample dataset.');
      }

      report({ pct: 94, message: 'Collecting national regulations...' });
      var codes = state.countrySegments
        .map(function (s) { return s.country; })
        .filter(function (c) { return c && c !== CONFIG.UNKNOWN_COUNTRY; });
      if (!codes.length) {
        codes = [state.origin.countryCode, state.destination.countryCode].filter(Boolean);
      }
      state.countries = codes.filter(function (c, i) { return codes.indexOf(c) === i; });
      state.regulations = TRP.regulations.forCountries(state.countries, state.data.regulations,
        CONFIG.REGULATIONS_PER_COUNTRY);
      state.baselineRegulations = TRP.regulations.baseline(state.data.regulations, 5);

      state.request = {
        origin: state.origin.query,
        destination: state.destination.query,
        vehicle: vehicle,
        departure: state.departure,
        tollDetail: request.tollDetail || CONFIG.DEFAULT_TOLL_DETAIL
      };
      state.vehicle = vehicle;
      state.createdAt = new Date().toISOString();
      state.appVersion = CONFIG.APP_VERSION;
      state.author = CONFIG.AUTHOR;

      report({ pct: 100, message: 'Route plan complete.' });
      return state;
    });
  }

  TRP.planner = {
    planRoute: planRoute,
    uniqueBboxCountry: uniqueBboxCountry,
    makeBboxIndex: makeBboxIndex
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.planner;
})(typeof globalThis !== 'undefined' ? globalThis : this);
