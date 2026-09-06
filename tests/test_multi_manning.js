/**
 * Tests for multi-manning (two drivers): the time model, the itinerary and
 * the legal analysis. No network access.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var timeModel = TRP.timeModel;
  var euRules = TRP.euRules;
  var assert = T.assert;

  var DOC = TRP.EMBEDDED_DATA.euRules;
  var DEPARTURE = new Date('2026-05-11T06:00:00Z'); /* a Monday */

  function count(events, type) {
    return events.filter(function (ev) { return ev.type === type; }).length;
  }

  T.describe('multi-manning (two drivers)', function () {

    T.test('one driver is the default and keeps the single-manning limits', function () {
      var r = timeModel.estimateTravelTime(1400);
      assert.equal(r.drivers, 1);
      assert.equal(r.multiManning, false);
      assert.equal(r.breakMin, 45);
      assert.equal(r.dailyRestH, 11);
      assert.equal(r.maxDailyDrivingH, 9);
      assert.equal(r.swapsCount, 0);
    });

    T.test('anything below two is one driver; two or more is a team of two', function () {
      assert.equal(timeModel.rulesFor(undefined).drivers, 1);
      assert.equal(timeModel.rulesFor(0).drivers, 1);
      assert.equal(timeModel.rulesFor('1').drivers, 1);
      assert.equal(timeModel.rulesFor(2).drivers, 2);
      assert.equal(timeModel.rulesFor('2').multiManning, true);
      assert.equal(timeModel.rulesFor(3).drivers, 2);
    });

    T.test('two drivers: no break stops, a driver change every 4h30, 9 h rest after 18 h', function () {
      var r = timeModel.estimateTravelTime(1400, { drivers: 2 });
      assert.closeTo(r.drivingHours, 20, 1e-9);
      assert.equal(r.breaksCount, 0, 'the 45-minute break is taken as a passenger');
      assert.equal(r.breakMinutes, 0);
      assert.equal(r.swapsCount, 4, 'floor(20 / 4.5) driver changes');
      assert.equal(r.maxDailyDrivingH, 18, '9 h per driver');
      assert.equal(r.fullDays, 1, 'floor(20 / 18)');
      assert.equal(r.dailyRestH, 9, 'Art. 8.5');
      assert.equal(r.overnightRestHours, 9);
      assert.closeTo(r.totalHours, 20 + 9, 1e-9);
    });

    T.test('a team arrives earlier than a single driver on the same route', function () {
      var solo = timeModel.estimateTravelTime(1400);
      var team = timeModel.estimateTravelTime(1400, { drivers: 2 });
      assert.closeTo(solo.totalHours, 20 + 3 + 22, 1e-9);
      assert.ok(team.totalHours < solo.totalHours, 'two drivers must not be slower');
    });

    T.test('a short trip for two drivers still changes driver after 4h30', function () {
      var r = timeModel.estimateTravelTime(350, { drivers: 2 }); /* 5 h */
      assert.equal(r.swapsCount, 1);
      assert.equal(r.breaksCount, 0);
      assert.equal(r.fullDays, 0);
      assert.closeTo(r.totalHours, 5, 1e-9, 'no time is lost to the break');
    });

    T.test('the two-driver itinerary swaps drivers instead of stopping and ends at departure + total', function () {
      var it = timeModel.buildItinerary(1400, DEPARTURE, { drivers: 2 });
      assert.equal(count(it.events, 'break'), 0);
      assert.equal(count(it.events, 'swap'), it.model.swapsCount);
      assert.equal(count(it.events, 'rest'), 1);
      assert.equal(it.events[0].type, 'depart');
      assert.equal(it.events[it.events.length - 1].type, 'arrive');
      var elapsedH = (it.arrival.getTime() - it.departure.getTime()) / 3600000;
      assert.closeTo(elapsedH, it.model.totalHours, 1e-6);
      it.events.forEach(function (ev) {
        if (ev.type === 'drive') assert.ok(ev.durationH <= 4.5 + 1e-9, 'no driver drives more than 4h30 at a stretch');
        if (ev.type === 'swap') assert.equal(ev.durationH, 0, 'a driver change takes no modelled time');
      });
    });

    T.test('the single-driver itinerary is unchanged by the new option', function () {
      var it = timeModel.buildItinerary(1400, DEPARTURE);
      assert.equal(count(it.events, 'swap'), 0);
      assert.equal(count(it.events, 'break'), 4);
      assert.equal(count(it.events, 'rest'), 2);
    });

    T.test('the legal plan for two drivers has no break stops and a 9 h rest under Art. 8.5', function () {
      var it = timeModel.buildItinerary(1400, DEPARTURE, { drivers: 2 });
      var analysis = euRules.analyse(it.model, it.events, DOC);
      assert.equal(analysis.plan.filter(function (s) { return s.type === 'break'; }).length, 0);
      var rests = analysis.plan.filter(function (s) { return s.type === 'dailyRest'; });
      assert.equal(rests.length, 1);
      assert.equal(rests[0].minMinutes, 9 * 60);
      assert.equal(rests[0].article, 'Art. 8.5');
      assert.equal(rests[0].altKey, 'legal.multiManningHint');
    });

    T.test('the single-driver legal plan keeps the 11 h rest under Art. 8.2', function () {
      var it = timeModel.buildItinerary(1400, DEPARTURE);
      var rests = euRules.analyse(it.model, it.events, DOC).plan
        .filter(function (s) { return s.type === 'dailyRest'; });
      assert.equal(rests.length, 2);
      assert.equal(rests[0].minMinutes, 11 * 60);
      assert.equal(rests[0].article, 'Art. 8.2');
    });

    T.test('weekly and fortnightly driving checks count the hours per driver', function () {
      var team = timeModel.buildItinerary(4200, DEPARTURE, { drivers: 2 }); /* 60 h of driving */
      var teamWeekly = euRules.analyse(team.model, team.events, DOC).checks
        .filter(function (c) { return c.id === 'weeklyDriving'; })[0];
      assert.ok(teamWeekly.ok, '30 h per driver is within the 56 h week');
      assert.equal(teamWeekly.noteKey, 'legal.perDriver');

      var solo = timeModel.buildItinerary(4200, DEPARTURE);
      var soloWeekly = euRules.analyse(solo.model, solo.events, DOC).checks
        .filter(function (c) { return c.id === 'weeklyDriving'; })[0];
      assert.ok(!soloWeekly.ok, '60 h for one driver exceeds the 56 h week');
    });

    T.test('the daily-driving check uses the crew ceiling', function () {
      var team = timeModel.buildItinerary(1400, DEPARTURE, { drivers: 2 });
      var check = euRules.analyse(team.model, team.events, DOC).checks
        .filter(function (c) { return c.id === 'dailyDriving'; })[0];
      assert.equal(check.value, 2, 'ceil(20 / 18) driving days');
      assert.equal(check.limit, '18h');
    });

    T.test('every new string exists in both languages', function () {
      ['form.drivers', 'form.drivers1', 'form.drivers2', 'form.driversNote', 'ev.swap',
        'stat.driverSwaps', 'stat.every430', 'legal.multiManningHint', 'legal.perDriver',
        'legal.disclaimerTeam', 'report.drivers', 'report.teamDriving', 'report.swaps'
      ].forEach(function (key) {
        var s = TRP.i18n.STRINGS[key];
        assert.ok(s && s.es && s.en, 'missing translation: ' + key);
      });
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
