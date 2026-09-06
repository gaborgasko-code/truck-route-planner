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
  var t = TRP.i18n.t;

  var el = {};
  var state = {
    result: null,
    running: null,
    picked: { origin: null, destination: null },
    mapView: null,
    mapRendered: false,
    activeTab: 'overview'
  };

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    [
      'originInput', 'originSuggest', 'destInput', 'destSuggest', 'swapBtn',
      'weightInput', 'axlesSelect', 'euroSelect', 'speedInput', 'fuelInput',
      'fuelPriceInput', 'adrCheck', 'departureInput', 'tollDetailSelect',
      'calcBtn', 'mapBtn', 'resetBtn', 'progress', 'progressFill', 'progressText',
      'panelOverview', 'panelItinerary', 'panelTolls', 'panelStops', 'panelLegal',
      'panelRegulations', 'panelReport', 'mapCanvas', 'reportText',
      'tabTollsCount', 'tabStopsCount', 'tabLegalCount', 'tabRegsCount',
      'themeToggle', 'langSelect',
      'copyReportBtn', 'downloadReportBtn', 'downloadGpxBtn', 'downloadJsonBtn',
      'printBtn', 'openMapBtn', 'downloadMapBtn', 'appVersion', 'dataSource'
    ].forEach(function (id) { el[id] = $(id); });
  }

  /* ----------------------------------------------------------------- tabs */

  function showTab(name) {
    state.activeTab = name;
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
        app.toast(t('map.initFailed', { msg: err.message }), 'error');
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
    if (!values.origin) return t('err.EMPTY_ORIGIN');
    if (!values.destination) return t('err.EMPTY_DESTINATION');
    if (!(values.speedKmh > 0 && values.speedKmh <= 130)) return t('err.speedRange');
    if (!(values.weightT > 0 && values.weightT <= 100)) return t('err.weightRange');
    if (values.fuelL100 < 0 || values.fuelPrice < 0) return t('err.fuelNegative');
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
    el.calcBtn.textContent = t(busy ? 'form.calculating' : 'form.calculate');
    el.resetBtn.disabled = busy;
  }

  /* -------------------------------------------------------------- results */

  function card(titleKey, body) {
    return '<div class="card"><div class="card__title">' + util.escapeHtml(t(titleKey)) + '</div>' +
      body + '</div>';
  }

  function renderResult(r) {
    state.result = r;
    state.mapRendered = false;

    var cur = CONFIG.CURRENCY;
    var warnings = TRP.render.warningsHtml(r);

    el.panelOverview.innerHTML =
      '<div class="card">' + TRP.render.summaryHtml(r) + '</div>' +
      (warnings ? card('overview.warnings', warnings) : '') +
      card('overview.stopsPreview', TRP.render.stopsHtml(r));

    el.panelItinerary.innerHTML = card('itinerary.title', TRP.render.itineraryHtml(r));

    el.panelTolls.innerHTML = card('toll.title', TRP.render.tollsHtml(r)) +
      card('toll.costSummary',
        '<div class="stat-grid">' +
        TRP.render.statTile(t('toll.tolls'),
          util.formatNumber(r.costs.toll, 2) + ' <span class="unit">' + cur + '</span>', '', 'toll') +
        TRP.render.statTile(t('toll.fuel'),
          util.formatNumber(r.costs.fuel, 2) + ' <span class="unit">' + cur + '</span>',
          r.fuel.applicable ? util.escapeHtml(t('toll.litres', { liters: util.formatNumber(r.fuel.liters, 0) })) : '') +
        TRP.render.statTile(t('toll.total'),
          util.formatNumber(r.costs.total, 2) + ' <span class="unit">' + cur + '</span>',
          util.formatNumber(r.costs.perKm, 3) + ' ' + cur + '/km', 'accent') +
        '</div><p class="warn-box">' + util.escapeHtml(t('toll.excluded')) + '</p>');

    el.panelStops.innerHTML = card('stops.title', TRP.render.stopsHtml(r));
    el.panelLegal.innerHTML = TRP.render.legalHtml(r);
    el.panelRegulations.innerHTML = card('reg.title', TRP.render.regulationsHtml(r));
    el.reportText.value = TRP.render.textReport(r);

    el.tabTollsCount.textContent = String(r.tolls.countries.length);
    el.tabStopsCount.textContent = String(r.stops.length);
    el.tabLegalCount.textContent = String((r.legal && r.legal.plan.length) || 0);
    el.tabRegsCount.textContent = String(r.regulations.length);

    [el.mapBtn, el.openMapBtn, el.downloadMapBtn, el.downloadGpxBtn, el.downloadJsonBtn,
      el.downloadReportBtn, el.copyReportBtn].forEach(function (b) { if (b) b.disabled = false; });

    updateDataSource(r.data && r.data.source);
  }

  function clearResults() {
    state.result = null;
    state.mapRendered = false;
    var empty = '<div class="empty-state"><div class="empty-state__icon">' + (TRP.icons ? TRP.icons.svg('truck') : '') + '</div>' +
      '<p>' + t('overview.empty') + '</p></div>';
    ['panelOverview', 'panelItinerary', 'panelTolls', 'panelStops', 'panelRegulations']
      .forEach(function (id) { el[id].innerHTML = empty; });

    /* The legal tab is useful even before a route: it holds the reference rules. */
    TRP.dataStore.load().then(function (data) {
      if (!state.result) el.panelLegal.innerHTML = TRP.render.legalHtml(null, data.euRules);
    });

    el.reportText.value = '';
    ['tabTollsCount', 'tabStopsCount', 'tabLegalCount', 'tabRegsCount']
      .forEach(function (id) { el[id].textContent = '0'; });
    [el.mapBtn, el.openMapBtn, el.downloadMapBtn, el.downloadGpxBtn, el.downloadJsonBtn,
      el.downloadReportBtn, el.copyReportBtn].forEach(function (b) { if (b) b.disabled = true; });
    if (state.mapView) state.mapView.clear();
  }

  function updateDataSource(source) {
    if (!el.dataSource) return;
    el.dataSource.textContent = source === 'embedded' ? t('app.builtInData') : 'data/*.json';
  }

  /* ----------------------------------------------------------- calculate */

  function calculate() {
    var values = readForm();
    var problem = validate(values);
    if (problem) { app.toast(problem, 'warn'); return; }

    app.saveForm(values);
    setBusy(true);
    setProgress(2, t('prog.start'));

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
      app.toast(t('overview.calculated', {
        km: util.formatNumber(result.route.distanceKm, 0),
        time: util.formatDuration(result.time.totalHours)
      }), 'ok');
    }).catch(function (err) {
      if (err && err.code === 'CANCELLED') return;
      var message = app.friendlyError(err);
      app.toast(message, 'error');
      el.panelOverview.innerHTML = card('overview.failed',
        '<p>' + util.escapeHtml(message) + '</p>' +
        '<p class="note">' + util.escapeHtml(t('overview.failedNote')) + '</p>');
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
        if (event.key === 'Enter' && !el.calcBtn.disabled) setTimeout(calculate, 200);
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
      app.toast(t('form.formReset'), 'info');
    });

    el.mapBtn.addEventListener('click', function () { showTab('map'); });

    el.openMapBtn.addEventListener('click', function () {
      if (!state.result) return;
      if (!TRP.mapExport.openInNewTab(state.result)) {
        app.toast(t('map.popupBlocked'), 'warn');
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
          app.toast(t('report.copied'), 'ok');
        }).catch(function () { app.toast(t('report.clipboardFail'), 'warn'); });
      } else {
        el.reportText.select();
        document.execCommand('copy');
        app.toast(t('report.copied'), 'ok');
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

  /** Re-render everything that was produced in the previous language. */
  function onLanguageChange() {
    setBusy(false);
    if (state.result) {
      renderResult(state.result);
      if (state.mapView) {
        state.mapView.render(state.result);
        state.mapRendered = true;
      }
    } else {
      clearResults();
    }
  }

  /* ----------------------------------------------------------------- init */

  function init() {
    cacheElements();
    app.initLanguage(el.langSelect, onLanguageChange);
    app.initTheme(el.themeToggle);
    initTabs();
    applyForm(app.loadForm());
    clearResults();
    bindEvents();
    setBusy(false);

    app.attachAutocomplete(el.originInput, el.originSuggest, function (place) {
      state.picked.origin = place
        ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });
    app.attachAutocomplete(el.destInput, el.destSuggest, function (place) {
      state.picked.destination = place
        ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });

    if (el.appVersion) el.appVersion.textContent = 'v' + CONFIG.APP_VERSION;

    TRP.dataStore.load().then(function (data) { updateDataSource(data.source); });

    showTab('overview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
