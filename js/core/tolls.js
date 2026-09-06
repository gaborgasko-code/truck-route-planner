/**
 * Truck Route Planner - per-country toll estimation.
 *
 * The route is sampled at a fixed interval, each sample is resolved to a
 * country, and the distance between consecutive samples is attributed to the
 * country of the earlier sample. Costs are `km * rate * vehicleFactor`.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.util) require('./util.js');
    if (!TRP.geo) require('./geo.js');
  }
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var geo = TRP.geo;

  /** Accept either a full `toll_rates.json` document or a plain `{DE: 0.35}` map. */
  function normaliseRates(source) {
    var raw = source && source.rates ? source.rates : (source || {});
    var out = {};
    Object.keys(raw).forEach(function (code) {
      var entry = raw[code];
      var key = String(code).toUpperCase();
      if (entry == null) return;
      if (typeof entry === 'number') {
        out[key] = { name: key, rate: entry, system: '', notes: '', distanceBased: entry > 0, bboxes: [] };
      } else {
        out[key] = {
          name: entry.name || key,
          rate: Number(entry.rate_eur_per_km != null ? entry.rate_eur_per_km : entry.rate) || 0,
          system: entry.system || '',
          notes: entry.notes || '',
          distanceBased: entry.distance_based !== false,
          bboxes: entry.bboxes || (entry.bbox ? [entry.bbox] : [])
        };
      }
    });
    return out;
  }

  /**
   * Indicative toll multiplier for a vehicle profile. The published base rates
   * assume a 40 t / 5-axle / EURO VI combination (factor 1.0).
   */
  function vehicleTollFactor(vehicle) {
    var v = vehicle || {};
    var weight = Number(v.weightT);
    var weightFactor = 1;
    if (isFinite(weight) && weight > 0) {
      for (var i = 0; i < CONFIG.WEIGHT_FACTORS.length; i++) {
        if (weight <= CONFIG.WEIGHT_FACTORS[i].maxT) {
          weightFactor = CONFIG.WEIGHT_FACTORS[i].factor;
          break;
        }
      }
    }
    var euroFactor = CONFIG.EURO_FACTORS[String(v.euroClass || 'VI').toUpperCase()] || 1;
    var axles = Math.round(Number(v.axles));
    var axleFactor = CONFIG.AXLE_FACTORS[axles] || (axles > 6 ? 1.1 : 1);
    /* 5 axles is the reference, so normalise the axle factor around it. */
    var factor = weightFactor * euroFactor * (axleFactor / CONFIG.AXLE_FACTORS[5]);
    return util.round(factor, 3);
  }

  /**
   * Turn country-tagged samples into ordered route segments.
   *
   * @param {Array<{lat:number,lon:number,km:number,country:string}>} samples
   * @returns {Array<{country:string, km:number, fromKm:number, toKm:number}>}
   */
  function aggregateSegments(samples) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    var segments = [];
    for (var i = 0; i < samples.length - 1; i++) {
      var country = (samples[i].country || CONFIG.UNKNOWN_COUNTRY).toUpperCase();
      var span = Number(samples[i + 1].km) - Number(samples[i].km);
      if (!isFinite(span) || span <= 0) continue;
      var last = segments[segments.length - 1];
      if (last && last.country === country) {
        last.km += span;
        last.toKm = Number(samples[i + 1].km);
      } else {
        segments.push({
          country: country,
          km: span,
          fromKm: Number(samples[i].km),
          toKm: Number(samples[i + 1].km)
        });
      }
    }
    return segments;
  }

  /**
   * Build country segments directly from a polyline and a resolver function.
   *
   * @param {Array} coords route polyline
   * @param {number} intervalKm sampling interval
   * @param {function(number, number, number, number): Promise<string>} resolve
   *        called as `resolve(lat, lon, index, total)`
   * @returns {Promise<{segments:Array, samples:Array}>}
   */
  function buildSegments(coords, intervalKm, resolve) {
    var samples = geo.sampleAlongRoute(coords, intervalKm);
    var index = 0;

    function next() {
      if (index >= samples.length) {
        return Promise.resolve({ segments: aggregateSegments(samples), samples: samples });
      }
      var s = samples[index];
      var i = index++;
      return Promise.resolve(resolve(s.lat, s.lon, i, samples.length)).then(function (code) {
        samples[i].country = (code || CONFIG.UNKNOWN_COUNTRY).toUpperCase();
        return next();
      });
    }

    if (samples.length === 0) {
      return Promise.resolve({ segments: [], samples: [] });
    }
    return next();
  }

  /**
   * Estimate the toll cost for a set of country segments.
   *
   * @param {Array<{country:string, km:number}>} segments
   * @param {Object} rateSource toll_rates.json document or `{DE: 0.35}` map
   * @param {{vehicle?:Object, vehicleFactor?:number}} [options]
   */
  function estimateTolls(segments, rateSource, options) {
    var opts = options || {};
    var rates = normaliseRates(rateSource);
    var factor = opts.vehicleFactor != null
      ? Number(opts.vehicleFactor)
      : (opts.vehicle ? vehicleTollFactor(opts.vehicle) : 1);
    if (!isFinite(factor) || factor <= 0) factor = 1;

    var byCountry = {};
    var order = [];
    var unknownCountries = [];
    var unclassifiedKm = 0;
    var totalKm = 0;
    var totalCostRaw = 0;

    (segments || []).forEach(function (seg) {
      var code = String(seg.country || CONFIG.UNKNOWN_COUNTRY).toUpperCase();
      var km = Number(seg.km);
      if (!isFinite(km) || km <= 0) return;
      totalKm += km;

      if (code === CONFIG.UNKNOWN_COUNTRY) {
        unclassifiedKm += km;
        return;
      }

      var rateEntry = rates[code];
      var known = !!rateEntry;
      if (!known && unknownCountries.indexOf(code) === -1) unknownCountries.push(code);

      var rate = known ? Number(rateEntry.rate) || 0 : 0;
      var effectiveRate = rate * factor;

      if (!byCountry[code]) {
        byCountry[code] = {
          country: code,
          name: known ? rateEntry.name : code,
          km: 0,
          rate: rate,
          effectiveRate: util.round(effectiveRate, 4),
          cost: 0,
          system: known ? rateEntry.system : 'Unknown - no rate on file',
          notes: known ? rateEntry.notes : 'No toll rate available for this country; excluded from the estimate.',
          distanceBased: known ? rateEntry.distanceBased : false,
          known: known
        };
        order.push(code);
      }
      byCountry[code].km += km;
      totalCostRaw += km * effectiveRate;
    });

    order.forEach(function (code) {
      var entry = byCountry[code];
      var costRaw = entry.km * entry.effectiveRate;
      entry.km = util.round(entry.km, 1);
      entry.cost = util.round(costRaw, 2);
    });

    var countries = order.map(function (code) { return byCountry[code]; });
    countries.sort(function (a, b) { return b.cost - a.cost || b.km - a.km; });

    return {
      currency: CONFIG.CURRENCY,
      vehicleFactor: util.round(factor, 3),
      totalCost: util.round(totalCostRaw, 2),
      totalKm: util.round(totalKm, 1),
      unclassifiedKm: util.round(unclassifiedKm, 1),
      unknownCountries: unknownCountries,
      byCountry: byCountry,
      countries: countries,
      routeOrder: order
    };
  }

  /** Estimate fuel usage and cost for a distance. */
  function estimateFuel(distanceKm, vehicle) {
    var v = vehicle || {};
    var l100 = Number(v.fuelL100);
    var price = Number(v.fuelPrice);
    if (!isFinite(l100) || l100 <= 0 || !isFinite(price) || price < 0) {
      return { liters: 0, cost: 0, applicable: false };
    }
    var liters = (Number(distanceKm) || 0) * l100 / 100;
    return {
      liters: util.round(liters, 1),
      cost: util.round(liters * price, 2),
      l100: l100,
      price: price,
      applicable: true
    };
  }

  TRP.tolls = {
    normaliseRates: normaliseRates,
    vehicleTollFactor: vehicleTollFactor,
    aggregateSegments: aggregateSegments,
    buildSegments: buildSegments,
    estimateTolls: estimateTolls,
    estimateFuel: estimateFuel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.tolls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
