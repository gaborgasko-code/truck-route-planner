/**
 * Truck Route Planner - break reminder tests.
 *
 * These decide when a driver's phone buzzes. Getting them wrong is worse than
 * having no reminders at all: a notification that arrives after the deadline
 * tells someone they are already in breach, and one that fires at the wrong
 * time teaches them to ignore the next.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function' && typeof module !== 'undefined') {
    if (!global.TRPTest) require('./harness.js');
    if (!TRP.reminders) require('../js/core/reminders.js');
  }

  var T = global.TRPTest;
  var describe = T.describe;
  var test = T.test;
  var assert = T.assert;
  var reminders = TRP.reminders;

  var NOW = new Date('2026-05-11T06:00:00Z');

  function at(hoursFromNow) {
    return new Date(NOW.getTime() + hoursFromNow * 3600000);
  }

  /** A plan shaped like the one euRules.stopPlan produces. */
  function plan() {
    return [
      { n: 1, type: 'break', at: at(4.5), km: 315, drivenH: 4.5, minMinutes: 45 },
      { n: 2, type: 'break', at: at(9.75), km: 630, drivenH: 9, minMinutes: 45 },
      { n: 3, type: 'dailyRest', at: at(10.5), km: 700, drivenH: 9, minMinutes: 660 }
    ];
  }

  describe('reminders - what gets scheduled', function () {
    test('each stop gets a warning and a deadline', function () {
      var out = reminders.schedule(plan(), { now: NOW });
      assert.equal(out.length, 6, 'three stops, two notifications each');
      var kinds = out.map(function (n) { return n.kind; });
      assert.ok(kinds.indexOf('breakSoon') !== -1, 'a warning before the break');
      assert.ok(kinds.indexOf('breakNow') !== -1, 'and one at the deadline');
      assert.ok(kinds.indexOf('restSoon') !== -1);
      assert.ok(kinds.indexOf('restNow') !== -1);
    });

    test('the warning arrives before the deadline, not at it', function () {
      /* The whole point. A reminder that fires when the break is already due
         is useless - by then stopping legally is no longer possible. */
      var out = reminders.schedule(plan(), { now: NOW, leadMinutes: 15 });
      var soon = out.filter(function (n) { return n.kind === 'breakSoon'; })[0];
      var now = out.filter(function (n) { return n.kind === 'breakNow'; })[0];
      var gap = (now.at.getTime() - soon.at.getTime()) / 60000;
      assert.equal(gap, 15, 'exactly the lead time apart, got ' + gap + ' min');
      assert.ok(soon.at.getTime() < now.at.getTime(), 'and it really is earlier');
    });

    test('the lead time is configurable', function () {
      var out = reminders.schedule(plan(), { now: NOW, leadMinutes: 30 });
      var soon = out.filter(function (n) { return n.kind === 'breakSoon'; })[0];
      var stop = plan()[0];
      assert.equal((stop.at.getTime() - soon.at.getTime()) / 60000, 30);
    });

    test('notifications come out in chronological order', function () {
      /* iOS does not care, but a list that is not sorted makes the cap below
         drop the wrong ones. */
      var out = reminders.schedule(plan(), { now: NOW });
      for (var i = 1; i < out.length; i += 1) {
        assert.ok(out[i].at.getTime() >= out[i - 1].at.getTime(),
          'entry ' + i + ' is out of order');
      }
    });

    test('every id is a distinct integer', function () {
      /* Capacitor requires integer ids, and a collision would mean one
         reminder silently replacing another. */
      var out = reminders.schedule(plan(), { now: NOW });
      var seen = {};
      out.forEach(function (n) {
        assert.equal(n.id, Math.round(n.id), 'id ' + n.id + ' is not an integer');
        assert.ok(!seen[n.id], 'duplicate id ' + n.id);
        seen[n.id] = true;
      });
    });
  });

  describe('reminders - what gets left out', function () {
    test('anything already past is dropped', function () {
      /* A past notification fires immediately on some platforms and is
         discarded on others; neither is wanted. */
      var late = new Date(NOW.getTime() + 5 * 3600000);   /* after stop 1 */
      var out = reminders.schedule(plan(), { now: late });
      out.forEach(function (n) {
        assert.ok(n.at.getTime() > late.getTime(),
          n.kind + ' is in the past relative to now');
      });
      assert.ok(out.length < 6, 'the first stop is gone');
    });

    test('a trip already finished schedules nothing', function () {
      var after = new Date(NOW.getTime() + 48 * 3600000);
      assert.equal(reminders.schedule(plan(), { now: after }).length, 0);
    });

    test('the warning is dropped but the deadline kept when it falls between', function () {
      var between = new Date(at(4.5).getTime() - 5 * 60000);  /* inside the lead */
      var out = reminders.schedule(plan(), { now: between, leadMinutes: 15 });
      var first = out.filter(function (n) { return n.km === 315 || (n.params && n.params.km === 315); });
      var kinds = first.map(function (n) { return n.kind; });
      assert.equal(kinds.indexOf('breakSoon'), -1, 'the warning has passed');
      assert.ok(kinds.indexOf('breakNow') !== -1, 'the deadline still fires');
    });

    test('an empty or missing plan is handled, not thrown at', function () {
      assert.equal(reminders.schedule([], { now: NOW }).length, 0);
      assert.equal(reminders.schedule(null, { now: NOW }).length, 0);
      assert.equal(reminders.schedule(undefined).length, 0);
    });

    test('a stop with no time is skipped rather than scheduled at the epoch', function () {
      var broken = [{ n: 1, type: 'break', km: 100, minMinutes: 45 }];
      assert.equal(reminders.schedule(broken, { now: NOW }).length, 0);
    });

    test('a very long trip is capped below the iOS limit', function () {
      /* iOS keeps 64 pending notifications and silently drops the rest, so the
         list has to be trimmed here rather than failing invisibly there. */
      var many = [];
      for (var i = 1; i <= 80; i += 1) {
        many.push({ n: i, type: 'break', at: at(i * 4.5), km: i * 315, minMinutes: 45 });
      }
      var out = reminders.schedule(many, { now: NOW });
      assert.ok(out.length <= reminders.MAX_NOTIFICATIONS,
        'got ' + out.length + ', cap is ' + reminders.MAX_NOTIFICATIONS);
      assert.ok(reminders.MAX_NOTIFICATIONS < 64, 'the cap leaves headroom under the iOS limit');
      /* Keeping the soonest is what matters - those are the ones the driver
         will actually reach. */
      assert.equal(out[0].at.getTime(), reminders.schedule(many, { now: NOW })[0].at.getTime());
    });
  });

  describe('reminders - the text it asks for', function () {
    test('every notification names keys the dictionary knows', function () {
      var i18n = TRP.i18n || (typeof require === 'function' ? require('../js/core/i18n.js') : null);
      if (!i18n) return;
      reminders.schedule(plan(), { now: NOW }).forEach(function (n) {
        assert.ok(i18n.has(n.titleKey), 'unknown title key: ' + n.titleKey);
        assert.ok(i18n.has(n.bodyKey), 'unknown body key: ' + n.bodyKey);
      });
    });

    test('the parameters the text needs are supplied', function () {
      var i18n = TRP.i18n || (typeof require === 'function' ? require('../js/core/i18n.js') : null);
      if (!i18n) return;
      reminders.schedule(plan(), { now: NOW }).forEach(function (n) {
        var text = i18n.t(n.bodyKey, n.params);
        assert.equal(/\{[a-z]+\}/i.test(text), false,
          'unfilled placeholder in ' + n.bodyKey + ': ' + text);
      });
    });

    test('a break asks for minutes and a rest asks for hours', function () {
      var out = reminders.schedule(plan(), { now: NOW });
      var brk = out.filter(function (n) { return n.kind === 'breakNow'; })[0];
      var rest = out.filter(function (n) { return n.kind === 'restNow'; })[0];
      assert.equal(brk.params.minutes, 45, 'the 45-minute break');
      assert.equal(rest.params.hours, 11, 'the 11-hour daily rest');
    });
  });

  describe('reminders - cancelling', function () {
    test('allIds covers every id schedule can produce', function () {
      /* Cancelling has to clear reminders from a previous, longer trip, so the
         id list cannot be derived from the current plan. */
      var many = [];
      for (var i = 1; i <= 40; i += 1) {
        many.push({ n: i, type: 'break', at: at(i * 2), km: i * 100, minMinutes: 45 });
      }
      var ids = reminders.allIds();
      reminders.schedule(many, { now: NOW }).forEach(function (n) {
        assert.ok(ids.indexOf(n.id) !== -1, 'id ' + n.id + ' would be left behind');
      });
    });

    test('summary counts stops, not notifications', function () {
      /* Two per stop is an implementation detail; "8 reminders" for four
         breaks reads as a bug. */
      var s = reminders.summary(reminders.schedule(plan(), { now: NOW }));
      assert.equal(s.total, 6);
      assert.equal(s.stops, 3, 'three stops');
      assert.ok(s.first instanceof Date, 'and when the first one lands');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
