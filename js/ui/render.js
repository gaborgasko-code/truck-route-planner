/**
 * Truck Route Planner - shared result renderers.
 *
 * Pure functions that turn a route plan into HTML fragments or a plain-text
 * report. Both the desktop and the mobile front end use them, so the two
 * builds always show identical figures.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var esc = util.escapeHtml;

  function flag(code) {
    var f = util.countryFlag(code);
    return f ? '<span class="flag">' + f + '</span> ' : '';
  }

  /* ------------------------------------------------------------- summary */

  function statTile(label, value, sub, tone) {
    return '<div class="stat' + (tone ? ' stat--' + tone : '') + '">' +
      '<div class="stat__label">' + esc(label) + '</div>' +
      '<div class="stat__value">' + value + '</div>' +
      (sub ? '<div class="stat__sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function summaryHtml(r) {
    var t = r.time;
    var tiles = [
      statTile('Road distance', util.formatNumber(r.route.distanceKm, 1) + ' <span class="unit">km</span>',
        'OSRM road network'),
      statTile('Total trip time', esc(util.formatDuration(t.totalHours)),
        'incl. breaks and daily rest', 'accent'),
      statTile('Pure driving', esc(util.formatDuration(t.drivingHours)),
        'at ' + util.formatNumber(t.speedKmh, 0) + ' km/h average'),
      statTile('Estimated arrival', esc(util.formatDateTime(r.arrival)),
        'departure ' + esc(util.formatDateTime(r.departure))),
      statTile('Toll estimate', util.formatNumber(r.costs.toll, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>',
        r.tolls.countries.length + ' country segment(s)', 'toll'),
      statTile('Fuel estimate', util.formatNumber(r.costs.fuel, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>',
        r.fuel.applicable ? util.formatNumber(r.fuel.liters, 0) + ' l at ' + util.formatNumber(r.fuel.price, 2) + ' ' + CONFIG.CURRENCY + '/l' : 'not configured'),
      statTile('Total run cost', util.formatNumber(r.costs.total, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>',
        util.formatNumber(r.costs.perKm, 3) + ' ' + CONFIG.CURRENCY + '/km', 'accent'),
      statTile('Legal breaks', String(t.breaksCount) + ' <span class="unit">x 45 min</span>',
        t.fullDays + ' daily rest(s) of ' + CONFIG.DAILY_REST_H + ' h')
    ];

    return '<div class="route-heading">' +
      '<div class="route-heading__row"><span class="pill pill--origin">A</span><span>' + esc(r.origin.label) + '</span></div>' +
      '<div class="route-heading__row"><span class="pill pill--dest">B</span><span>' + esc(r.destination.label) + '</span></div>' +
      '<div class="route-heading__meta">' + esc(r.countries.map(function (c) { return c; }).join(' → ') || 'route countries unavailable') + '</div>' +
      '</div>' +
      '<div class="stat-grid">' + tiles.join('') + '</div>';
  }

  /* ----------------------------------------------------------- itinerary */


  function itineraryHtml(r) {
    if (!r.itinerary || !r.itinerary.length) return '<p class="muted">No itinerary available.</p>';
    var rows = r.itinerary.map(function (ev) {
      var icon = ev.type === 'break' ? '☕' : ev.type === 'rest' ? '☽' :
        ev.type === 'depart' ? '▶' : ev.type === 'arrive' ? '⚑' : '→';
      return '<li class="tl__item tl__item--' + esc(ev.type) + '">' +
        '<span class="tl__icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="tl__body">' +
        '<span class="tl__title">' + esc(ev.title) + '</span>' +
        '<span class="tl__meta">' + esc(util.formatDateTime(ev.at)) +
        (ev.km ? ' &middot; km ' + util.formatNumber(ev.km, 0) : '') + '</span>' +
        '</span></li>';
    });
    return '<ol class="tl">' + rows.join('') + '</ol>' +
      '<p class="note">Breaks and daily rests are applied cumulatively, so the arrival time is a ' +
      'conservative worst case. Actual scheduling depends on tachograph history and loading windows.</p>';
  }

  /* --------------------------------------------------------------- tolls */

  function tollsHtml(r) {
    var t = r.tolls;
    if (!t.countries.length) {
      return '<p class="muted">No toll segments could be determined for this route.</p>';
    }
    var rows = t.countries.map(function (c) {
      return '<tr' + (c.known ? '' : ' class="row--warn"') + '>' +
        '<td>' + flag(c.country) + '<strong>' + esc(c.country) + '</strong> <span class="muted">' + esc(c.name) + '</span></td>' +
        '<td class="num">' + util.formatNumber(c.km, 1) + '</td>' +
        '<td class="num">' + util.formatNumber(c.rate, 2) + '</td>' +
        '<td class="num">' + util.formatNumber(c.effectiveRate, 3) + '</td>' +
        '<td class="num strong">' + util.formatNumber(c.cost, 2) + '</td>' +
        '<td class="muted small">' + esc(c.system || '-') + '</td>' +
        '</tr>';
    });

    var extra = '';
    if (t.unclassifiedKm > 0) {
      extra = '<tr class="row--warn"><td>Unclassified</td><td class="num">' +
        util.formatNumber(t.unclassifiedKm, 1) + '</td><td class="num">-</td><td class="num">-</td>' +
        '<td class="num">0.00</td><td class="muted small">country not resolved</td></tr>';
    }

    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Country</th><th class="num">km</th><th class="num">Base ' + CONFIG.CURRENCY + '/km</th>' +
      '<th class="num">Applied ' + CONFIG.CURRENCY + '/km</th><th class="num">Cost</th><th>Toll system</th></tr></thead>' +
      '<tbody>' + rows.join('') + extra + '</tbody>' +
      '<tfoot><tr><th>Total</th><th class="num">' + util.formatNumber(t.totalKm, 1) + '</th>' +
      '<th></th><th></th><th class="num">' + util.formatNumber(t.totalCost, 2) + '</th><th></th></tr></tfoot>' +
      '</table></div>' +
      '<p class="note">Vehicle factor <strong>' + util.formatNumber(t.vehicleFactor, 3) + '</strong> applied ' +
      '(' + util.formatNumber(r.vehicle.weightT, 1) + ' t, ' + esc(String(r.vehicle.axles)) + ' axles, EURO ' +
      esc(r.vehicle.euroClass) + '). Sampling interval ' + util.formatNumber(r.countryLookups.intervalKm, 0) + ' km, ' +
      r.countryLookups.network + ' reverse-geocode call(s). ' +
      'Vignette countries appear at 0.00 ' + CONFIG.CURRENCY + '/km - buy those separately.</p>';
  }

  /* ------------------------------------------------------ stops, parking */

  function parkingBadge(p) {
    return p.secured
      ? '<span class="badge badge--secure">Secured L' + (p.security_level || 3) + '</span>'
      : '<span class="badge badge--standard">Standard</span>';
  }

  function stopsHtml(r) {
    if (!r.stops || !r.stops.length) {
      return '<p class="muted">The route is shorter than the ' + CONFIG.REST_STOP_INTERVAL_KM +
        ' km stop interval, so no intermediate stop is suggested.</p>';
    }
    var blocks = r.stops.map(function (stop) {
      var parkings = (stop.parkings || []).map(function (p) {
        return '<li class="pk">' +
          '<div class="pk__head">' + parkingBadge(p) +
          '<strong>' + esc(p.name) + '</strong>' +
          '<span class="muted">' + flag(p.country) + esc(p.city || p.country) + '</span></div>' +
          '<div class="pk__meta">' + util.formatNumber(p.distanceKm, 1) + ' km from the stop &middot; ' +
          (p.spaces ? p.spaces + ' spaces &middot; ' : '') + esc(p.access || '') + '</div>' +
          '<div class="pk__facilities">' + (p.facilities || []).map(function (f) {
            return '<span class="chip chip--sm">' + esc(f) + '</span>';
          }).join('') + '</div>' +
          '</li>';
      }).join('');

      return '<section class="stop-card">' +
        '<header class="stop-card__head">' +
        '<span class="stop-card__no">' + stop.index + '</span>' +
        '<div><h4>Rest stop at km ' + util.formatNumber(stop.km, 0) + '</h4>' +
        '<span class="muted small">' + stop.lat.toFixed(4) + ', ' + stop.lon.toFixed(4) + '</span></div>' +
        (stop.hasSecured ? '<span class="badge badge--secure">secured parking nearby</span>' : '') +
        '</header>' +
        (parkings
          ? '<ul class="pk-list">' + parkings + '</ul>'
          : '<p class="muted small">No safe parking within ' + CONFIG.PARKING_SEARCH_RADIUS_KM +
            ' km in the sample dataset - plan a service area manually.</p>') +
        '</section>';
    });
    return blocks.join('');
  }

  /* --------------------------------------------------------- regulations */

  function regulationsHtml(r, expanded) {
    var blocks = (r.regulations || []).map(function (entry) {
      var rules = (expanded ? entry.allRules : entry.rules).map(function (rule) {
        return '<li>' + esc(rule) + '</li>';
      }).join('');
      return '<details class="reg" open>' +
        '<summary>' + flag(entry.country) + '<strong>' + esc(entry.country) + '</strong> ' + esc(entry.name) +
        (entry.fallback ? ' <span class="badge badge--standard">EU baseline</span>' : '') + '</summary>' +
        '<ul class="reg__list">' + rules + '</ul></details>';
    });

    var base = r.baselineRegulations;
    if (base) {
      blocks.push('<details class="reg reg--baseline"><summary><strong>EU</strong> ' + esc(base.name) + '</summary>' +
        '<ul class="reg__list">' + base.allRules.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></details>');
    }

    return blocks.join('') +
      '<p class="warn-box"><strong>Verify before departure.</strong> Driving bans, holiday calendars, ' +
      'winter equipment periods and dimension limits change frequently and differ by region. ' +
      'These notes are a planning aid, not legal advice.</p>';
  }

  /* ------------------------------------------------------------ warnings */

  function warningsHtml(r) {
    if (!r.warnings || !r.warnings.length) return '';
    return '<ul class="warn-list">' + r.warnings.map(function (w) {
      return '<li>' + esc(w) + '</li>';
    }).join('') + '</ul>';
  }

  /* --------------------------------------------------------- text report */

  function line(char, width) {
    return new Array((width || 64) + 1).join(char || '-');
  }

  function textReport(r) {
    var L = [];
    var t = r.time;
    L.push(CONFIG.APP_NAME + ' v' + CONFIG.APP_VERSION + ' - route report');
    L.push(CONFIG.AUTHOR);
    L.push(line('='));
    L.push('Generated : ' + util.formatDateTime(r.createdAt));
    L.push('Origin    : ' + r.origin.label);
    L.push('Destination: ' + r.destination.label);
    L.push('Countries : ' + (r.countries.join(' -> ') || 'n/a'));
    L.push('');
    L.push('DISTANCE AND TIME');
    L.push(line());
    L.push('Road distance        : ' + util.formatNumber(r.route.distanceKm, 1) + ' km');
    L.push('Average truck speed  : ' + util.formatNumber(t.speedKmh, 0) + ' km/h');
    L.push('Pure driving time    : ' + util.formatDuration(t.drivingHours));
    L.push('Mandatory breaks     : ' + t.breaksCount + ' x ' + CONFIG.MANDATORY_BREAK_MIN +
      ' min = ' + util.formatDuration(t.breakHours));
    L.push('Daily rest periods   : ' + t.fullDays + ' x ' + CONFIG.DAILY_REST_H +
      ' h = ' + util.formatDuration(t.overnightRestHours));
    L.push('TOTAL TRIP TIME      : ' + util.formatDuration(t.totalHours));
    L.push('Departure            : ' + util.formatDateTime(r.departure));
    L.push('Estimated arrival    : ' + util.formatDateTime(r.arrival));
    L.push('');
    L.push('COST ESTIMATE (' + CONFIG.CURRENCY + ')');
    L.push(line());
    r.tolls.countries.forEach(function (c) {
      L.push('  ' + c.country + ' ' + (c.name + '                    ').slice(0, 20) +
        util.formatNumber(c.km, 1).padStart(9) + ' km  x ' +
        util.formatNumber(c.effectiveRate, 3) + '  = ' + util.formatNumber(c.cost, 2).padStart(9));
    });
    if (r.tolls.unclassifiedKm > 0) {
      L.push('  -- unclassified      ' + util.formatNumber(r.tolls.unclassifiedKm, 1).padStart(9) + ' km  (excluded)');
    }
    L.push('  Toll total           : ' + util.formatNumber(r.costs.toll, 2) + ' ' + CONFIG.CURRENCY);
    L.push('  Fuel estimate        : ' + util.formatNumber(r.costs.fuel, 2) + ' ' + CONFIG.CURRENCY +
      (r.fuel.applicable ? ' (' + util.formatNumber(r.fuel.liters, 0) + ' l)' : ''));
    L.push('  TOTAL RUN COST       : ' + util.formatNumber(r.costs.total, 2) + ' ' + CONFIG.CURRENCY);
    L.push('');
    L.push('SUGGESTED REST STOPS (every ' + CONFIG.REST_STOP_INTERVAL_KM + ' km)');
    L.push(line());
    if (!r.stops.length) {
      L.push('  none - route shorter than the stop interval');
    } else {
      r.stops.forEach(function (s) {
        L.push('  #' + s.index + '  km ' + util.formatNumber(s.km, 0) +
          '  (' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) + ')');
        if (!s.parkings.length) {
          L.push('        no safe parking within ' + CONFIG.PARKING_SEARCH_RADIUS_KM + ' km');
        }
        s.parkings.forEach(function (p) {
          L.push('        ' + (p.secured ? '[SECURED]' : '[standard]') + ' ' + p.name +
            ' (' + p.country + ') - ' + util.formatNumber(p.distanceKm, 1) + ' km');
        });
      });
    }
    L.push('');
    L.push('NATIONAL REGULATIONS (top ' + CONFIG.REGULATIONS_PER_COUNTRY + ' per country)');
    L.push(line());
    (r.regulations || []).forEach(function (entry) {
      L.push('  ' + entry.country + ' - ' + entry.name + (entry.fallback ? ' (EU baseline)' : ''));
      entry.rules.forEach(function (rule) { L.push('     * ' + rule); });
    });
    if (r.warnings && r.warnings.length) {
      L.push('');
      L.push('WARNINGS');
      L.push(line());
      r.warnings.forEach(function (w) { L.push('  ! ' + w); });
    }
    L.push('');
    L.push(line('='));
    L.push(CONFIG.DISCLAIMER);
    L.push(CONFIG.AUTHOR);
    return L.join('\n');
  }

  TRP.render = {
    summaryHtml: summaryHtml,
    itineraryHtml: itineraryHtml,
    tollsHtml: tollsHtml,
    stopsHtml: stopsHtml,
    regulationsHtml: regulationsHtml,
    warningsHtml: warningsHtml,
    textReport: textReport,
    statTile: statTile
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
