/**
 * Truck Route Planner - shared result renderers.
 *
 * Pure functions that turn a route plan into HTML fragments or a plain-text
 * report, in the active language. Both the desktop and the mobile front end
 * use them, so the two builds always show identical figures.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var esc = util.escapeHtml;

  function t(key, params) {
    return TRP.i18n ? TRP.i18n.t(key, params) : key;
  }
  function term(prefix, value) {
    return TRP.i18n ? TRP.i18n.term(prefix, value) : value;
  }

  function flag(code) {
    var f = util.countryFlag(code);
    return f ? '<span class="flag">' + f + '</span> ' : '';
  }

  /** Warnings travel as `{key, params}`; tolerate plain strings too. */
  function warningText(warning) {
    if (warning == null) return '';
    if (typeof warning === 'string') return warning;
    return t(warning.key, warning.params);
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
    var m = r.time;
    var cur = CONFIG.CURRENCY;
    var tiles = [
      statTile(t('stat.roadDistance'), util.formatNumber(r.route.distanceKm, 1) + ' <span class="unit">km</span>',
        esc(t('stat.roadNetwork'))),
      statTile(t('stat.totalTime'), esc(util.formatDuration(m.totalHours)),
        esc(t('stat.totalTimeSub')), 'accent'),
      statTile(t('stat.pureDriving'), esc(util.formatDuration(m.drivingHours)),
        esc(t('stat.atAverage', { speed: util.formatNumber(m.speedKmh, 0) }))),
      statTile(t('stat.arrival'), esc(util.formatDateTime(r.arrival)),
        esc(t('stat.departureAt', { time: util.formatDateTime(r.departure) }))),
      statTile(t('stat.toll'), util.formatNumber(r.costs.toll, 2) + ' <span class="unit">' + cur + '</span>',
        esc(t('stat.countrySegments', { n: r.tolls.countries.length })), 'toll'),
      statTile(t('stat.fuel'), util.formatNumber(r.costs.fuel, 2) + ' <span class="unit">' + cur + '</span>',
        esc(r.fuel.applicable
          ? t('stat.fuelSub', {
            liters: util.formatNumber(r.fuel.liters, 0),
            price: util.formatNumber(r.fuel.price, 2),
            cur: cur
          })
          : t('stat.notConfigured'))),
      statTile(t('stat.totalCost'), util.formatNumber(r.costs.total, 2) + ' <span class="unit">' + cur + '</span>',
        util.formatNumber(r.costs.perKm, 3) + ' ' + cur + '/km', 'accent'),
      m.multiManning
        ? statTile(t('stat.driverSwaps'), String(m.swapsCount) + ' <span class="unit">' + esc(t('stat.every430')) + '</span>',
          esc(t('stat.legalBreaksSub', { days: m.fullDays, h: m.dailyRestH })))
        : statTile(t('stat.legalBreaks'), String(m.breaksCount) + ' <span class="unit">' + esc(t('stat.times45')) + '</span>',
          esc(t('stat.legalBreaksSub', { days: m.fullDays, h: m.dailyRestH })))
    ];

    return '<div class="route-heading">' +
      '<div class="route-heading__row"><span class="pill pill--origin">A</span><span>' + esc(r.origin.label) + '</span></div>' +
      '<div class="route-heading__row"><span class="pill pill--dest">B</span><span>' + esc(r.destination.label) + '</span></div>' +
      '<div class="route-heading__meta">' +
      esc(r.countries.join(' → ') || t('overview.routeCountriesNA')) + '</div>' +
      '</div>' +
      '<div class="stat-grid">' + tiles.join('') + '</div>';
  }

  /** Inline SVG for an icon name; empty when the icon module is absent (tests). */
  function iconFor(name) {
    return TRP.icons ? TRP.icons.svg(name) : '';
  }

  /* ----------------------------------------------------------- itinerary */

  function eventTitle(ev) {
    return ev.titleKey ? t(ev.titleKey, ev.titleParams) : (ev.title || '');
  }

  function itineraryHtml(r) {
    if (!r.itinerary || !r.itinerary.length) return '<p class="muted">-</p>';
    var rows = r.itinerary.map(function (ev) {
      var icon = iconFor({ 'break': 'coffee', rest: 'moon', depart: 'play', arrive: 'flag', swap: 'swap' }[ev.type] || 'navigation');
      return '<li class="tl__item tl__item--' + esc(ev.type) + '">' +
        '<span class="tl__icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="tl__body">' +
        '<span class="tl__title">' + esc(eventTitle(ev)) + '</span>' +
        '<span class="tl__meta">' + esc(util.formatDateTime(ev.at)) +
        (ev.km ? ' &middot; km ' + util.formatNumber(ev.km, 0) : '') + '</span>' +
        '</span></li>';
    });
    return '<ol class="tl">' + rows.join('') + '</ol>' +
      '<p class="note">' + esc(t('itinerary.note')) + '</p>';
  }

  /* --------------------------------------------------------------- tolls */

  function tollsHtml(r) {
    var d = r.tolls;
    var cur = CONFIG.CURRENCY;
    if (!d.countries.length) {
      return '<p class="muted">' + esc(t('toll.none')) + '</p>';
    }
    var rows = d.countries.map(function (c) {
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
    if (d.unclassifiedKm > 0) {
      extra = '<tr class="row--warn"><td>' + esc(t('toll.unclassified')) + '</td><td class="num">' +
        util.formatNumber(d.unclassifiedKm, 1) + '</td><td class="num">-</td><td class="num">-</td>' +
        '<td class="num">' + util.formatNumber(0, 2) + '</td><td class="muted small">' +
        esc(t('toll.notResolved')) + '</td></tr>';
    }

    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>' + esc(t('toll.country')) + '</th><th class="num">' + esc(t('toll.km')) + '</th>' +
      '<th class="num">' + esc(t('toll.baseRate', { cur: cur })) + '</th>' +
      '<th class="num">' + esc(t('toll.appliedRate', { cur: cur })) + '</th>' +
      '<th class="num">' + esc(t('toll.cost')) + '</th><th>' + esc(t('toll.system')) + '</th></tr></thead>' +
      '<tbody>' + rows.join('') + extra + '</tbody>' +
      '<tfoot><tr><th>' + esc(t('toll.total')) + '</th><th class="num">' + util.formatNumber(d.totalKm, 1) + '</th>' +
      '<th></th><th></th><th class="num">' + util.formatNumber(d.totalCost, 2) + '</th><th></th></tr></tfoot>' +
      '</table></div>' +
      '<p class="note">' + t('toll.note', {
        factor: util.formatNumber(d.vehicleFactor, 3),
        weight: util.formatNumber(r.vehicle.weightT, 1),
        axles: esc(String(r.vehicle.axles)),
        euro: esc(r.vehicle.euroClass),
        interval: util.formatNumber(r.countryLookups.intervalKm, 0),
        calls: r.countryLookups.network,
        cur: cur
      }) + '</p>';
  }

  /* ------------------------------------------------------ stops, parking */

  function parkingBadge(p) {
    return p.secured
      ? '<span class="badge badge--secure">' + esc(t('stops.secured', { level: p.security_level || 3 })) + '</span>'
      : '<span class="badge badge--standard">' + esc(t('stops.standard')) + '</span>';
  }

  function stopsHtml(r) {
    if (!r.stops || !r.stops.length) {
      return '<p class="muted">' + esc(t('stops.tooShort', { interval: CONFIG.REST_STOP_INTERVAL_KM })) + '</p>';
    }
    return r.stops.map(function (stop) {
      var parkings = (stop.parkings || []).map(function (p) {
        var chips = (p.facilities || []).map(function (f) {
          return '<span class="chip chip--sm">' + esc(term('fac', f)) + '</span>';
        }).join('');
        if (p.booking) {
          chips += '<span class="chip chip--sm">' + esc(term('booking', p.booking)) + '</span>';
        }
        return '<li class="pk">' +
          '<div class="pk__head">' + parkingBadge(p) +
          '<strong>' + esc(p.name) + '</strong>' +
          '<span class="muted">' + flag(p.country) + esc(p.city || p.country) + '</span></div>' +
          '<div class="pk__meta">' + esc(t('stops.fromStop', { km: util.formatNumber(p.distanceKm, 1) })) +
          (p.spaces ? ' &middot; ' + esc(t('stops.spaces', { n: p.spaces })) : '') +
          (p.access ? ' &middot; ' + esc(p.access) : '') + '</div>' +
          '<div class="pk__facilities">' + chips + '</div>' +
          '</li>';
      }).join('');

      return '<section class="stop-card">' +
        '<header class="stop-card__head">' +
        '<span class="stop-card__no">' + stop.index + '</span>' +
        '<div><h4>' + esc(t('stops.restStop', { km: util.formatNumber(stop.km, 0) })) + '</h4>' +
        '<span class="muted small">' + stop.lat.toFixed(4) + ', ' + stop.lon.toFixed(4) + '</span></div>' +
        (stop.hasSecured ? '<span class="badge badge--secure">' + esc(t('stops.securedNearby')) + '</span>' : '') +
        '</header>' +
        (parkings
          ? '<ul class="pk-list">' + parkings + '</ul>'
          : '<p class="muted small">' +
            esc(t('stops.noneNearby', { radius: CONFIG.PARKING_SEARCH_RADIUS_KM })) + '</p>') +
        '</section>';
    }).join('');
  }

  /* --------------------------------------------------------- regulations */

  function regulationsHtml(r, expanded) {
    var blocks = (r.regulations || []).map(function (entry) {
      var rules = (expanded ? entry.allRules : entry.rules).map(function (rule) {
        return '<li>' + esc(rule) + '</li>';
      }).join('');
      return '<details class="reg" open>' +
        '<summary>' + flag(entry.country) + '<strong>' + esc(entry.country) + '</strong> ' + esc(entry.name) +
        (entry.fallback ? ' <span class="badge badge--standard">' + esc(t('reg.euBaseline')) + '</span>' : '') +
        '</summary><ul class="reg__list">' + rules + '</ul></details>';
    });

    var base = r.baselineRegulations;
    if (base) {
      blocks.push('<details class="reg reg--baseline"><summary><strong>EU</strong> ' + esc(base.name) + '</summary>' +
        '<ul class="reg__list">' + base.allRules.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></details>');
    }

    return blocks.join('') + '<p class="warn-box">' + t('reg.verify') + '</p>';
  }

  /* ------------------------------------------------------- legal stops */

  var LEGAL_ICONS = { 'break': 'coffee', dailyRest: 'moon', weeklyRest: 'bed' };

  /** The stops the regulation requires, with the article behind each one. */
  function legalPlanHtml(r) {
    var legal = r.legal;
    if (!legal || !legal.plan.length) {
      return '<p class="muted">' + esc(t('legal.noStops')) + '</p>';
    }
    var rows = legal.plan.map(function (stop) {
      return '<li class="ls">' +
        '<span class="ls__icon" aria-hidden="true">' + iconFor(LEGAL_ICONS[stop.type] || 'pause') + '</span>' +
        '<div class="ls__body">' +
        '<div class="ls__head">' +
        '<strong>' + esc(t('legal.type.' + stop.type)) + '</strong>' +
        '<span class="badge badge--secure">' + esc(t('legal.minDuration')) + ': ' +
        esc(util.formatShortDuration(stop.minMinutes / 60)) + '</span>' +
        '<span class="chip chip--sm">' + esc(stop.article) + '</span>' +
        '</div>' +
        '<div class="ls__meta">' + esc(util.formatDateTime(stop.at)) +
        ' &middot; ' + esc(t('legal.atKm', { km: util.formatNumber(stop.km, 0) })) +
        ' &middot; ' + esc(t('legal.afterDriving', { h: util.formatShortDuration(stop.drivenH) })) + '</div>' +
        (stop.altKey
          ? '<div class="ls__alt"><em>' + esc(t('legal.alternative')) + ':</em> ' + esc(t(stop.altKey)) + '</div>'
          : '') +
        '</div></li>';
    });
    return '<ol class="ls-list">' + rows.join('') + '</ol>';
  }

  /** Trip measured against the driving-time ceilings. */
  function legalChecksHtml(r) {
    var legal = r.legal;
    if (!legal || !legal.checks.length) return '';
    var rows = legal.checks.map(function (check) {
      var note = check.noteKey ? t(check.noteKey, check.noteParams) : '';
      return '<tr class="' + (check.ok ? '' : 'row--warn') + '">' +
        '<td>' + esc(t(check.labelKey)) + '</td>' +
        '<td class="num strong">' + esc(String(check.value)) + '</td>' +
        '<td class="num muted">' + esc(String(check.limit)) + '</td>' +
        '<td><span class="badge ' + (check.ok ? 'badge--secure' : 'badge--warn') + '">' +
        esc(check.ok ? t('legal.ok') : t('legal.attention')) + '</span></td>' +
        '<td class="muted small">' + esc(note) + '</td></tr>';
    });
    return '<div class="table-wrap"><table class="data-table">' +
      '<tbody>' + rows.join('') + '</tbody></table></div>';
  }

  /** The reference rules from the EU dataset, grouped by topic. */
  function legalRulesHtml(r, doc) {
    var source = doc || (r && r.data && r.data.euRules);
    var groups = TRP.euRules.groups(source);
    if (!groups.length) return '';
    var blocks = groups.map(function (group) {
      var items = group.rules.map(function (rule) {
        return '<li><span class="chip chip--sm">' + esc(rule.article) + '</span> ' + esc(rule.text) + '</li>';
      }).join('');
      return '<details class="reg"><summary>' +
        '<strong>' + esc(group.title) + '</strong></summary>' +
        '<ul class="reg__list reg__list--articles">' + items + '</ul></details>';
    });
    var scope = TRP.euRules.scopeText(source);
    var disclaimer = TRP.euRules.disclaimerText(source);
    return (scope ? '<p class="note">' + esc(scope) + '</p>' : '') +
      blocks.join('') +
      (disclaimer ? '<p class="warn-box">' + esc(disclaimer) + '</p>' : '');
  }

  /** Whole legal-stops view: plan, checks and reference rules. */
  function legalHtml(r, doc) {
    var hasPlan = r && r.legal;
    return '<div class="card"><div class="card__title">' + esc(t('legal.planTitle')) + '</div>' +
      (hasPlan ? legalPlanHtml(r) : '<p class="muted">' + esc(t('legal.empty')) + '</p>') +
      '<p class="warn-box">' + t(r.time && r.time.multiManning ? 'legal.disclaimerTeam' : 'legal.disclaimer') + '</p></div>' +
      (hasPlan
        ? '<div class="card"><div class="card__title">' + esc(t('legal.checksTitle')) + '</div>' +
          legalChecksHtml(r) + '</div>'
        : '') +
      '<div class="card"><div class="card__title">' + esc(t('legal.rulesTitle')) + '</div>' +
      legalRulesHtml(r, doc) + '</div>';
  }

  /* ------------------------------------------------------------ warnings */

  function warningsHtml(r) {
    if (!r.warnings || !r.warnings.length) return '';
    return '<ul class="warn-list">' + r.warnings.map(function (w) {
      return '<li>' + esc(warningText(w)) + '</li>';
    }).join('') + '</ul>';
  }

  /* --------------------------------------------------------- text report */

  function line(char, width) {
    return new Array((width || 64) + 1).join(char || '-');
  }

  /**
   * Pad to a column width, always leaving at least one space so translated
   * labels that overrun the column never collide with the value after them.
   */
  function pad(text, width) {
    var s = String(text);
    return s.length >= width ? s + ' ' : s + new Array(width - s.length + 1).join(' ');
  }

  function textReport(r) {
    var L = [];
    var m = r.time;
    var cur = CONFIG.CURRENCY;
    L.push(CONFIG.APP_NAME + ' v' + CONFIG.APP_VERSION + ' - ' + t('report.header'));
    L.push(CONFIG.AUTHOR);
    L.push(line('='));
    L.push(pad(t('report.generated'), 22) + ': ' + util.formatDateTime(r.createdAt));
    L.push(pad(t('report.origin'), 22) + ': ' + r.origin.label);
    L.push(pad(t('report.destination'), 22) + ': ' + r.destination.label);
    L.push(pad(t('report.countries'), 22) + ': ' + (r.countries.join(' -> ') || '-'));
    L.push('');
    L.push(t('report.sectionTime'));
    L.push(line());
    L.push(pad(t('report.roadDistance'), 22) + ': ' + util.formatNumber(r.route.distanceKm, 1) + ' km');
    L.push(pad(t('report.avgSpeed'), 22) + ': ' + util.formatNumber(m.speedKmh, 0) + ' km/h');
    L.push(pad(t('report.pureDriving'), 22) + ': ' + util.formatDuration(m.drivingHours));
    L.push(pad(t('report.drivers'), 22) + ': ' + m.drivers + (m.multiManning ? ' (' + t('report.teamDriving') + ')' : ''));
    if (m.multiManning) {
      L.push(pad(t('report.swaps'), 22) + ': ' + m.swapsCount);
    } else {
      L.push(pad(t('report.breaks'), 22) + ': ' + m.breaksCount + ' x ' + m.breakMin +
        ' min = ' + util.formatDuration(m.breakHours));
    }
    L.push(pad(t('report.dailyRests'), 22) + ': ' + m.fullDays + ' x ' + m.dailyRestH +
      ' h = ' + util.formatDuration(m.overnightRestHours));
    L.push(pad(t('report.totalTime'), 22) + ': ' + util.formatDuration(m.totalHours));
    L.push(pad(t('report.departure'), 22) + ': ' + util.formatDateTime(r.departure));
    L.push(pad(t('report.arrival'), 22) + ': ' + util.formatDateTime(r.arrival));
    L.push('');
    L.push(t('report.sectionCost') + ' (' + cur + ')');
    L.push(line());
    r.tolls.countries.forEach(function (c) {
      L.push('  ' + c.country + ' ' + pad(c.name, 20).slice(0, 20) +
        pad(util.formatNumber(c.km, 1), 10) + ' km  x ' +
        util.formatNumber(c.effectiveRate, 3) + '  = ' + pad(util.formatNumber(c.cost, 2), 10));
    });
    if (r.tolls.unclassifiedKm > 0) {
      L.push('  -- ' + pad(t('toll.unclassified'), 20).slice(0, 20) +
        pad(util.formatNumber(r.tolls.unclassifiedKm, 1), 10) + ' km  (' + t('report.excludedNote') + ')');
    }
    L.push('  ' + pad(t('report.tollTotal'), 22) + ': ' + util.formatNumber(r.costs.toll, 2) + ' ' + cur);
    L.push('  ' + pad(t('report.fuelEstimate'), 22) + ': ' + util.formatNumber(r.costs.fuel, 2) + ' ' + cur +
      (r.fuel.applicable ? ' (' + util.formatNumber(r.fuel.liters, 0) + ' l)' : ''));
    L.push('  ' + pad(t('report.totalCost'), 22) + ': ' + util.formatNumber(r.costs.total, 2) + ' ' + cur);
    L.push('');

    /* ---- mandatory legal stops ---- */
    L.push(t('report.sectionLegal'));
    L.push(line());
    if (r.legal && r.legal.plan.length) {
      r.legal.plan.forEach(function (stop) {
        L.push('  ' + pad(t('legal.type.' + stop.type), 20) +
          util.formatDateTime(stop.at) + '  km ' + util.formatNumber(stop.km, 0) +
          '  min. ' + util.formatShortDuration(stop.minMinutes / 60) + '  [' + stop.article + ']');
      });
    } else {
      L.push('  ' + t('legal.noStops'));
    }
    if (r.legal && r.legal.checks.length) {
      L.push('');
      L.push('  ' + t('report.sectionChecks'));
      r.legal.checks.forEach(function (check) {
        L.push('   ' + (check.ok ? '[OK] ' : '[!!] ') + pad(t(check.labelKey), 34) +
          check.value + '  /  ' + check.limit);
      });
    }
    L.push('');

    L.push(t('report.sectionStops', { interval: CONFIG.REST_STOP_INTERVAL_KM }));
    L.push(line());
    if (!r.stops.length) {
      L.push('  ' + t('report.noStops'));
    } else {
      r.stops.forEach(function (s) {
        L.push('  #' + s.index + '  km ' + util.formatNumber(s.km, 0) +
          '  (' + s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) + ')');
        if (!s.parkings.length) {
          L.push('        ' + t('report.noParking', { radius: CONFIG.PARKING_SEARCH_RADIUS_KM }));
        }
        s.parkings.forEach(function (p) {
          L.push('        ' + (p.secured ? '[***]' : '[ - ]') + ' ' + p.name +
            ' (' + p.country + ') - ' + util.formatNumber(p.distanceKm, 1) + ' km');
        });
      });
    }
    L.push('');
    L.push(t('report.sectionRegs', { n: CONFIG.REGULATIONS_PER_COUNTRY }));
    L.push(line());
    (r.regulations || []).forEach(function (entry) {
      L.push('  ' + entry.country + ' - ' + entry.name + (entry.fallback ? ' (' + t('reg.euBaseline') + ')' : ''));
      entry.rules.forEach(function (rule) { L.push('     * ' + rule); });
    });
    if (r.warnings && r.warnings.length) {
      L.push('');
      L.push(t('report.sectionWarnings'));
      L.push(line());
      r.warnings.forEach(function (w) { L.push('  ! ' + warningText(w)); });
    }
    L.push('');
    L.push(line('='));
    L.push(t('app.footerDisclaimer').replace(/<[^>]+>/g, ''));
    L.push(CONFIG.AUTHOR);
    return L.join('\n');
  }

  TRP.render = {
    summaryHtml: summaryHtml,
    itineraryHtml: itineraryHtml,
    tollsHtml: tollsHtml,
    stopsHtml: stopsHtml,
    regulationsHtml: regulationsHtml,
    legalHtml: legalHtml,
    legalPlanHtml: legalPlanHtml,
    legalChecksHtml: legalChecksHtml,
    legalRulesHtml: legalRulesHtml,
    warningsHtml: warningsHtml,
    warningText: warningText,
    eventTitle: eventTitle,
    textReport: textReport,
    statTile: statTile
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.render;
})(typeof globalThis !== 'undefined' ? globalThis : this);
