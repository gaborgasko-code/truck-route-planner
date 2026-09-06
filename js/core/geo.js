/**
 * Truck Route Planner - geometry helpers for polylines and coordinates.
 *
 * Coordinates are handled as `{ lat, lon }` objects. Helpers also accept
 * `[lat, lon]` arrays for convenience.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function' && !TRP.util) require('./util.js');

  var EARTH_RADIUS_KM = 6371.0088;

  function toRad(deg) { return (deg * Math.PI) / 180; }

  /** Normalise `{lat,lon}`, `{lat,lng}` or `[lat,lon]` to `{lat,lon}`. */
  function point(p) {
    if (p == null) return null;
    if (Array.isArray(p)) return { lat: Number(p[0]), lon: Number(p[1]) };
    if (typeof p.lon === 'number' || typeof p.lon === 'string') {
      return { lat: Number(p.lat), lon: Number(p.lon) };
    }
    if (typeof p.lng !== 'undefined') return { lat: Number(p.lat), lon: Number(p.lng) };
    return null;
  }

  /** Great-circle distance in kilometres between two points. */
  function haversineKm(a, b) {
    var p1 = point(a);
    var p2 = point(b);
    if (!p1 || !p2) return NaN;
    var dLat = toRad(p2.lat - p1.lat);
    var dLon = toRad(p2.lon - p1.lon);
    var lat1 = toRad(p1.lat);
    var lat2 = toRad(p2.lat);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /**
   * Cumulative along-track distance for a polyline.
   * @returns {number[]} array of the same length as `coords`, starting at 0.
   */
  function cumulativeDistances(coords) {
    var cum = [];
    if (!Array.isArray(coords) || coords.length === 0) return cum;
    cum.push(0);
    for (var i = 1; i < coords.length; i++) {
      var step = haversineKm(coords[i - 1], coords[i]);
      cum.push(cum[i - 1] + (isFinite(step) ? step : 0));
    }
    return cum;
  }

  /** Total length of a polyline in kilometres. */
  function polylineLengthKm(coords) {
    var cum = cumulativeDistances(coords);
    return cum.length ? cum[cum.length - 1] : 0;
  }

  /** Linear interpolation between two points. */
  function interpolate(a, b, fraction) {
    var p1 = point(a);
    var p2 = point(b);
    return {
      lat: p1.lat + (p2.lat - p1.lat) * fraction,
      lon: p1.lon + (p2.lon - p1.lon) * fraction
    };
  }

  /**
   * Point located `targetKm` along the polyline.
   * @returns {{lat:number, lon:number, km:number, index:number}|null}
   */
  function pointAtDistance(coords, targetKm, cum) {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    var distances = cum || cumulativeDistances(coords);
    var total = distances[distances.length - 1];
    if (targetKm <= 0) {
      var first = point(coords[0]);
      return { lat: first.lat, lon: first.lon, km: 0, index: 0 };
    }
    if (targetKm >= total) {
      var last = point(coords[coords.length - 1]);
      return { lat: last.lat, lon: last.lon, km: total, index: coords.length - 1 };
    }
    for (var i = 1; i < distances.length; i++) {
      if (distances[i] >= targetKm) {
        var segment = distances[i] - distances[i - 1];
        var fraction = segment > 0 ? (targetKm - distances[i - 1]) / segment : 0;
        var p = interpolate(coords[i - 1], coords[i], fraction);
        return { lat: p.lat, lon: p.lon, km: targetKm, index: i };
      }
    }
    var end = point(coords[coords.length - 1]);
    return { lat: end.lat, lon: end.lon, km: total, index: coords.length - 1 };
  }

  /**
   * Evenly spaced sample points along a route, always including start and end.
   * @param {Array} coords polyline
   * @param {number} intervalKm spacing in kilometres
   * @returns {Array<{lat:number,lon:number,km:number}>}
   */
  function sampleAlongRoute(coords, intervalKm) {
    if (!Array.isArray(coords) || coords.length === 0) return [];
    if (!(intervalKm > 0)) throw new Error('sampleAlongRoute: intervalKm must be > 0');
    var cum = cumulativeDistances(coords);
    var total = cum[cum.length - 1];
    var samples = [];
    var km = 0;
    while (km < total) {
      var p = pointAtDistance(coords, km, cum);
      samples.push({ lat: p.lat, lon: p.lon, km: p.km });
      km += intervalKm;
    }
    var last = point(coords[coords.length - 1]);
    samples.push({ lat: last.lat, lon: last.lon, km: total });
    return samples;
  }

  /**
   * Reduce a polyline to at most `maxPoints` vertices, keeping the endpoints.
   * Used to keep exported maps small.
   */
  function simplify(coords, maxPoints) {
    if (!Array.isArray(coords) || coords.length <= maxPoints) return coords || [];
    var step = Math.ceil(coords.length / maxPoints);
    var out = [];
    for (var i = 0; i < coords.length; i += step) out.push(coords[i]);
    var last = coords[coords.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  /** Bounding box `[minLon, minLat, maxLon, maxLat]` containment test. */
  function bboxContains(bbox, lat, lon) {
    if (!Array.isArray(bbox) || bbox.length < 4) return false;
    return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
  }

  /** Leaflet-style bounds `[[south, west], [north, east]]` for a polyline. */
  function boundsOf(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (var i = 0; i < coords.length; i++) {
      var p = point(coords[i]);
      if (!p || !isFinite(p.lat) || !isFinite(p.lon)) continue;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    if (!isFinite(minLat)) return null;
    return [[minLat, minLon], [maxLat, maxLon]];
  }

  TRP.geo = {
    EARTH_RADIUS_KM: EARTH_RADIUS_KM,
    point: point,
    haversineKm: haversineKm,
    cumulativeDistances: cumulativeDistances,
    polylineLengthKm: polylineLengthKm,
    interpolate: interpolate,
    pointAtDistance: pointAtDistance,
    sampleAlongRoute: sampleAlongRoute,
    simplify: simplify,
    bboxContains: bboxContains,
    boundsOf: boundsOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.geo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
