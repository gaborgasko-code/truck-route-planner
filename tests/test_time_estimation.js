/**
 * Tests for the legal driving time model.
 * No network access is required.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var timeModel = TRP.timeModel;
  var CONFIG = TRP.CONFIG;
  var assert = T.assert;

  T.describe('time estimation', function () {

    T.test('normal route: 350 km needs no break and no daily rest', function () {
      var r = timeModel.estimateTravelTime(350);
      assert.closeTo(r.drivingHours, 5, 1e-9);
      assert.equal(r.breaksCount, 1, 'one 45-minute break after 4h30');
      assert.equal(r.breakMinutes, 45);
      assert.equal(r.fullDays, 0);
      assert.equal(r.overnightRestHours, 0);
      assert.closeTo(r.totalHours, 5 + 0.75, 1e-9);
    });

    T.test('short route below 4h30 has no break at all', function () {
      var r = timeModel.estimateTravelTime(210); /* 3 h at 70 km/h */
      assert.closeTo(r.drivingHours, 3, 1e-9);
      assert.equal(r.breaksCount, 0);
      assert.equal(r.fullDays, 0);
      assert.closeTo(r.totalHours, 3, 1e-9);
    });

    T.test('long route: 1400 km applies breaks and daily rests', function () {
      var r = timeModel.estimateTravelTime(1400);
      assert.closeTo(r.drivingHours, 20, 1e-9);
      assert.equal(r.breaksCount, 4, 'floor(20 / 4.5) = 4');
      assert.equal(r.breakMinutes, 180);
      assert.equal(r.fullDays, 2, 'floor(20 / 9) = 2');
      assert.equal(r.overnightRestHours, 22);
      assert.closeTo(r.totalHours, 20 + 3 + 22, 1e-9);
    });

    T.test('a custom average speed changes every derived figure', function () {
      var r = timeModel.estimateTravelTime(600, { speedKmh: 60 });
      assert.closeTo(r.drivingHours, 10, 1e-9);
      assert.equal(r.speedKmh, 60);
      assert.equal(r.breaksCount, 2);
      assert.equal(r.fullDays, 1);
      assert.closeTo(r.totalHours, 10 + 1.5 + 11, 1e-9);
    });

    T.test('an invalid speed falls back to the configured average', function () {
      var r = timeModel.estimateTravelTime(140, { speedKmh: 0 });
      assert.equal(r.speedKmh, CONFIG.AVG_TRUCK_SPEED_KMH);
      assert.closeTo(r.drivingHours, 2, 1e-9);
    });

    /* ---------------------------------------------------------- edge cases */

    T.test('edge case: zero distance produces an all-zero model', function () {
      var r = timeModel.estimateTravelTime(0);
      assert.equal(r.distanceKm, 0);
      assert.equal(r.drivingHours, 0);
      assert.equal(r.breaksCount, 0);
      assert.equal(r.breakMinutes, 0);
      assert.equal(r.fullDays, 0);
      assert.equal(r.overnightRestHours, 0);
      assert.equal(r.totalHours, 0);
    });

    T.test('edge case: a negative distance is treated as zero', function () {
      var r = timeModel.estimateTravelTime(-120);
      assert.equal(r.totalHours, 0);
      assert.equal(r.distanceKm, 0);
    });

    T.test('edge case: a non-numeric distance throws', function () {
      assert.throws(function () { timeModel.estimateTravelTime('far'); });
      assert.throws(function () { timeModel.estimateTravelTime(undefined); });
    });

    /* ----------------------------------------------------------- itinerary */

    T.test('the itinerary ends exactly at departure + total time', function () {
      var departure = new Date('2026-05-11T06:00:00Z');
      var it = timeModel.buildItinerary(1400, departure);
      var elapsedH = (it.arrival.getTime() - it.departure.getTime()) / 3600000;
      assert.closeTo(elapsedH, it.model.totalHours, 1e-6);
    });

    T.test('the itinerary emits exactly the modelled breaks and rests', function () {
      var it = timeModel.buildItinerary(1400, new Date('2026-05-11T06:00:00Z'));
      var breaks = it.events.filter(function (e) { return e.type === 'break'; }).length;
      var rests = it.events.filter(function (e) { return e.type === 'rest'; }).length;
      assert.equal(breaks, it.model.breaksCount);
      assert.equal(rests, it.model.fullDays);
      assert.equal(it.events[0].type, 'depart');
      assert.equal(it.events[it.events.length - 1].type, 'arrive');
    });

    T.test('no driving segment exceeds the 4h30 continuous limit', function () {
      var it = timeModel.buildItinerary(2000, new Date('2026-05-11T06:00:00Z'));
      it.events.filter(function (e) { return e.type === 'drive'; }).forEach(function (e) {
        assert.ok(e.durationH <= CONFIG.MAX_CONTINUOUS_DRIVING_H + 1e-9,
          'drive block of ' + e.durationH + ' h exceeds the limit');
      });
    });

    T.test('edge case: a zero-distance itinerary is just depart + arrive', function () {
      var it = timeModel.buildItinerary(0, new Date('2026-05-11T06:00:00Z'));
      assert.lengthOf(it.events, 2);
      assert.equal(it.arrival.getTime(), it.departure.getTime());
    });

    T.test('weekend departures raise a driving ban warning', function () {
      var saturday = new Date('2026-05-16T08:00:00');
      var warnings = timeModel.weekendWarnings(saturday, saturday);
      assert.ok(warnings.length >= 1);
      var wednesday = new Date('2026-05-13T08:00:00');
      assert.lengthOf(timeModel.weekendWarnings(wednesday, wednesday), 0);
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
