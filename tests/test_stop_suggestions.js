/**
 * Tests for rest stop intervals and safe parking proximity.
 * All geometry is synthetic - no network access.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var stops = TRP.stops;
  var geo = TRP.geo;
  var CONFIG = TRP.CONFIG;
  var assert = T.assert;

  /**
   * A straight north-bound polyline starting at (lat0, lon) with points
   * roughly 1 km apart, so along-track distance is easy to reason about.
   * 1 degree of latitude is about 111.195 km on the configured sphere.
   */
  var KM_PER_DEG = (Math.PI * geo.EARTH_RADIUS_KM) / 180;

  function straightLine(lengthKm, lon, lat0) {
    var points = [];
    var steps = Math.max(2, Math.round(lengthKm));
    for (var i = 0; i <= steps; i++) {
      points.push({ lat: (lat0 || 45) + (lengthKm * (i / steps)) / KM_PER_DEG, lon: lon == null ? 10 : lon });
    }
    return points;
  }

  var PARKINGS = [
    { id: 'P1', name: 'Alpha secure park', country: 'DE', lat: 45.0, lon: 10.0, secured: true, security_level: 4, spaces: 100, facilities: ['fenced'] },
    { id: 'P2', name: 'Beta layby', country: 'DE', lat: 45.2, lon: 10.0, secured: false, security_level: 1, spaces: 30, facilities: [] },
    { id: 'P3', name: 'Gamma far park', country: 'AT', lat: 48.0, lon: 10.0, secured: true, security_level: 3, spaces: 60, facilities: ['cctv'] }
  ];

  T.describe('stop suggestions', function () {

    /* ---------------------------------------------------------- intervals */

    T.test('a 1000 km route gets stops at 350 km and 700 km', function () {
      var route = straightLine(1000);
      var result = stops.suggestStops(route, 350);
      assert.lengthOf(result, 2);
      assert.closeTo(result[0].km, 350, 2);
      assert.closeTo(result[1].km, 700, 2);
      assert.equal(result[0].index, 1);
      assert.equal(result[1].index, 2);
    });

    T.test('the default interval comes from the configuration', function () {
      var route = straightLine(800);
      assert.deepEqual(
        stops.suggestStops(route).map(function (s) { return s.index; }),
        stops.suggestStops(route, CONFIG.REST_STOP_INTERVAL_KM).map(function (s) { return s.index; })
      );
    });

    T.test('suggested stops lie on the route geometry', function () {
      var route = straightLine(900, 10, 45);
      stops.suggestStops(route, 350).forEach(function (stop) {
        assert.closeTo(stop.lon, 10, 1e-6, 'stop drifted off the line');
        assert.ok(stop.lat > 45 && stop.lat < 45 + 900 / KM_PER_DEG, 'stop outside the route extent');
      });
    });

    T.test('a smaller interval produces proportionally more stops', function () {
      var route = straightLine(1000);
      assert.lengthOf(stops.suggestStops(route, 200), 4);   /* 200, 400, 600, 800 */
      assert.lengthOf(stops.suggestStops(route, 500), 1);   /* 500 only */
    });

    /* --------------------------------------------------------- edge cases */

    T.test('edge case: an empty route yields no stops', function () {
      assert.lengthOf(stops.suggestStops([], 350), 0);
      assert.lengthOf(stops.suggestStops(null, 350), 0);
      assert.lengthOf(stops.suggestStops([{ lat: 45, lon: 10 }], 350), 0);
    });

    T.test('edge case: a route shorter than the interval yields no stops', function () {
      assert.lengthOf(stops.suggestStops(straightLine(120), 350), 0);
    });

    T.test('edge case: a stop that would land on the destination is dropped', function () {
      /* 700 km with a 350 km interval: the 700 km marker is the destination. */
      var result = stops.suggestStops(straightLine(700), 350);
      assert.lengthOf(result, 1);
      assert.closeTo(result[0].km, 350, 2);
    });

    T.test('edge case: a non-positive interval throws', function () {
      assert.throws(function () { stops.suggestStops(straightLine(500), 0); });
      assert.throws(function () { stops.suggestStops(straightLine(500), -10); });
    });

    /* ----------------------------------------------------------- parkings */

    T.test('parkings within the radius are returned nearest first', function () {
      var found = stops.findNearbyParkings({ lat: 45.05, lon: 10.0 }, PARKINGS, 50, 5);
      assert.lengthOf(found, 2);
      assert.equal(found[0].id, 'P1');
      assert.equal(found[1].id, 'P2');
      assert.ok(found[0].distanceKm <= found[1].distanceKm);
    });

    T.test('the result limit is respected', function () {
      var found = stops.findNearbyParkings({ lat: 45.05, lon: 10.0 }, PARKINGS, 50, 1);
      assert.lengthOf(found, 1);
      assert.equal(found[0].id, 'P1');
    });

    T.test('a parking list wrapped in a document is accepted', function () {
      var found = stops.findNearbyParkings({ lat: 45.0, lon: 10.0 }, { parkings: PARKINGS }, 50, 5);
      assert.ok(found.length >= 1);
    });

    T.test('edge case: no parking within the radius returns an empty list', function () {
      assert.lengthOf(stops.findNearbyParkings({ lat: 46.5, lon: 10.0 }, PARKINGS, 50, 3), 0);
      assert.lengthOf(stops.findNearbyParkings({ lat: 45.0, lon: 10.0 }, [], 50, 3), 0);
      assert.lengthOf(stops.findNearbyParkings(null, PARKINGS, 50, 3), 0);
    });

    T.test('edge case: parkings with broken coordinates are skipped', function () {
      var broken = PARKINGS.concat([{ id: 'BAD', name: 'No coords', lat: null, lon: undefined }]);
      var found = stops.findNearbyParkings({ lat: 45.0, lon: 10.0 }, broken, 50, 9);
      found.forEach(function (p) { assert.ok(p.id !== 'BAD'); });
    });

    T.test('attachParkings enriches stops without mutating the input', function () {
      var raw = stops.suggestStops(straightLine(1000), 350);
      var enriched = stops.attachParkings(raw, PARKINGS, 50, 3);
      assert.equal(raw[0].parkings, undefined, 'the input stop was mutated');
      assert.ok(Array.isArray(enriched[0].parkings));
      assert.equal(typeof enriched[0].hasSecured, 'boolean');
    });

    T.test('collectParkings de-duplicates across stops', function () {
      var enriched = [
        { parkings: [PARKINGS[0], PARKINGS[1]] },
        { parkings: [PARKINGS[1], PARKINGS[2]] }
      ];
      assert.lengthOf(stops.collectParkings(enriched), 3);
      assert.lengthOf(stops.collectParkings([]), 0);
    });

    /* ------------------------------------------------------------ geometry */

    T.test('haversine distance matches a known city pair', function () {
      /* Berlin to Munich, great-circle distance is about 504 km. */
      var d = geo.haversineKm({ lat: 52.52, lon: 13.405 }, { lat: 48.137, lon: 11.575 });
      assert.closeTo(d, 504, 6);
    });

    T.test('route sampling always includes the start and the end', function () {
      var route = straightLine(500);
      var samples = geo.sampleAlongRoute(route, 100);
      assert.closeTo(samples[0].km, 0, 1e-6);
      assert.closeTo(samples[samples.length - 1].km, geo.polylineLengthKm(route), 1e-6);
      assert.ok(samples.length >= 6);
    });

    T.test('the shipped parking dataset is usable', function () {
      var list = TRP.EMBEDDED_DATA.parkings.parkings;
      assert.ok(list.length >= 12, 'only ' + list.length + ' parkings on file');
      list.forEach(function (p) {
        assert.ok(isFinite(p.lat) && isFinite(p.lon), p.name + ' has invalid coordinates');
        assert.ok(typeof p.secured === 'boolean', p.name + ' is missing the secured flag');
      });
      assert.ok(list.some(function (p) { return p.secured; }), 'no secured parking in the dataset');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
