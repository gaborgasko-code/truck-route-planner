/**
 * Truck Route Planner - mobile front end controller.
 *
 * Same shared core as the desktop build, driven through a touch-first,
 * single-column layout with bottom tab navigation.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = global.TRP;
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var app = TRP.appCommon;

  var el = {};
  var state = {
    result: null,
    running: null,
    picked: { origin: null, destination: null },
    mapView: null,
    mapRendered: false,
    view: 'plan'
  };

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    [
      'm_origin', 'm_originSuggest', 'm_dest', 'm_destSuggest', 'm_swap',
      'm_weight', 'm_axles', 'm_euro', 'm_speed', 'm_fuel', 'm_fuelPrice',
      'm_departure', 'm_tollDetail', 'm_calc', 'm_reset',
      'm_progress', 'm_progressFill', 'm_progressText',
      'viewPlan', 'viewResult', 'viewMap', 'viewRules', 'viewInfo',
      'm_summary', 'm_warnings', 'm_itinerary', 'm_tolls', 'm_stops',
      'm_rules', 'm_report', 'm_mapCanvas', 'm_openMap', 'm_downloadMap',
      'm_themeToggle', 'm_copyReport', 'm_downloadGpx', 'm_resultEmpty',
      'm_resultBody', 'm_appVersion', 'm_dataSource'
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* ---------------------------------------------------------------- views */

  var VIEWS = { plan: 'viewPlan', result: 'viewResult', map: 'viewMap', rules: 'viewRules', info: 'viewInfo' };

  function showView(name) {
    if (!VIEWS[name]) return;
    state.view = name;
    Object.keys(VIEWS).forEach(function (key) {
      el[VIEWS[key]].hidden = key !== name;
    });
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.setAttribute('aria-selected', String(btn.dataset.view === name));
    });
    if (name === 'map') ensureMap();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' });
  }

  function ensureMap() {
    if (!state.mapView) {
      try {
        state.mapView = TRP.mapView.create(el.m_mapCanvas);
      } catch (err) {
        app.toast('Map could not be initialised: ' + err.message, 'error');
        return;
      }
    }
    if (state.result && !state.mapRendered) {
      state.mapView.render(state.result);
      state.mapRendered = true;
    } else {
      state.mapView.invalidate();
    }
  }

  /* ----------------------------------------------------------------- form */

  function readForm() {
    return {
      origin: el.m_origin.value.trim(),
      destination: el.m_dest.value.trim(),
      weightT: Number(el.m_weight.value),
      axles: Number(el.m_axles.value),
      euroClass: el.m_euro.value,
      speedKmh: Number(el.m_speed.value),
      fuelL100: Number(el.m_fuel.value),
      fuelPrice: Number(el.m_fuelPrice.value),
      departure: el.m_departure.value,
      tollDetail: el.m_tollDetail.value
    };
  }

  function applyForm(values) {
    var v = Object.assign({}, CONFIG.DEFAULT_VEHICLE, values || {});
    if (values) {
      el.m_origin.value = values.origin || '';
      el.m_dest.value = values.destination || '';
    }
    el.m_weight.value = v.weightT;
    el.m_axles.value = String(v.axles);
    el.m_euro.value = v.euroClass;
    el.m_speed.value = v.speedKmh;
    el.m_fuel.value = v.fuelL100;
    el.m_fuelPrice.value = v.fuelPrice;
    el.m_departure.value = (values && values.departure) || app.defaultDepartureValue();
    el.m_tollDetail.value = (values && values.tollDetail) || CONFIG.DEFAULT_TOLL_DETAIL;
  }

  function validate(values) {
    if (!values.origin) return 'Enter an origin address.';
    if (!values.destination) return 'Enter a destination address.';
    if (!(values.speedKmh > 0 && values.speedKmh <= 130)) return 'Average speed must be 1-130 km/h.';
    if (!(values.weightT > 0 && values.weightT <= 100)) return 'Gross weight must be 1-100 t.';
    return null;
  }

  /* ------------------------------------------------------------- progress */

  function setProgress(pct, message) {
    el.m_progress.hidden = false;
    el.m_progressFill.style.width = util.clamp(pct, 0, 100) + '%';
    el.m_progressText.textContent = message || '';
  }

  function setBusy(busy) {
    el.m_calc.disabled = busy;
    el.m_calc.textContent = busy ? 'Calculating...' : 'Calculate Route';
  }

  /* -------------------------------------------------------------- results */

  function renderResult(r) {
    state.result = r;
    state.mapRendered = false;

    el.m_resultEmpty.hidden = true;
    el.m_resultBody.hidden = false;

    el.m_summary.innerHTML = TRP.render.summaryHtml(r);

    var warnings = TRP.render.warningsHtml(r);
    el.m_warnings.innerHTML = warnings
      ? '<details class="collapse" open><summary>Planning warnings</summary>' +
        '<div class="collapse__body">' + warnings + '</div></details>'
      : '';

    el.m_itinerary.innerHTML = TRP.render.itineraryHtml(r);
    el.m_tolls.innerHTML = TRP.render.tollsHtml(r);
    el.m_stops.innerHTML = TRP.render.stopsHtml(r);
    el.m_rules.innerHTML = TRP.render.regulationsHtml(r);
    el.m_report.value = TRP.render.textReport(r);

    [el.m_openMap, el.m_downloadMap, el.m_copyReport, el.m_downloadGpx].forEach(function (b) {
      if (b) b.disabled = false;
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.disabled = false; });

    if (el.m_dataSource) {
      el.m_dataSource.textContent = r.data && r.data.source === 'embedded' ? 'built-in data' : 'data/*.json';
    }
  }

  function clearResults() {
    state.result = null;
    state.mapRendered = false;
    el.m_resultEmpty.hidden = false;
    el.m_resultBody.hidden = true;
    el.m_rules.innerHTML = '<div class="empty-state"><div class="empty-state__icon">&#9878;</div>' +
      '<p>Country regulations appear after a route is calculated.</p></div>';
    el.m_report.value = '';
    [el.m_openMap, el.m_downloadMap, el.m_copyReport, el.m_downloadGpx].forEach(function (b) {
      if (b) b.disabled = true;
    });
    if (state.mapView) state.mapView.clear();
  }

  /* ------------------------------------------------------------ calculate */

  function calculate() {
    var values = readForm();
    var problem = validate(values);
    if (problem) { app.toast(problem, 'warn'); return; }

    app.saveForm(values);
    setBusy(true);
    setProgress(2, 'Starting...');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    var request = {
      origin: Object.assign({ text: values.origin }, state.picked.origin || {}),
      destination: Object.assign({ text: values.destination }, state.picked.destination || {}),
      vehicle: {
        weightT: values.weightT,
        axles: values.axles,
        euroClass: values.euroClass,
        speedKmh: values.speedKmh,
        fuelL100: values.fuelL100,
        fuelPrice: values.fuelPrice
      },
      departure: values.departure ? new Date(values.departure).toISOString() : null,
      tollDetail: values.tollDetail
    };

    state.running = app.runPlan(request, function (p) { setProgress(p.pct, p.message); });

    state.running.promise.then(function (result) {
      renderResult(result);
      showView('result');
      app.toast(util.formatNumber(result.route.distanceKm, 0) + ' km, ' +
        util.formatDuration(result.time.totalHours) + ' total trip time.', 'ok');
    }).catch(function (err) {
      if (err && err.code === 'CANCELLED') return;
      app.toast(app.friendlyError(err), 'error');
    }).then(function () {
      setBusy(false);
      setTimeout(function () { el.m_progress.hidden = true; }, 700);
      state.running = null;
    });
  }

  /* --------------------------------------------------------------- events */

  function bindEvents() {
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { showView(btn.dataset.view); });
    });

    el.m_calc.addEventListener('click', calculate);

    el.m_reset.addEventListener('click', function () {
      el.m_origin.value = '';
      el.m_dest.value = '';
      state.picked.origin = null;
      state.picked.destination = null;
      applyForm(null);
      clearResults();
      showView('plan');
      app.toast('Form reset.', 'info');
    });

    el.m_swap.addEventListener('click', function () {
      var a = el.m_origin.value;
      el.m_origin.value = el.m_dest.value;
      el.m_dest.value = a;
      var picked = state.picked.origin;
      state.picked.origin = state.picked.destination;
      state.picked.destination = picked;
    });

    el.m_openMap.addEventListener('click', function () {
      if (!state.result) return;
      if (!TRP.mapExport.openInNewTab(state.result)) {
        app.toast('The browser blocked the new tab. Use "Save map" instead.', 'warn');
      }
    });

    el.m_downloadMap.addEventListener('click', function () {
      if (state.result) TRP.mapExport.download(state.result);
    });

    el.m_copyReport.addEventListener('click', function () {
      if (!state.result) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.m_report.value).then(function () {
          app.toast('Report copied.', 'ok');
        }).catch(function () { app.toast('Clipboard not available.', 'warn'); });
      } else {
        el.m_report.select();
        document.execCommand('copy');
        app.toast('Report copied.', 'ok');
      }
    });

    el.m_downloadGpx.addEventListener('click', function () {
      if (state.result) {
        app.downloadText(app.buildGpx(state.result), app.baseName(state.result) + '.gpx',
          'application/gpx+xml');
      }
    });

    window.addEventListener('orientationchange', function () {
      setTimeout(function () { if (state.mapView) state.mapView.invalidate(); }, 350);
    });
  }

  /* ----------------------------------------------------------------- init */

  function init() {
    cacheElements();
    app.initTheme(el.m_themeToggle);
    applyForm(app.loadForm());
    clearResults();
    bindEvents();

    app.attachAutocomplete(el.m_origin, el.m_originSuggest, function (place) {
      state.picked.origin = place ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });
    app.attachAutocomplete(el.m_dest, el.m_destSuggest, function (place) {
      state.picked.destination = place ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });

    if (el.m_appVersion) el.m_appVersion.textContent = 'v' + CONFIG.APP_VERSION;

    TRP.dataStore.load().then(function (data) {
      if (el.m_dataSource) {
        el.m_dataSource.textContent = data.source === 'embedded' ? 'built-in data' : 'data/*.json';
      }
    });

    showView('plan');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
