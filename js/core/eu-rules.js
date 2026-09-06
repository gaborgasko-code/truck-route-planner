/**
 * Truck Route Planner - European driving and rest time rules.
 *
 * Turns the modelled trip into a plan of the stops the law actually requires
 * (Regulation (EC) No 561/2006 as amended by Regulation (EU) 2020/1054) and
 * runs the trip against the driving-time ceilings.
 *
 * Every string produced here is a translation key plus parameters, so the
 * module stays free of both the DOM and the active language.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.util) require('./util.js');
    if (!TRP.i18n) require('./i18n.js');
  }
  var util = TRP.util;

  /** Fallback limits, used when the dataset is unavailable. */
  var DEFAULT_LIMITS = {
    max_continuous_driving_h: 4.5,
    break_min: 45,
    break_split_first_min: 15,
    break_split_second_min: 30,
    max_daily_driving_h: 9,
    extended_daily_driving_h: 10,
    extended_days_per_week: 2,
    max_weekly_driving_h: 56,
    max_fortnightly_driving_h: 90,
    regular_daily_rest_h: 11,
    split_daily_rest_first_h: 3,
    split_daily_rest_second_h: 9,
    reduced_daily_rest_h: 9,
    reduced_daily_rests_between_weekly: 3,
    daily_window_h: 24,
    regular_weekly_rest_h: 45,
    reduced_weekly_rest_h: 24,
    weekly_window_h: 144,
    multi_manning_rest_h: 9,
    multi_manning_window_h: 30
  };

  function limits(doc) {
    return Object.assign({}, DEFAULT_LIMITS, (doc && doc.limits) || {});
  }

  /** Rule groups with the text already resolved to the active language. */
  function groups(doc) {
    var pick = TRP.i18n ? TRP.i18n.pick : function (v) { return v; };
    return ((doc && doc.groups) || []).map(function (group) {
      return {
        id: group.id,
        icon: group.icon || '',
        title: pick(group.title),
        rules: (group.rules || []).map(function (rule) {
          return { article: rule.article, text: pick(rule.text) };
        })
      };
    });
  }

  function scopeText(doc) {
    var pick = TRP.i18n ? TRP.i18n.pick : function (v) { return v; };
    return doc && doc.scope ? pick(doc.scope) : '';
  }

  function disclaimerText(doc) {
    var pick = TRP.i18n ? TRP.i18n.pick : function (v) { return v; };
    return doc && doc.disclaimer ? pick(doc.disclaimer) : '';
  }

  /**
   * The stops the regulation requires for this trip.
   *
   * Built from the itinerary the time model produced, so the plan and the
   * schedule can never disagree. A weekly rest is appended when the trip runs
   * past six 24-hour periods.
   *
   * @param {Array} events itinerary events from `TRP.timeModel.buildItinerary`
   * @param {Object} model the time model result
   * @param {Object} [doc] the eu_driving_rules dataset
   * @returns {Array<{n:number, type:string, at:string, km:number,
   *                  minMinutes:number, article:string, drivenH:number,
   *                  altKey:string|null}>}
   */
  function stopPlan(events, model, doc) {
    var L = limits(doc);
    var plan = [];
    var drivenH = 0;

    (events || []).forEach(function (ev) {
      if (ev.type === 'drive') {
        drivenH += ev.durationH;
        return;
      }
      if (ev.type === 'break') {
        plan.push({
          n: plan.length + 1,
          type: 'break',
          at: ev.at,
          km: ev.km,
          drivenH: drivenH,
          minMinutes: L.break_min,
          article: 'Art. 7',
          altKey: 'legal.splitBreakHint'
        });
      } else if (ev.type === 'rest') {
        plan.push({
          n: plan.length + 1,
          type: 'dailyRest',
          at: ev.at,
          km: ev.km,
          drivenH: drivenH,
          minMinutes: L.regular_daily_rest_h * 60,
          article: 'Art. 8.2',
          altKey: 'legal.splitRestHint'
        });
      }
    });

    /* A weekly rest becomes due after six 24-hour periods from departure. */
    var departure = events && events.length ? new Date(events[0].at) : null;
    var arrival = events && events.length ? new Date(events[events.length - 1].at) : null;
    if (departure && arrival) {
      var elapsedH = (arrival.getTime() - departure.getTime()) / 3600000;
      if (elapsedH > L.weekly_window_h) {
        plan.push({
          n: plan.length + 1,
          type: 'weeklyRest',
          at: util.addHours(departure, L.weekly_window_h).toISOString(),
          km: Math.round((model && model.distanceKm) || 0),
          drivenH: drivenH,
          minMinutes: L.regular_weekly_rest_h * 60,
          article: 'Art. 8.6',
          altKey: 'legal.accommodationHint'
        });
      }
    }

    return plan;
  }

  /**
   * Run the trip against the driving-time ceilings.
   * @returns {Array<{id, labelKey, value, limit, ok, noteKey, noteParams}>}
   */
  function complianceChecks(model, events, doc) {
    var L = limits(doc);
    var checks = [];

    var longestDrive = 0;
    (events || []).forEach(function (ev) {
      if (ev.type === 'drive' && ev.durationH > longestDrive) longestDrive = ev.durationH;
    });

    checks.push({
      id: 'continuous',
      labelKey: 'legal.checkContinuous',
      value: util.formatShortDuration(longestDrive),
      limit: util.formatShortDuration(L.max_continuous_driving_h),
      ok: longestDrive <= L.max_continuous_driving_h + 1e-9
    });

    var drivingDays = model.drivingHours > 0
      ? Math.ceil(model.drivingHours / L.max_daily_driving_h)
      : 0;
    checks.push({
      id: 'dailyDriving',
      labelKey: 'legal.checkDailyDriving',
      value: drivingDays,
      limit: util.formatShortDuration(L.max_daily_driving_h),
      ok: true,
      noteKey: drivingDays > 1 ? 'legal.days' : null,
      noteParams: { n: drivingDays }
    });

    checks.push({
      id: 'weeklyDriving',
      labelKey: 'legal.checkWeeklyDriving',
      value: util.formatShortDuration(model.drivingHours),
      limit: L.max_weekly_driving_h + ' h',
      ok: model.drivingHours <= L.max_weekly_driving_h
    });

    checks.push({
      id: 'fortnightly',
      labelKey: 'legal.checkFortnightly',
      value: util.formatShortDuration(model.drivingHours),
      limit: L.max_fortnightly_driving_h + ' h',
      ok: model.drivingHours <= L.max_fortnightly_driving_h
    });

    var weeklyRestDue = model.totalHours > L.weekly_window_h;
    checks.push({
      id: 'weeklyRest',
      labelKey: 'legal.checkWeeklyRest',
      value: util.formatShortDuration(model.totalHours),
      limit: L.weekly_window_h + ' h',
      ok: !weeklyRestDue,
      noteKey: weeklyRestDue ? 'legal.weeklyRestDue' : 'legal.weeklyRestNotDue'
    });

    return checks;
  }

  /**
   * Compliance warnings for the trip, as `{key, params}` pairs so the UI can
   * translate them.
   */
  function warnings(model, doc) {
    var L = limits(doc);
    var out = [];
    if (model.drivingHours > L.max_weekly_driving_h) {
      out.push({ key: 'warn.weeklyDriving', params: { h: util.formatShortDuration(model.drivingHours) } });
    }
    if (model.drivingHours > L.max_fortnightly_driving_h) {
      out.push({ key: 'warn.fortnightlyDriving', params: { h: util.formatShortDuration(model.drivingHours) } });
    }
    if (model.totalHours > L.weekly_window_h) {
      out.push({ key: 'warn.weeklyRest', params: {} });
    }
    return out;
  }

  /** Everything the legal-stops view needs, in one call. */
  function analyse(model, events, doc) {
    return {
      limits: limits(doc),
      plan: stopPlan(events, model, doc),
      checks: complianceChecks(model, events, doc),
      warnings: warnings(model, doc)
    };
  }

  TRP.euRules = {
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    limits: limits,
    groups: groups,
    scopeText: scopeText,
    disclaimerText: disclaimerText,
    stopPlan: stopPlan,
    complianceChecks: complianceChecks,
    warnings: warnings,
    analyse: analyse
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.euRules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
