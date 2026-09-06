/**
 * Tests for toll aggregation and cost maths.
 * Route samples and country codes are mocked - no live API calls.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var tolls = TRP.tolls;
  var assert = T.assert;

  /* A deliberately small rate table so the arithmetic is easy to verify. */
  var RATES = {
    rates: {
      DE: { name: 'Germany', rate_eur_per_km: 0.35, system: 'Toll Collect', distance_based: true, bboxes: [[5.7, 47.2, 15.2, 55.2]] },
      AT: { name: 'Austria', rate_eur_per_km: 0.40, system: 'GO-Maut', distance_based: true, bboxes: [[9.4, 46.3, 17.2, 49.1]] },
      NL: { name: 'Netherlands', rate_eur_per_km: 0.00, system: 'Eurovignette', distance_based: false, bboxes: [[3.2, 50.7, 7.3, 53.7]] }
    }
  };

  /* Samples are `{km, country}`; the km gap goes to the earlier sample. */
  function samples(pairs) {
    return pairs.map(function (p) { return { lat: 50, lon: 8, km: p[0], country: p[1] }; });
  }

  T.describe('toll estimation', function () {

    /* ------------------------------------------------------- aggregation */

    T.test('samples become ordered country segments', function () {
      var segments = tolls.aggregateSegments(samples([[0, 'DE'], [100, 'DE'], [200, 'AT'], [300, 'AT']]));
      assert.lengthOf(segments, 2);
      assert.equal(segments[0].country, 'DE');
      assert.closeTo(segments[0].km, 200, 1e-9);
      assert.equal(segments[1].country, 'AT');
      assert.closeTo(segments[1].km, 100, 1e-9);
    });

    T.test('re-entering a country creates a separate segment', function () {
      var segments = tolls.aggregateSegments(samples([[0, 'DE'], [50, 'AT'], [100, 'DE'], [150, 'DE']]));
      assert.lengthOf(segments, 3);
      assert.deepEqual(segments.map(function (s) { return s.country; }), ['DE', 'AT', 'DE']);
    });

    T.test('country codes are normalised to upper case', function () {
      var segments = tolls.aggregateSegments(samples([[0, 'de'], [80, 'de']]));
      assert.equal(segments[0].country, 'DE');
    });

    /* --------------------------------------------------------- cost maths */

    T.test('cost is km x rate per country and the total is their sum', function () {
      var result = tolls.estimateTolls([
        { country: 'DE', km: 400 },
        { country: 'AT', km: 150 }
      ], RATES);
      assert.closeTo(result.byCountry.DE.cost, 140.00, 1e-9);  /* 400 * 0.35 */
      assert.closeTo(result.byCountry.AT.cost, 60.00, 1e-9);   /* 150 * 0.40 */
      assert.closeTo(result.totalCost, 200.00, 1e-9);
      assert.closeTo(result.totalKm, 550, 1e-9);
    });

    T.test('kilometres are rounded to 1 decimal and costs to 2', function () {
      var result = tolls.estimateTolls([{ country: 'DE', km: 123.456789 }], RATES);
      assert.equal(result.byCountry.DE.km, 123.5);
      assert.equal(result.byCountry.DE.cost, 43.21);  /* 123.456789 * 0.35 */
      assert.equal(result.totalCost, 43.21);
    });

    T.test('repeated segments for one country are merged in the breakdown', function () {
      var result = tolls.estimateTolls([
        { country: 'DE', km: 100 },
        { country: 'AT', km: 50 },
        { country: 'DE', km: 300 }
      ], RATES);
      assert.closeTo(result.byCountry.DE.km, 400, 1e-9);
      assert.closeTo(result.byCountry.DE.cost, 140, 1e-9);
      assert.lengthOf(result.countries, 2);
    });

    T.test('a zero-rate vignette country contributes kilometres but no cost', function () {
      var result = tolls.estimateTolls([{ country: 'NL', km: 250 }], RATES);
      assert.equal(result.byCountry.NL.cost, 0);
      assert.closeTo(result.byCountry.NL.km, 250, 1e-9);
      assert.equal(result.totalCost, 0);
      assert.equal(result.byCountry.NL.distanceBased, false);
    });

    T.test('a plain {code: rate} map is accepted as the rate source', function () {
      var result = tolls.estimateTolls([{ country: 'DE', km: 100 }], { DE: 0.5 });
      assert.equal(result.byCountry.DE.cost, 50);
    });

    /* --------------------------------------------------------- edge cases */

    T.test('edge case: an empty route yields a zero-cost result', function () {
      var result = tolls.estimateTolls([], RATES);
      assert.equal(result.totalCost, 0);
      assert.equal(result.totalKm, 0);
      assert.lengthOf(result.countries, 0);
      assert.lengthOf(result.unknownCountries, 0);
    });

    T.test('edge case: an unknown country is reported and costed at zero', function () {
      var result = tolls.estimateTolls([
        { country: 'DE', km: 100 },
        { country: 'ZZ', km: 200 }
      ], RATES);
      assert.deepEqual(result.unknownCountries, ['ZZ']);
      assert.equal(result.byCountry.ZZ.cost, 0);
      assert.equal(result.byCountry.ZZ.known, false);
      assert.closeTo(result.totalCost, 35, 1e-9);
      assert.closeTo(result.totalKm, 300, 1e-9);
    });

    T.test('edge case: unresolved samples land in unclassifiedKm', function () {
      var result = tolls.estimateTolls([
        { country: 'DE', km: 100 },
        { country: TRP.CONFIG.UNKNOWN_COUNTRY, km: 60 }
      ], RATES);
      assert.closeTo(result.unclassifiedKm, 60, 1e-9);
      assert.equal(result.byCountry[TRP.CONFIG.UNKNOWN_COUNTRY], undefined);
      assert.closeTo(result.totalCost, 35, 1e-9);
    });

    T.test('edge case: zero and negative segment lengths are ignored', function () {
      var result = tolls.estimateTolls([
        { country: 'DE', km: 0 },
        { country: 'AT', km: -50 },
        { country: 'DE', km: 10 }
      ], RATES);
      assert.closeTo(result.totalKm, 10, 1e-9);
      assert.lengthOf(result.countries, 1);
    });

    /* ---------------------------------------------------- vehicle factors */

    T.test('the reference 40 t / 5-axle / EURO VI vehicle has factor 1', function () {
      assert.closeTo(tolls.vehicleTollFactor({ weightT: 40, axles: 5, euroClass: 'VI' }), 1, 1e-9);
    });

    T.test('an older emission class increases the applied rate', function () {
      var factor = tolls.vehicleTollFactor({ weightT: 40, axles: 5, euroClass: 'III' });
      assert.closeTo(factor, 1.35, 1e-3);
      var result = tolls.estimateTolls([{ country: 'DE', km: 100 }], RATES, { vehicleFactor: factor });
      assert.closeTo(result.byCountry.DE.cost, 47.25, 1e-2);  /* 100 * 0.35 * 1.35 */
    });

    T.test('a light vehicle pays less than the reference combination', function () {
      var light = tolls.vehicleTollFactor({ weightT: 10, axles: 2, euroClass: 'VI' });
      assert.ok(light < 1, 'expected a factor below 1, got ' + light);
    });

    /* ----------------------------------------------------- fuel estimate */

    T.test('fuel litres and cost follow consumption and price', function () {
      var fuel = tolls.estimateFuel(1000, { fuelL100: 30, fuelPrice: 1.60 });
      assert.equal(fuel.liters, 300);
      assert.equal(fuel.cost, 480);
      assert.equal(fuel.applicable, true);
    });

    T.test('edge case: missing fuel figures give a non-applicable estimate', function () {
      var fuel = tolls.estimateFuel(1000, { fuelL100: 0, fuelPrice: 1.6 });
      assert.equal(fuel.applicable, false);
      assert.equal(fuel.cost, 0);
    });

    /* ------------------------------------------- offline country pre-filter */

    T.test('a point inside exactly one bounding box resolves without network', function () {
      var index = TRP.planner.makeBboxIndex(tolls.normaliseRates(RATES));
      /* Central Germany: inside DE only. */
      assert.equal(TRP.planner.uniqueBboxCountry(index, 51.0, 10.0), 'DE');
      /* Vienna: east of the German box, so inside AT only. */
      assert.equal(TRP.planner.uniqueBboxCountry(index, 48.21, 16.37), 'AT');
    });

    T.test('an ambiguous point returns null so the reverse-geocoder is used', function () {
      var index = TRP.planner.makeBboxIndex(tolls.normaliseRates(RATES));
      /* Inside both the DE and the AT boxes. */
      assert.equal(TRP.planner.uniqueBboxCountry(index, 48.0, 12.0), null);
      /* Outside every box. */
      assert.equal(TRP.planner.uniqueBboxCountry(index, 40.0, -3.0), null);
    });

    T.test('the shipped dataset covers at least 30 countries with valid boxes', function () {
      var rates = tolls.normaliseRates(TRP.EMBEDDED_DATA.tollRates);
      var codes = Object.keys(rates);
      assert.ok(codes.length >= 30, 'only ' + codes.length + ' countries on file');
      codes.forEach(function (code) {
        assert.ok(rates[code].rate >= 0, code + ' has a negative rate');
        rates[code].bboxes.forEach(function (b) {
          assert.ok(b.length === 4 && b[0] < b[2] && b[1] < b[3], code + ' has an invalid bounding box');
        });
      });
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
