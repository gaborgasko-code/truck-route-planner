/**
 * Truck Route Planner - rest stop suggestions and safe parking proximity.
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

  /**
   * Suggest rest stops roughly every `intervalKm` along the route.
   * Stops within `STOP_END_MARGIN_KM` of the destination are dropped because
   * the driver has effectively arrived.
   *
   * @param {Array} coords route polyline
   * @param {number} [intervalKm=350]
   * @returns {Array<{index:number, km:number, lat:number, lon:number}>}
   */
  function suggestStops(coords, intervalKm) {
    var interval = intervalKm == null ? CONFIG.REST_STOP_INTERVAL_KM : Number(intervalKm);
    if (!(interval > 0)) throw new Error('suggestStops: intervalKm must be > 0');
    if (!Array.isArray(coords) || coords.length < 2) return [];

    var cum = geo.cumulativeDistances(coords);
    var total = cum[cum.length - 1];
    if (!isFinite(total) || total <= 0) return [];

    var stops = [];
    var marker = interval;
    var guard = 0;
    while (marker < total && guard++ < 10000) {
      if (total - marker >= CONFIG.STOP_END_MARGIN_KM) {
        var p = geo.pointAtDistance(coords, marker, cum);
        stops.push({
          index: stops.length + 1,
          km: util.round(marker, 1),
          lat: util.round(p.lat, 6),
          lon: util.round(p.lon, 6)
        });
      }
      marker += interval;
    }
    return stops;
  }

  /**
   * Find safe parkings within `radiusKm` of a point, nearest first.
   *
   * @param {{lat:number, lon:number}} centre
   * @param {Array} parkings safe parking records
   * @param {number} [radiusKm=50]
   * @param {number} [limit=3]
   */
  function findNearbyParkings(centre, parkings, radiusKm, limit) {
    var radius = radiusKm == null ? CONFIG.PARKING_SEARCH_RADIUS_KM : Number(radiusKm);
    var max = limit == null ? CONFIG.PARKING_RESULTS_PER_STOP : Number(limit);
    var list = Array.isArray(parkings) ? parkings : (parkings && parkings.parkings) || [];
    if (!centre || !list.length) return [];

    var found = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p == null || !isFinite(Number(p.lat)) || !isFinite(Number(p.lon))) continue;
      var distance = geo.haversineKm(centre, { lat: Number(p.lat), lon: Number(p.lon) });
      if (!isFinite(distance) || distance > radius) continue;
      var copy = {};
      for (var key in p) if (Object.prototype.hasOwnProperty.call(p, key)) copy[key] = p[key];
      copy.distanceKm = util.round(distance, 1);
      found.push(copy);
    }

    found.sort(function (a, b) {
      /* Nearest first; on a tie prefer the more secure site. */
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return (b.security_level || 0) - (a.security_level || 0);
    });

    return max > 0 ? found.slice(0, max) : found;
  }

  /**
   * Attach nearby parkings to each suggested stop.
   * Returns a new array; the input stops are not mutated.
   */
  function attachParkings(stops, parkings, radiusKm, limit) {
    return (stops || []).map(function (stop) {
      var nearby = findNearbyParkings(stop, parkings, radiusKm, limit);
      var copy = {};
      for (var key in stop) if (Object.prototype.hasOwnProperty.call(stop, key)) copy[key] = stop[key];
      copy.parkings = nearby;
      copy.hasSecured = nearby.some(function (p) { return !!p.secured; });
      return copy;
    });
  }

  /** Every distinct parking referenced by a list of stops. */
  function collectParkings(stops) {
    var seen = {};
    var out = [];
    (stops || []).forEach(function (stop) {
      (stop.parkings || []).forEach(function (p) {
        var id = p.id || (p.lat + ',' + p.lon);
        if (seen[id]) return;
        seen[id] = true;
        out.push(p);
      });
    });
    return out;
  }

  TRP.stops = {
    suggestStops: suggestStops,
    findNearbyParkings: findNearbyParkings,
    attachParkings: attachParkings,
    collectParkings: collectParkings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.stops;
})(typeof globalThis !== 'undefined' ? globalThis : this);
