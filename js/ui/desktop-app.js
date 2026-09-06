/**
 * Truck Route Planner - desktop front end controller.
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
    mapRendered: false
  };

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    [
      'originInput', 'originSuggest', 'destInput', 'destSuggest', 'swapBtn',
      'weightInput', 'axlesSelect', 'euroSelect', 'speedInput', 'fuelInput',
      'fuelPriceInput', 'adrCheck', 'departureInput', 'tollDetailSelect',
      'calcBtn', 'mapBtn', 'resetBtn', 'progress', 'progressFill', 'progressText',
      'panelOverview', 'panelItinerary', 'panelTolls', 'panelStops',
      'panelRegulations', 'panelReport', 'mapCanvas', 'reportText',
      'tabTollsCount', 'tabStopsCount', 'tabRegsCount', 'themeToggle',
      'copyReportBtn', 'downloadReportBtn', 'downloadGpxBtn', 'downloadJsonBtn',
      'printBtn', 'openMapBtn', 'downloadMapBtn', 'appVersion', 'dataSource'
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* ----------------------------------------------------------------- tabs */

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== name;
    });
    if (name === 'map') ensureMap();
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showTab(tab.dataset.tab); });
    });
  }

  /* ------------------------------------------------------------------ map */

  function ensureMap() {
    if (!state.mapView) {
      try {
        state.mapView = TRP.mapView.create(el.mapCanvas);
      } catch (err) {
        app.toast('Map could not be initialised: ' + err.message, 'error');
        return null;
      }
    }
    if (state.result && !state.mapRendered) {
      state.mapView.render(state.result);
      state.mapRendered = true;
    } else {
      state.mapView.invalidate();
    }
    return state.mapView;
  }

  /* ----------------------------------------------------------------- form */

  function readForm() {
    return {
      origin: el.originInput.value.trim(),
      destination: el.destInput.value.trim(),
      weightT: Number(el.weightInput.value),
      axles: Number(el.axlesSelect.value),
      euroClass: el.euroSelect.value,
      speedKmh: Number(el.speedInput.value),
      fuelL100: Number(el.fuelInput.value),
      fuelPrice: Number(el.fuelPriceInput.value),
      adr: el.adrCheck.checked,
      departure: el.departureInput.value,
      tollDetail: el.tollDetailSelect.value
    };
  }

  function applyForm(values) {
    var v = Object.assign({}, CONFIG.DEFAULT_VEHICLE, values || {});
    if (values) {
      el.originInput.value = values.origin || '';
      el.destInput.value = values.destination || '';
    }
    el.weightInput.value = v.weightT;
    el.axlesSelect.value = String(v.axles);
    el.euroSelect.value = v.euroClass;
    el.speedInput.value = v.speedKmh;
    el.fuelInput.value = v.fuelL100;
    el.fuelPriceInput.value = v.fuelPrice;
    el.adrCheck.checked = !!v.adr;
    el.departureInput.value = (values && values.departure) || app.defaultDepartureValue();
    el.tollDetailSelect.value = (values && values.tollDetail) || CONFIG.DEFAULT_TOLL_DETAIL;
  }

  function validate(values) {
    if (!values.origin) return 'Please enter an origin address.';
    if (!values.destination) return 'Please enter a destination address.';
    if (!(values.speedKmh > 0 && values.speedKmh <= 130)) return 'Average speed must be between 1 and 130 km/h.';
    if (!(values.weightT > 0 && values.weightT <= 100)) return 'Gross weight must be between 1 and 100 t.';
    if (values.fuelL100 < 0 || values.fuelPrice < 0) return 'Fuel figures cannot be negative.';
    return null;
  }

  /* ------------------------------------------------------------- progress */

  function setProgress(pct, message) {
    el.progress.hidden = false;
    el.progressFill.style.width = util.clamp(pct, 0, 100) + '%';
    el.progressText.textContent = message || '';
  }

  function hideProgress() {
    setTimeout(function () { el.progress.hidden = true; }, 700);
  }

  function setBusy(busy) {
    el.calcBtn.disabled = busy;
    el.calcBtn.textContent = busy ? 'Calculating...' : 'Calculate Route';
    el.resetBtn.disabled = busy;
  }

  /* -------------------------------------------------------------- results */

  function renderResult(r) {
    state.result = r;
    state.mapRendered = false;

    var warnings = TRP.render.warningsHtml(r);
    el.panelOverview.innerHTML =
      '<div class="card">' + TRP.render.summaryHtml(r) + '</div>' +
      (warnings ? '<div class="card"><div class="card__title">Planning warnings</div>' + warnings + '</div>' : '') +
      '<div class="card"><div class="card__title">Rest stops preview</div>' +
      TRP.render.stopsHtml(r) + '</div>';

    el.panelItinerary.innerHTML = '<div class="card"><div class="card__title">Legal driving schedule</div>' +
      TRP.render.itineraryHtml(r) + '</div>';

    el.panelTolls.innerHTML = '<div class="card"><div class="card__title">Toll estimate by country</div>' +
      TRP.render.tollsHtml(r) + '</div>' +
      '<div class="card"><div class="card__title">Cost summary</div>' +
      '<div class="stat-grid">' +
      TRP.render.statTile('Tolls', util.formatNumber(r.costs.toll, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>', '', 'toll') +
      TRP.render.statTile('Fuel', util.formatNumber(r.costs.fuel, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>',
        r.fuel.applicable ? util.formatNumber(r.fuel.liters, 0) + ' litres' : '') +
      TRP.render.statTile('Total', util.formatNumber(r.costs.total, 2) + ' <span class="unit">' + CONFIG.CURRENCY + '</span>',
        util.formatNumber(r.costs.perKm, 3) + ' ' + CONFIG.CURRENCY + '/km', 'accent') +
      '</div><p class="warn-box">Toll figures are indicative averages. Vignettes, tunnels, bridges, ferries and ' +
      'city charges are not included.</p></div>';

    el.panelStops.innerHTML = '<div class="card"><div class="card__title">Suggested stops and safe parking</div>' +
      TRP.render.stopsHtml(r) + '</div>';

    el.panelRegulations.innerHTML = '<div class="card"><div class="card__title">Country regulations along the route</div>' +
      TRP.render.regulationsHtml(r) + '</div>';

    el.reportText.value = TRP.render.textReport(r);

    el.tabTollsCount.textContent = String(r.tolls.countries.length);
    el.tabStopsCount.textContent = String(r.stops.length);
    el.tabRegsCount.textContent = String(r.regulations.length);

    el.mapBtn.disabled = false;
    el.openMapBtn.disabled = false;
    el.downloadMapBtn.disabled = false;
    el.downloadGpxBtn.disabled = false;
    el.downloadJsonBtn.disabled = false;
    el.downloadReportBtn.disabled = false;
    el.copyReportBtn.disabled = false;

    if (el.dataSource) {
      el.dataSource.textContent = r.data && r.data.source === 'embedded' ? 'built-in data' : 'data/*.json';
    }
  }

  function clearResults() {
    state.result = null;
    state.mapRendered = false;
    var empty = '<div class="empty-state"><div class="empty-state__icon">&#128667;</div>' +
      '<p>Enter an origin and a destination, then press <strong>Calculate Route</strong>.</p></div>';
    ['panelOverview', 'panelItinerary', 'panelTolls', 'panelStops', 'panelRegulations'].forEach(function (id) {
      el[id].innerHTML = empty;
    });
    el.reportText.value = '';
    el.tabTollsCount.textContent = '0';
    el.tabStopsCount.textContent = '0';
    el.tabRegsCount.textContent = '0';
    [el.mapBtn, el.openMapBtn, el.downloadMapBtn, el.downloadGpxBtn, el.downloadJsonBtn,
      el.downloadReportBtn, el.copyReportBtn].forEach(function (b) { if (b) b.disabled = true; });
    if (state.mapView) state.mapView.clear();
  }

  /* ----------------------------------------------------------- calculate */

  function calculate() {
    var values = readForm();
    var problem = validate(values);
    if (problem) { app.toast(problem, 'warn'); return; }

    app.saveForm(values);
    setBusy(true);
    setProgress(2, 'Starting...');

    var request = {
      origin: Object.assign({ text: values.origin }, state.picked.origin || {}),
      destination: Object.assign({ text: values.destination }, state.picked.destination || {}),
      vehicle: {
        weightT: values.weightT,
        axles: values.axles,
        euroClass: values.euroClass,
        speedKmh: values.speedKmh,
        fuelL100: values.fuelL100,
        fuelPrice: values.fuelPrice,
        adr: values.adr
      },
      departure: values.departure ? new Date(values.departure).toISOString() : null,
      tollDetail: values.tollDetail
    };

    state.running = app.runPlan(request, function (p) { setProgress(p.pct, p.message); });

    state.running.promise.then(function (result) {
      renderResult(result);
      showTab('overview');
      app.toast('Route calculated: ' + util.formatNumber(result.route.distanceKm, 0) + ' km, ' +
        util.formatDuration(result.time.totalHours) + ' total.', 'ok');
    }).catch(function (err) {
      if (err && err.code === 'CANCELLED') return;
      var message = app.friendlyError(err);
      app.toast(message, 'error');
      el.panelOverview.innerHTML = '<div class="card"><div class="card__title">Calculation failed</div>' +
        '<p>' + util.escapeHtml(message) + '</p>' +
        '<p class="note">The app uses the free Nominatim and OSRM demo services. They are rate limited and ' +
        'occasionally unavailable - retrying after a minute usually works.</p></div>';
      showTab('overview');
    }).then(function () {
      setBusy(false);
      hideProgress();
      state.running = null;
    });
  }

  /* --------------------------------------------------------------- events */

  function bindEvents() {
    el.calcBtn.addEventListener('click', calculate);

    [el.originInput, el.destInput].forEach(function (input) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !el.calcBtn.disabled) {
          setTimeout(calculate, 200);
        }
      });
    });

    el.swapBtn.addEventListener('click', function () {
      var a = el.originInput.value;
      el.originInput.value = el.destInput.value;
      el.destInput.value = a;
      var picked = state.picked.origin;
      state.picked.origin = state.picked.destination;
      state.picked.destination = picked;
    });

    el.resetBtn.addEventListener('click', function () {
      el.originInput.value = '';
      el.destInput.value = '';
      state.picked.origin = null;
      state.picked.destination = null;
      applyForm(null);
      clearResults();
      app.toast('Form reset.', 'info');
    });

    el.mapBtn.addEventListener('click', function () { showTab('map'); });

    el.openMapBtn.addEventListener('click', function () {
      if (!state.result) return;
      if (!TRP.mapExport.openInNewTab(state.result)) {
        app.toast('The browser blocked the new tab. Use "Download map" instead.', 'warn');
      }
    });

    el.downloadMapBtn.addEventListener('click', function () {
      if (state.result) TRP.mapExport.download(state.result);
    });

    el.copyReportBtn.addEventListener('click', function () {
      if (!state.result) return;
      var text = el.reportText.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          app.toast('Report copied to the clipboard.', 'ok');
        }).catch(function () { app.toast('Could not access the clipboard.', 'warn'); });
      } else {
        el.reportText.select();
        document.execCommand('copy');
        app.toast('Report copied.', 'ok');
      }
    });

    el.downloadReportBtn.addEventListener('click', function () {
      if (state.result) app.downloadText(el.reportText.value, app.baseName(state.result) + '.txt');
    });

    el.downloadGpxBtn.addEventListener('click', function () {
      if (state.result) {
        app.downloadText(app.buildGpx(state.result), app.baseName(state.result) + '.gpx',
          'application/gpx+xml');
      }
    });

    el.downloadJsonBtn.addEventListener('click', function () {
      if (state.result) {
        app.downloadText(app.exportJson(state.result), app.baseName(state.result) + '.json', 'application/json');
      }
    });

    el.printBtn.addEventListener('click', function () { window.print(); });

    window.addEventListener('resize', util.debounce(function () {
      if (state.mapView) state.mapView.invalidate();
    }, 250));

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !el.calcBtn.disabled) {
        event.preventDefault();
        calculate();
      }
    });
  }

  /* ----------------------------------------------------------------- init */

  function init() {
    cacheElements();
    app.initTheme(el.themeToggle);
    initTabs();
    applyForm(app.loadForm());
    clearResults();
    bindEvents();

    app.attachAutocomplete(el.originInput, el.originSuggest, function (place) {
      state.picked.origin = place ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });
    app.attachAutocomplete(el.destInput, el.destSuggest, function (place) {
      state.picked.destination = place ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });

    if (el.appVersion) el.appVersion.textContent = 'v' + CONFIG.APP_VERSION;

    TRP.dataStore.load().then(function (data) {
      if (el.dataSource) {
        el.dataSource.textContent = data.source === 'embedded' ? 'built-in data' : 'data/*.json';
      }
    });

    showTab('overview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
