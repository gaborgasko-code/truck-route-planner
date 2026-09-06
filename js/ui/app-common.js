/**
 * Truck Route Planner - behaviour shared by the desktop and mobile builds.
 *
 * Theme handling, toasts, address autocomplete, form persistence, exports and
 * the friendly error mapping all live here so both front ends behave the same.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;

  var FORM_KEY = 'trp.form.v1';
  var THEME_KEY = 'trp.theme';

  /* ---------------------------------------------------------------- theme */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    util.storageSet(THEME_KEY, theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#062546' : '#0b4ea2');
  }

  function currentTheme() {
    var saved = util.storageGet(THEME_KEY, null);
    if (saved === 'dark' || saved === 'light') return saved;
    return (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function initTheme(button) {
    var theme = currentTheme();
    applyTheme(theme);
    if (!button) return;
    function sync() {
      var t = document.documentElement.getAttribute('data-theme');
      button.textContent = t === 'dark' ? '☀' : '☾';
      button.setAttribute('title', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      button.setAttribute('aria-label', button.getAttribute('title'));
    }
    sync();
    button.addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      sync();
    });
  }

  /* --------------------------------------------------------------- toasts */

  function toastHost() {
    var host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  /**
   * Show a transient message.
   * @param {string} message
   * @param {'info'|'ok'|'warn'|'error'} [tone='info']
   * @param {number} [ms]
   */
  function toast(message, tone, ms) {
    var host = toastHost();
    var el = document.createElement('div');
    el.className = 'toast' + (tone && tone !== 'info' ? ' toast--' + tone : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, ms || (tone === 'error' ? 7000 : 4200));
  }

  /* ------------------------------------------------------ error messages */

  var ERROR_HINTS = {
    EMPTY_QUERY: 'Enter both an origin and a destination address.',
    NOT_FOUND: 'Try a more complete address, for example "Bahnhofstrasse 1, Munich, Germany".',
    NO_ROUTE: 'No road route exists between these points. Sea crossings and islands need a ferry leg.',
    TIMEOUT: 'The free routing service did not answer in time. Wait a moment and try again.',
    NETWORK: 'No connection to the routing service. Check the internet connection.',
    CANCELLED: 'Calculation cancelled.'
  };

  function friendlyError(err) {
    if (!err) return 'Unexpected error.';
    var code = err.code || '';
    var base = err.message || String(err);
    var hint = ERROR_HINTS[code];
    if (code.indexOf('HTTP_') === 0) {
      hint = 'The free OSRM / Nominatim demo servers are rate limited. Wait a minute and retry.';
    }
    return hint && hint !== base ? base + ' ' + hint : base;
  }

  /* -------------------------------------------------------- autocomplete */

  /**
   * Attach Nominatim address suggestions to a text input.
   *
   * @param {HTMLInputElement} input
   * @param {HTMLElement} dropdown container for the suggestion list
   * @param {function(Object|null)} onPick called with the chosen place, or
   *        null when the user edits the text again
   */
  function attachAutocomplete(input, dropdown, onPick) {
    if (!input || !dropdown) return;
    var items = [];
    var active = -1;

    function close() {
      dropdown.hidden = true;
      dropdown.innerHTML = '';
      items = [];
      active = -1;
    }

    function choose(i) {
      var place = items[i];
      if (!place) return;
      input.value = place.label;
      close();
      if (onPick) onPick(place);
    }

    function open(results) {
      items = results;
      active = -1;
      dropdown.innerHTML = results.map(function (r, i) {
        var parts = r.label.split(',');
        var head = parts.shift();
        return '<div class="suggest__item" role="option" data-i="' + i + '">' +
          '<strong>' + util.escapeHtml(head) + '</strong>' +
          '<span>' + util.escapeHtml(parts.join(',').trim()) + '</span></div>';
      }).join('');
      dropdown.hidden = false;
    }

    var lookup = util.debounce(function () {
      var text = input.value.trim();
      if (text.length < 3) { close(); return; }
      TRP.api.geocode(text, 5).then(function (results) {
        if (input.value.trim() !== text) return;
        open(results);
      }).catch(function () { close(); });
    }, 480);

    input.addEventListener('input', function () {
      if (onPick) onPick(null);
      lookup();
    });

    input.addEventListener('keydown', function (event) {
      if (dropdown.hidden) return;
      var nodes = dropdown.querySelectorAll('.suggest__item');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active = util.clamp(active + (event.key === 'ArrowDown' ? 1 : -1), 0, nodes.length - 1);
        for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle('is-active', i === active);
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        choose(active);
      } else if (event.key === 'Escape') {
        close();
      }
    });

    dropdown.addEventListener('mousedown', function (event) {
      var item = event.target.closest('.suggest__item');
      if (!item) return;
      event.preventDefault();
      choose(Number(item.getAttribute('data-i')));
    });

    input.addEventListener('blur', function () { setTimeout(close, 160); });

    return { close: close };
  }

  /* ----------------------------------------------------- form persistence */

  function saveForm(values) { util.storageSet(FORM_KEY, values); }
  function loadForm() { return util.storageGet(FORM_KEY, null); }

  /** Local `datetime-local` value for "now", rounded to the next 15 minutes. */
  function defaultDepartureValue() {
    var d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.getFullYear() + '-' + util.pad2(d.getMonth() + 1) + '-' + util.pad2(d.getDate()) +
      'T' + util.pad2(d.getHours()) + ':' + util.pad2(d.getMinutes());
  }

  /* -------------------------------------------------------------- exports */

  function downloadText(text, filename, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
  }

  /** GPX track plus waypoints for origin, destination and every rest stop. */
  function buildGpx(r) {
    var esc = util.escapeHtml;
    var waypoints = [
      { lat: r.origin.lat, lon: r.origin.lon, name: 'Origin: ' + r.origin.label },
      { lat: r.destination.lat, lon: r.destination.lon, name: 'Destination: ' + r.destination.label }
    ].concat((r.stops || []).map(function (s) {
      return { lat: s.lat, lon: s.lon, name: 'Rest stop ' + s.index + ' (km ' + Math.round(s.km) + ')' };
    })).concat((r.parkings || []).map(function (p) {
      return { lat: p.lat, lon: p.lon, name: (p.secured ? 'Secured parking: ' : 'Parking: ') + p.name };
    }));

    var track = TRP.geo.simplify(r.route.coords, 4000).map(function (c) {
      return '   <trkpt lat="' + c.lat.toFixed(6) + '" lon="' + c.lon.toFixed(6) + '"/>';
    }).join('\n');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<gpx version="1.1" creator="' + esc(CONFIG.APP_NAME + ' ' + CONFIG.APP_VERSION + ' - ' + CONFIG.AUTHOR) + '" ' +
      'xmlns="http://www.topografix.com/GPX/1/1">\n' +
      ' <metadata><name>' + esc(r.origin.label + ' to ' + r.destination.label) + '</name>' +
      '<time>' + r.createdAt + '</time></metadata>\n' +
      waypoints.map(function (w) {
        return ' <wpt lat="' + Number(w.lat).toFixed(6) + '" lon="' + Number(w.lon).toFixed(6) + '">' +
          '<name>' + esc(w.name) + '</name></wpt>';
      }).join('\n') + '\n' +
      ' <trk><name>Truck route</name><trkseg>\n' + track + '\n </trkseg></trk>\n</gpx>\n';
  }

  /** Result without the full polyline, for a compact JSON export. */
  function exportJson(r) {
    var copy = Object.assign({}, r);
    copy.route = {
      distanceKm: r.route.distanceKm,
      durationS: r.route.durationS,
      pointCount: r.route.coords.length
    };
    delete copy.countrySamples;
    delete copy.data;
    return JSON.stringify(copy, null, 2);
  }

  function baseName(r) {
    return TRP.mapExport.fileName(r).replace(/\.html$/, '');
  }

  /* ---------------------------------------------------------- plan runner */

  /**
   * Run a route plan with progress reporting and cancellation support.
   * Returns `{ promise, cancel }`.
   */
  function runPlan(request, onProgress) {
    var token = { cancelled: false };
    var promise = TRP.planner.planRoute(request, { onProgress: onProgress, token: token });
    return {
      promise: promise,
      cancel: function () { token.cancelled = true; }
    };
  }

  TRP.appCommon = {
    FORM_KEY: FORM_KEY,
    applyTheme: applyTheme,
    currentTheme: currentTheme,
    initTheme: initTheme,
    toast: toast,
    friendlyError: friendlyError,
    attachAutocomplete: attachAutocomplete,
    saveForm: saveForm,
    loadForm: loadForm,
    defaultDepartureValue: defaultDepartureValue,
    downloadText: downloadText,
    buildGpx: buildGpx,
    exportJson: exportJson,
    baseName: baseName,
    runPlan: runPlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
