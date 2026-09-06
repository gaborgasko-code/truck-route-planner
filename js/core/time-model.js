/**
 * Truck Route Planner - legal driving time estimation.
 *
 * Model (Regulation (EC) 561/2006, simplified for planning):
 *   driving_hours        = distance_km / avg_speed
 *   breaks_count         = floor(driving_hours / 4.5)
 *   break_minutes        = breaks_count * 45
 *   full_days            = floor(driving_hours / 9)
 *   overnight_rest_hours = full_days * 11
 *   total_hours          = driving_hours + break_minutes/60 + overnight_rest_hours
 *
 * Breaks and daily rests are applied cumulatively, which makes the arrival
 * estimate deliberately conservative (worst case).
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.util) require('./util.js');
  }
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;

  /**
   * Estimate truck travel time for a road distance.
   *
   * @param {number} distanceKm road distance in kilometres
   * @param {{speedKmh?:number}} [options]
   * @returns {{distanceKm:number, speedKmh:number, drivingHours:number,
   *            breaksCount:number, breakMinutes:number, breakHours:number,
   *            fullDays:number, overnightRestHours:number, totalHours:number,
   *            restHours:number}}
   */
  function estimateTravelTime(distanceKm, options) {
    var opts = options || {};
    var distance = Number(distanceKm);
    if (!isFinite(distance)) {
      throw new TypeError('estimateTravelTime: distanceKm must be a finite number');
    }
    var speed = Number(opts.speedKmh || CONFIG.AVG_TRUCK_SPEED_KMH);
    if (!isFinite(speed) || speed <= 0) speed = CONFIG.AVG_TRUCK_SPEED_KMH;

    if (distance <= 0) {
      return {
        distanceKm: 0,
        speedKmh: speed,
        drivingHours: 0,
        breaksCount: 0,
        breakMinutes: 0,
        breakHours: 0,
        fullDays: 0,
        overnightRestHours: 0,
        restHours: 0,
        totalHours: 0
      };
    }

    var drivingHours = distance / speed;
    var breaksCount = Math.floor(drivingHours / CONFIG.MAX_CONTINUOUS_DRIVING_H);
    var breakMinutes = breaksCount * CONFIG.MANDATORY_BREAK_MIN;
    var breakHours = breakMinutes / 60;
    var fullDays = Math.floor(drivingHours / CONFIG.MAX_DAILY_DRIVING_H);
    var overnightRestHours = fullDays * CONFIG.DAILY_REST_H;
    var totalHours = drivingHours + breakHours + overnightRestHours;

    return {
      distanceKm: distance,
      speedKmh: speed,
      drivingHours: drivingHours,
      breaksCount: breaksCount,
      breakMinutes: breakMinutes,
      breakHours: breakHours,
      fullDays: fullDays,
      overnightRestHours: overnightRestHours,
      restHours: breakHours + overnightRestHours,
      totalHours: totalHours
    };
  }

  /**
   * Expand the time model into a chronological itinerary.
   *
   * The emitted breaks and rests match `estimateTravelTime` exactly, so the
   * itinerary end time equals departure + totalHours.
   *
   * @param {number} distanceKm
   * @param {Date|string|null} departure departure time (defaults to now)
   * @param {{speedKmh?:number}} [options]
   * @returns {{events:Array, departure:Date, arrival:Date, model:Object}}
   */
  function buildItinerary(distanceKm, departure, options) {
    var model = estimateTravelTime(distanceKm, options);
    var start = departure ? new Date(departure) : new Date();
    if (isNaN(start.getTime())) start = new Date();

    var events = [];
    var cursor = new Date(start.getTime());
    var drivenHours = 0;
    var drivenKm = 0;
    var breaksEmitted = 0;
    var restsEmitted = 0;
    var sinceBreak = 0;
    var sinceRest = 0;
    var guard = 0;

    events.push({
      type: 'depart',
      titleKey: 'ev.depart',
      titleParams: {},
      at: cursor.toISOString(),
      km: 0,
      durationH: 0
    });

    while (drivenHours < model.drivingHours - 1e-9 && guard++ < 500) {
      var toBreak = CONFIG.MAX_CONTINUOUS_DRIVING_H - sinceBreak;
      var toRest = CONFIG.MAX_DAILY_DRIVING_H - sinceRest;
      var remaining = model.drivingHours - drivenHours;
      var chunk = Math.min(remaining, toBreak, toRest);
      if (chunk <= 1e-9) chunk = Math.min(remaining, CONFIG.MAX_CONTINUOUS_DRIVING_H);

      var chunkKm = chunk * model.speedKmh;
      drivenHours += chunk;
      drivenKm += chunkKm;
      sinceBreak += chunk;
      sinceRest += chunk;
      cursor = util.addHours(cursor, chunk);
      events.push({
        type: 'drive',
        titleKey: 'ev.drive',
        titleParams: { d: util.formatShortDuration(chunk) },
        at: cursor.toISOString(),
        km: Math.round(drivenKm),
        durationH: chunk
      });

      /* 45-minute break after each completed 4h30 of driving. */
      if (sinceBreak >= CONFIG.MAX_CONTINUOUS_DRIVING_H - 1e-9 && breaksEmitted < model.breaksCount) {
        breaksEmitted++;
        sinceBreak = 0;
        var breakH = CONFIG.MANDATORY_BREAK_MIN / 60;
        cursor = util.addHours(cursor, breakH);
        events.push({
          type: 'break',
          titleKey: 'ev.break',
          titleParams: { m: CONFIG.MANDATORY_BREAK_MIN },
          at: cursor.toISOString(),
          km: Math.round(drivenKm),
          durationH: breakH
        });
      }

      /* 11-hour daily rest after each completed 9h of driving. */
      if (sinceRest >= CONFIG.MAX_DAILY_DRIVING_H - 1e-9 && restsEmitted < model.fullDays) {
        restsEmitted++;
        sinceRest = 0;
        sinceBreak = 0;
        cursor = util.addHours(cursor, CONFIG.DAILY_REST_H);
        events.push({
          type: 'rest',
          titleKey: 'ev.rest',
          titleParams: { h: CONFIG.DAILY_REST_H },
          at: cursor.toISOString(),
          km: Math.round(drivenKm),
          durationH: CONFIG.DAILY_REST_H
        });
      }
    }

    /* Emit any remaining modelled breaks/rests so totals stay consistent. */
    while (breaksEmitted < model.breaksCount) {
      breaksEmitted++;
      cursor = util.addHours(cursor, CONFIG.MANDATORY_BREAK_MIN / 60);
      events.push({
        type: 'break',
        titleKey: 'ev.break',
        titleParams: { m: CONFIG.MANDATORY_BREAK_MIN },
        at: cursor.toISOString(),
        km: Math.round(drivenKm),
        durationH: CONFIG.MANDATORY_BREAK_MIN / 60
      });
    }
    while (restsEmitted < model.fullDays) {
      restsEmitted++;
      cursor = util.addHours(cursor, CONFIG.DAILY_REST_H);
      events.push({
        type: 'rest',
        titleKey: 'ev.rest',
        titleParams: { h: CONFIG.DAILY_REST_H },
        at: cursor.toISOString(),
        km: Math.round(drivenKm),
        durationH: CONFIG.DAILY_REST_H
      });
    }

    events.push({
      type: 'arrive',
      titleKey: 'ev.arrive',
      titleParams: {},
      at: cursor.toISOString(),
      km: Math.round(model.distanceKm),
      durationH: 0
    });

    return { events: events, departure: start, arrival: cursor, model: model };
  }

  /**
   * Warn when the departure or the modelled arrival falls on a weekend, when
   * many European countries enforce HGV driving bans.
   */
  function weekendWarnings(departure, arrival) {
    var warnings = [];
    if (departure && util.isWeekend(new Date(departure))) {
      warnings.push({ key: 'warn.weekendDeparture', params: {} });
    }
    if (arrival && util.isWeekend(new Date(arrival))) {
      warnings.push({ key: 'warn.weekendArrival', params: {} });
    }
    return warnings;
  }

  TRP.timeModel = {
    estimateTravelTime: estimateTravelTime,
    buildItinerary: buildItinerary,
    weekendWarnings: weekendWarnings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.timeModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
