/**
 * Truck Route Planner - turn a legal stop plan into timed reminders.
 *
 * The compliance view already knows exactly when each mandatory break and
 * daily rest falls due. Knowing is not much use to someone driving, so this
 * turns that plan into notifications that arrive before the deadline, while
 * there is still time to find somewhere to stop.
 *
 * Everything here is pure: it takes a plan and a clock and returns a list of
 * what should fire and when. Nothing schedules, nothing touches a device, and
 * nothing imports a plugin - which is what makes it testable on a machine that
 * is not a phone.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});

  /*
   * How long before a stop falls due the warning arrives.
   *
   * Fifteen minutes is roughly 17 km at motorway speed - far enough to reach
   * the next services, close enough that the driver has not already passed
   * them. A reminder that arrives exactly when the break is due is useless:
   * by then stopping legally is already impossible.
   */
  var LEAD_MINUTES = 15;

  /*
   * iOS keeps at most 64 pending local notifications per app and silently
   * drops the rest, so a long trip has to be trimmed rather than allowed to
   * fail invisibly. Well under the limit, because other reminders may be
   * scheduled too.
   */
  var MAX_NOTIFICATIONS = 48;

  /** Notification ids must be integers, and stable so a reschedule replaces. */
  var ID_BASE = 4200;

  function minutesBefore(date, minutes) {
    return new Date(new Date(date).getTime() - minutes * 60000);
  }

  /**
   * The reminders for one stop: a warning, then the deadline itself.
   *
   * Both matter. The warning is the useful one, but a driver who was not
   * looking at the phone needs the second to know the clock has actually run
   * out rather than assuming the warning was the deadline.
   */
  function forStop(stop, index, lead) {
    var isBreak = stop.type === 'break';
    var kind = isBreak ? 'break' : 'rest';
    var minutes = Math.round(stop.minMinutes);
    var hours = Math.round(stop.minMinutes / 60);

    return [
      {
        id: ID_BASE + index * 2,
        at: minutesBefore(stop.at, lead),
        kind: kind + 'Soon',
        titleKey: isBreak ? 'remind.breakSoonTitle' : 'remind.restSoonTitle',
        bodyKey: isBreak ? 'remind.breakSoonBody' : 'remind.restSoonBody',
        params: { lead: lead, minutes: minutes, hours: hours, km: stop.km }
      },
      {
        id: ID_BASE + index * 2 + 1,
        at: new Date(stop.at),
        kind: kind + 'Now',
        titleKey: isBreak ? 'remind.breakNowTitle' : 'remind.restNowTitle',
        bodyKey: isBreak ? 'remind.breakNowBody' : 'remind.restNowBody',
        params: { minutes: minutes, hours: hours, km: stop.km }
      }
    ];
  }

  /**
   * Build the notification list for a stop plan.
   *
   * @param {Array} plan      from TRP.euRules.stopPlan
   * @param {{now?:Date, leadMinutes?:number, max?:number}} [options]
   * @returns {Array<{id:number, at:Date, kind:string, titleKey:string,
   *                  bodyKey:string, params:Object}>} sorted, all in the future
   */
  function schedule(plan, options) {
    var opts = options || {};
    var now = opts.now ? new Date(opts.now) : new Date();
    var lead = opts.leadMinutes == null ? LEAD_MINUTES : opts.leadMinutes;
    var max = opts.max == null ? MAX_NOTIFICATIONS : opts.max;

    var out = [];
    (plan || []).forEach(function (stop, i) {
      if (!stop || !stop.at) return;
      forStop(stop, i, lead).forEach(function (n) {
        /* A notification in the past would fire immediately on some platforms
           and be dropped on others; neither is what anyone wants. */
        if (n.at.getTime() > now.getTime()) out.push(n);
      });
    });

    out.sort(function (a, b) { return a.at.getTime() - b.at.getTime(); });
    return out.slice(0, max);
  }

  /** Every id this module may ever use, so a cancel can clear them all. */
  function allIds(max) {
    var n = (max == null ? MAX_NOTIFICATIONS : max);
    var ids = [];
    for (var i = 0; i < n; i += 1) ids.push(ID_BASE + i);
    return ids;
  }

  /**
   * A short description of what was scheduled, for the confirmation message.
   * Counting the stops rather than the notifications: two per stop is an
   * implementation detail and "8 reminders" for 4 breaks reads as a mistake.
   */
  function summary(notifications) {
    var stops = {};
    (notifications || []).forEach(function (n) {
      stops[n.id - ((n.id - ID_BASE) % 2)] = true;
    });
    var breaks = (notifications || []).filter(function (n) {
      return n.kind === 'breakSoon' || n.kind === 'breakNow';
    });
    return {
      total: notifications ? notifications.length : 0,
      stops: Object.keys(stops).length,
      breaks: breaks.length,
      first: notifications && notifications.length ? notifications[0].at : null
    };
  }

  TRP.reminders = {
    LEAD_MINUTES: LEAD_MINUTES,
    MAX_NOTIFICATIONS: MAX_NOTIFICATIONS,
    ID_BASE: ID_BASE,
    schedule: schedule,
    allIds: allIds,
    summary: summary
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.reminders;
})(typeof globalThis !== 'undefined' ? globalThis : this);
