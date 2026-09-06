/**
 * Tests for the EU legal stop plan and the driving-time compliance checks.
 * No network access.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var euRules = TRP.euRules;
  var timeModel = TRP.timeModel;
  var assert = T.assert;

  var DOC = TRP.EMBEDDED_DATA.euRules;
  var DEPARTURE = new Date('2026-05-11T06:00:00Z'); /* a Monday */

  function planFor(distanceKm, departure) {
    var it = timeModel.buildItinerary(distanceKm, departure || DEPARTURE);
    return {
      itinerary: it,
      analysis: euRules.analyse(it.model, it.events, DOC)
    };
  }

  T.describe('legal stops (EU)', function () {

    /* -------------------------------------------------------- the dataset */

    T.test('the shipped rule set covers every regulated topic', function () {
      var groups = euRules.groups(DOC);
      var ids = (DOC.groups || []).map(function (g) { return g.id; });
      ['breaks', 'driving', 'daily_rest', 'weekly_rest', 'special', 'working_time', 'tachograph']
        .forEach(function (id) {
          assert.ok(ids.indexOf(id) !== -1, 'missing rule group: ' + id);
        });
      groups.forEach(function (group) {
        assert.ok(group.rules.length >= 3, group.id + ' has too few rules');
        group.rules.forEach(function (rule) {
          assert.ok(rule.article && rule.article.length > 0, 'a rule has no article reference');
          assert.ok(typeof rule.text === 'string' && rule.text.length > 20, 'a rule text is missing');
        });
      });
    });

    T.test('the legal limits match Regulation (EC) 561/2006', function () {
      var L = euRules.limits(DOC);
      assert.equal(L.max_continuous_driving_h, 4.5);
      assert.equal(L.break_min, 45);
      assert.equal(L.break_split_first_min, 15);
      assert.equal(L.break_split_second_min, 30);
      assert.equal(L.max_daily_driving_h, 9);
      assert.equal(L.extended_daily_driving_h, 10);
      assert.equal(L.max_weekly_driving_h, 56);
      assert.equal(L.max_fortnightly_driving_h, 90);
      assert.equal(L.regular_daily_rest_h, 11);
      assert.equal(L.reduced_daily_rest_h, 9);
      assert.equal(L.regular_weekly_rest_h, 45);
      assert.equal(L.reduced_weekly_rest_h, 24);
      assert.equal(L.weekly_window_h, 144); /* six 24-hour periods */
    });

    T.test('limits fall back to the built-in defaults without a dataset', function () {
      var L = euRules.limits(null);
      assert.equal(L.max_continuous_driving_h, 4.5);
      assert.equal(L.break_min, 45);
    });

    /* ---------------------------------------------------------- stop plan */

    T.test('a 350 km run requires exactly one 45-minute break', function () {
      var plan = planFor(350).analysis.plan;
      assert.lengthOf(plan, 1);
      assert.equal(plan[0].type, 'break');
      assert.equal(plan[0].minMinutes, 45);
      assert.equal(plan[0].article, 'Art. 7');
    });

    T.test('the break falls after 4h30 of accumulated driving', function () {
      var plan = planFor(350).analysis.plan;
      assert.closeTo(plan[0].drivenH, 4.5, 1e-6);
    });

    T.test('a 1400 km run requires four breaks and two daily rests', function () {
      var plan = planFor(1400).analysis.plan;
      var breaks = plan.filter(function (s) { return s.type === 'break'; });
      var rests = plan.filter(function (s) { return s.type === 'dailyRest'; });
      assert.lengthOf(breaks, 4);
      assert.lengthOf(rests, 2);
      rests.forEach(function (rest) {
        assert.equal(rest.minMinutes, 11 * 60);
        assert.equal(rest.article, 'Art. 8.2');
      });
    });

    T.test('the stop plan matches the itinerary one for one', function () {
      var result = planFor(1400);
      var events = result.itinerary.events.filter(function (e) {
        return e.type === 'break' || e.type === 'rest';
      });
      assert.equal(result.analysis.plan.filter(function (s) {
        return s.type !== 'weeklyRest';
      }).length, events.length);
    });

    T.test('every stop carries a legal basis and a permitted alternative', function () {
      planFor(1400).analysis.plan.forEach(function (stop) {
        assert.ok(stop.article, 'stop without an article reference');
        assert.ok(stop.altKey, 'stop without an alternative hint');
        assert.ok(stop.at && !isNaN(new Date(stop.at).getTime()), 'stop without a valid timestamp');
      });
    });

    T.test('stops are numbered and chronologically ordered', function () {
      var plan = planFor(2000).analysis.plan;
      var previous = 0;
      plan.forEach(function (stop, i) {
        assert.equal(stop.n, i + 1);
        var at = new Date(stop.at).getTime();
        assert.ok(at >= previous, 'stops are out of order');
        previous = at;
      });
    });

    T.test('edge case: a short run requires no mandatory stop', function () {
      assert.lengthOf(planFor(200).analysis.plan, 0);
      assert.lengthOf(planFor(0).analysis.plan, 0);
    });

    /* --------------------------------------------------- weekly rest rule */

    T.test('a weekly rest is added once the trip passes six 24-hour periods', function () {
      /* 5000 km at 70 km/h is 71.4 h of driving, which with breaks and daily
         rests runs past the 144-hour (six 24-hour period) window. */
      var analysis = planFor(5000).analysis;
      var weekly = analysis.plan.filter(function (s) { return s.type === 'weeklyRest'; });
      assert.lengthOf(weekly, 1);
      assert.equal(weekly[0].minMinutes, 45 * 60);
      assert.equal(weekly[0].article, 'Art. 8.6');
    });

    T.test('a short trip gets no weekly rest entry', function () {
      var weekly = planFor(700).analysis.plan.filter(function (s) { return s.type === 'weeklyRest'; });
      assert.lengthOf(weekly, 0);
    });

    /* ------------------------------------------------------------- checks */

    T.test('compliance checks report the continuous driving limit', function () {
      var checks = planFor(1400).analysis.checks;
      var continuous = checks.filter(function (c) { return c.id === 'continuous'; })[0];
      assert.ok(continuous, 'no continuous driving check');
      assert.equal(continuous.ok, true, 'the model must never exceed 4h30');
    });

    T.test('the weekly driving ceiling is flagged when exceeded', function () {
      var within = planFor(3000).analysis.checks.filter(function (c) { return c.id === 'weeklyDriving'; })[0];
      assert.equal(within.ok, true, '3000 km is under 56 h at 70 km/h');
      var over = planFor(4500).analysis.checks.filter(function (c) { return c.id === 'weeklyDriving'; })[0];
      assert.equal(over.ok, false, '4500 km is over 56 h at 70 km/h');
    });

    T.test('the fortnightly ceiling is flagged when exceeded', function () {
      var over = planFor(7000).analysis.checks.filter(function (c) { return c.id === 'fortnightly'; })[0];
      assert.equal(over.ok, false, '100 h of driving is over the 90 h ceiling');
    });

    T.test('the number of driving days is reported', function () {
      var check = planFor(1400).analysis.checks.filter(function (c) { return c.id === 'dailyDriving'; })[0];
      assert.equal(check.value, 3); /* ceil(20 h / 9 h) */
    });

    T.test('every check has a label, a value and a limit', function () {
      planFor(1400).analysis.checks.forEach(function (check) {
        assert.ok(check.labelKey && check.labelKey.indexOf('legal.') === 0, 'check without a label key');
        assert.ok(check.value != null, 'check without a value');
        assert.ok(check.limit != null, 'check without a limit');
        assert.equal(typeof check.ok, 'boolean');
      });
    });

    /* ----------------------------------------------------------- warnings */

    T.test('warnings are raised for over-limit trips only', function () {
      assert.lengthOf(euRules.warnings(planFor(700).itinerary.model, DOC), 0);
      var heavy = euRules.warnings(planFor(7000).itinerary.model, DOC);
      var keys = heavy.map(function (w) { return w.key; });
      assert.ok(keys.indexOf('warn.weeklyDriving') !== -1, 'missing the weekly driving warning');
      assert.ok(keys.indexOf('warn.fortnightlyDriving') !== -1, 'missing the fortnightly warning');
      assert.ok(keys.indexOf('warn.weeklyRest') !== -1, 'missing the weekly rest warning');
    });

    T.test('warnings are translation keys, never hard-coded prose', function () {
      euRules.warnings(planFor(7000).itinerary.model, DOC).forEach(function (w) {
        assert.ok(w.key && w.key.indexOf('warn.') === 0, 'warning is not a key: ' + JSON.stringify(w));
        assert.ok(TRP.i18n.has(w.key), 'warning key is missing from the dictionary: ' + w.key);
      });
    });

    /* ------------------------------------------------- analyse() envelope */

    T.test('analyse returns limits, plan, checks and warnings together', function () {
      var analysis = planFor(1400).analysis;
      assert.ok(analysis.limits && analysis.limits.break_min === 45);
      assert.ok(Array.isArray(analysis.plan));
      assert.ok(Array.isArray(analysis.checks));
      assert.ok(Array.isArray(analysis.warnings));
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
