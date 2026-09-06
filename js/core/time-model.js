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
 * Multi-manning (two drivers, Art. 7 second paragraph and Art. 8.5):
 *   the 45-minute break is taken in the passenger seat while the other
 *   driver drives, so the vehicle does not stop - the drivers change every
 *   4h30 instead; the vehicle can accumulate 9 h of driving per driver
 *   (18 h) before a daily rest of 9 h, which must fall within a 30-hour
 *   period and be taken with the vehicle stationary.
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
   * The limits that apply to a crew of the given size.
   * Anything below 2 is a single driver; 2 or more is treated as a team of two.
   *
   * @param {number} [drivers]
   * @returns {{drivers:number, multiManning:boolean, maxContinuousH:number,
   *            breakMin:number, maxDailyDrivingH:number, dailyRestH:number}}
   */
  function rulesFor(drivers) {
    var team = Number(drivers) >= 2;
    return {
      drivers: team ? 2 : 1,
      multiManning: team,
      maxContinuousH: CONFIG.MAX_CONTINUOUS_DRIVING_H,
      breakMin: team ? 0 : CONFIG.MANDATORY_BREAK_MIN,
      maxDailyDrivingH: team ? CONFIG.MAX_DAILY_DRIVING_H * 2 : CONFIG.MAX_DAILY_DRIVING_H,
      dailyRestH: team ? CONFIG.MULTI_MANNING_DAILY_REST_H : CONFIG.DAILY_REST_H
    };
  }

  /**
   * Estimate truck travel time for a road distance.
   *
   * @param {number} distanceKm road distance in kilometres
   * @param {{speedKmh?:number, drivers?:number}} [options]
   * @returns {{distanceKm:number, speedKmh:number, drivers:number,
   *            multiManning:boolean, breakMin:number, dailyRestH:number,
   *            maxDailyDrivingH:number, drivingHours:number,
   *            breaksCount:number, swapsCount:number, breakMinutes:number,
   *            breakHours:number, fullDays:number, overnightRestHours:number,
   *            totalHours:number, restHours:number}}
   */
  function estimateTravelTime(distanceKm, options) {
    var opts = options || {};
    var distance = Number(distanceKm);
    if (!isFinite(distance)) {
      throw new TypeError('estimateTravelTime: distanceKm must be a finite number');
    }
    var speed = Number(opts.speedKmh || CONFIG.AVG_TRUCK_SPEED_KMH);
    if (!isFinite(speed) || speed <= 0) speed = CONFIG.AVG_TRUCK_SPEED_KMH;
    var rules = rulesFor(opts.drivers);

    var base = {
      distanceKm: 0,
      speedKmh: speed,
      drivers: rules.drivers,
      multiManning: rules.multiManning,
      breakMin: rules.breakMin,
      dailyRestH: rules.dailyRestH,
      maxDailyDrivingH: rules.maxDailyDrivingH,
      drivingHours: 0,
      breaksCount: 0,
      swapsCount: 0,
      breakMinutes: 0,
      breakHours: 0,
      fullDays: 0,
      overnightRestHours: 0,
      restHours: 0,
      totalHours: 0
    };
    if (distance <= 0) return base;

    var drivingHours = distance / speed;
    var boundaries = Math.floor(drivingHours / rules.maxContinuousH);
    /* Every 4h30 boundary is a break stop for one driver or a change of
       driver for two. */
    var breaksCount = rules.multiManning ? 0 : boundaries;
    var swapsCount = rules.multiManning ? boundaries : 0;
    var breakMinutes = breaksCount * rules.breakMin;
    var breakHours = breakMinutes / 60;
    var fullDays = Math.floor(drivingHours / rules.maxDailyDrivingH);
    var overnightRestHours = fullDays * rules.dailyRestH;

    base.distanceKm = distance;
    base.drivingHours = drivingHours;
    base.breaksCount = breaksCount;
    base.swapsCount = swapsCount;
    base.breakMinutes = breakMinutes;
    base.breakHours = breakHours;
    base.fullDays = fullDays;
    base.overnightRestHours = overnightRestHours;
    base.restHours = breakHours + overnightRestHours;
    base.totalHours = drivingHours + breakHours + overnightRestHours;
    return base;
  }

  /**
   * Expand the time model into a chronological itinerary.
   *
   * The emitted breaks, driver changes and rests match `estimateTravelTime`
   * exactly, so the itinerary end time equals departure + totalHours.
   *
   * @param {number} distanceKm
   * @param {Date|string|null} departure departure time (defaults to now)
   * @param {{speedKmh?:number, drivers?:number}} [options]
   * @returns {{events:Array, departure:Date, arrival:Date, model:Object}}
   */
  function buildItinerary(distanceKm, departure, options) {
    var model = estimateTravelTime(distanceKm, options);
    var rules = rulesFor(model.drivers);
    var start = departure ? new Date(departure) : new Date();
    if (isNaN(start.getTime())) start = new Date();

    var events = [];
    var cursor = new Date(start.getTime());
    var drivenHours = 0;
    var drivenKm = 0;
    var breaksEmitted = 0;
    var swapsEmitted = 0;
    var restsEmitted = 0;
    var sinceBreak = 0;
    var sinceRest = 0;
    var guard = 0;

    function push(type, titleKey, titleParams, durationH) {
      events.push({
        type: type,
        titleKey: titleKey,
        titleParams: titleParams,
        at: cursor.toISOString(),
        km: Math.round(drivenKm),
        durationH: durationH
      });
    }

    function emitBreak() {
      breaksEmitted++;
      var breakH = rules.breakMin / 60;
      cursor = util.addHours(cursor, breakH);
      push('break', 'ev.break', { m: rules.breakMin }, breakH);
    }

    function emitSwap() {
      swapsEmitted++;
      push('swap', 'ev.swap', {}, 0);
    }

    function emitRest() {
      restsEmitted++;
      cursor = util.addHours(cursor, rules.dailyRestH);
      push('rest', 'ev.rest', { h: rules.dailyRestH }, rules.dailyRestH);
    }

    push('depart', 'ev.depart', {}, 0);

    while (drivenHours < model.drivingHours - 1e-9 && guard++ < 500) {
      var toBreak = rules.maxContinuousH - sinceBreak;
      var toRest = rules.maxDailyDrivingH - sinceRest;
      var remaining = model.drivingHours - drivenHours;
      var chunk = Math.min(remaining, toBreak, toRest);
      if (chunk <= 1e-9) chunk = Math.min(remaining, rules.maxContinuousH);

      var chunkKm = chunk * model.speedKmh;
      drivenHours += chunk;
      drivenKm += chunkKm;
      sinceBreak += chunk;
      sinceRest += chunk;
      cursor = util.addHours(cursor, chunk);
      push('drive', 'ev.drive', { d: util.formatShortDuration(chunk) }, chunk);

      /* After each completed 4h30: a 45-minute break, or a change of driver
         when the second driver has been resting in the passenger seat. */
      if (sinceBreak >= rules.maxContinuousH - 1e-9) {
        sinceBreak = 0;
        if (rules.multiManning) {
          if (swapsEmitted < model.swapsCount) emitSwap();
        } else if (breaksEmitted < model.breaksCount) {
          emitBreak();
        }
      }

      /* Daily rest after each completed driving day of the crew. */
      if (sinceRest >= rules.maxDailyDrivingH - 1e-9 && restsEmitted < model.fullDays) {
        sinceRest = 0;
        sinceBreak = 0;
        emitRest();
      }
    }

    /* Emit any remaining modelled breaks/changes/rests so totals stay consistent. */
    while (breaksEmitted < model.breaksCount) emitBreak();
    while (swapsEmitted < model.swapsCount) emitSwap();
    while (restsEmitted < model.fullDays) emitRest();

    drivenKm = model.distanceKm;
    push('arrive', 'ev.arrive', {}, 0);

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
    rulesFor: rulesFor,
    estimateTravelTime: estimateTravelTime,
    buildItinerary: buildItinerary,
    weekendWarnings: weekendWarnings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.timeModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
