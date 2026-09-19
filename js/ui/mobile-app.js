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
  var t = TRP.i18n.t;

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
      'm_weight', 'm_axles', 'm_euro', 'm_speed', 'm_fuel', 'm_fuelPrice', 'm_drivers', 'm_driversNote',
      'm_departure', 'm_tollDetail', 'm_calc', 'm_reset',
      'm_progress', 'm_progressFill', 'm_progressText',
      'viewPlan', 'viewResult', 'viewMap', 'viewRules', 'viewInfo',
      'm_summary', 'm_warnings', 'm_itinerary', 'm_tolls', 'm_stops',
      'm_legal', 'm_rules', 'm_report', 'm_mapCanvas', 'm_openMap', 'm_downloadMap',
      'm_remindCard', 'm_remindState', 'm_remindBtn', 'm_locateBtn',
      'm_themeToggle', 'm_langSelect', 'm_copyReport', 'm_downloadGpx',
      'm_resultEmpty', 'm_resultBody', 'm_appVersion', 'm_dataSource'
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
    window.scrollTo(0, 0);
  }

  function ensureMap() {
    if (!state.mapView) {
      try {
        state.mapView = TRP.mapView.create(el.m_mapCanvas);
      } catch (err) {
        app.toast(t('map.initFailed', { msg: err.message }), 'error');
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
      drivers: Number(el.m_drivers.value),
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
    el.m_drivers.value = String(v.drivers || 1);
    syncDriversNote();
    el.m_departure.value = (values && values.departure) || app.defaultDepartureValue();
    el.m_tollDetail.value = (values && values.tollDetail) || CONFIG.DEFAULT_TOLL_DETAIL;
  }

  /* The team-driving explanation only matters once two drivers are chosen. */
  function syncDriversNote() {
    el.m_driversNote.hidden = el.m_drivers.value !== '2';
  }

  function validate(values) {
    if (!values.origin) return t('err.EMPTY_ORIGIN');
    if (!values.destination) return t('err.EMPTY_DESTINATION');
    if (!(values.speedKmh > 0 && values.speedKmh <= 130)) return t('err.speedRange');
    if (!(values.weightT > 0 && values.weightT <= 100)) return t('err.weightRange');
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
    el.m_calc.textContent = t(busy ? 'form.calculating' : 'form.calculate');
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
      ? '<details class="collapse" open><summary>' + util.escapeHtml(t('overview.warnings')) + '</summary>' +
        '<div class="collapse__body">' + warnings + '</div></details>'
      : '';

    el.m_itinerary.innerHTML = TRP.render.itineraryHtml(r);
    el.m_tolls.innerHTML = TRP.render.tollsHtml(r);
    el.m_stops.innerHTML = TRP.render.stopsHtml(r);
    el.m_legal.innerHTML = TRP.render.legalHtml(r);
    refreshReminders();
    el.m_rules.innerHTML = TRP.render.regulationsHtml(r);
    el.m_report.value = TRP.render.textReport(r);

    [el.m_openMap, el.m_downloadMap, el.m_copyReport, el.m_downloadGpx].forEach(function (b) {
      if (b) b.disabled = false;
    });

    updateDataSource(r.data && r.data.source);
  }

  function clearResults() {
    state.result = null;
    state.mapRendered = false;
    el.m_resultEmpty.hidden = false;
    el.m_resultBody.hidden = true;
    el.m_rules.innerHTML = '<div class="empty-state"><div class="empty-state__icon">' + (TRP.icons ? TRP.icons.svg('scale') : '') + '</div>' +
      '<p>' + util.escapeHtml(t('reg.empty')) + '</p></div>';
    el.m_report.value = '';

    /* The legal rules are reference material, so show them straight away. */
    TRP.dataStore.load().then(function (data) {
      if (!state.result) el.m_legal.innerHTML = TRP.render.legalHtml(null, data.euRules);
    });

    [el.m_openMap, el.m_downloadMap, el.m_copyReport, el.m_downloadGpx].forEach(function (b) {
      if (b) b.disabled = true;
    });
    if (state.mapView) state.mapView.clear();
  }

  function updateDataSource(source) {
    if (!el.m_dataSource) return;
    el.m_dataSource.textContent = source === 'embedded' ? t('app.builtInData') : 'data/*.json';
  }

  /* ------------------------------------------------------------ calculate */

  function calculate() {
    var values = readForm();
    var problem = validate(values);
    if (problem) { app.toast(problem, 'warn'); return; }

    app.saveForm(values);
    setBusy(true);
    setProgress(2, t('prog.start'));
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
        fuelPrice: values.fuelPrice,
        drivers: values.drivers
      },
      departure: values.departure ? new Date(values.departure).toISOString() : null,
      tollDetail: values.tollDetail
    };

    state.running = app.runPlan(request, function (p) { setProgress(p.pct, p.message); });

    var startedAt = Date.now();
    state.running.promise.then(function (result) {
      renderResult(result);
      app.trackEvent('route_calculated', {
        distanceKm: result.route.distanceKm,
        durationMs: Date.now() - startedAt,
        countries: result.countries.length,
        tollDetail: values.tollDetail,
        drivers: values.drivers
      });
      showView('result');
      app.toast(t('overview.calculatedShort', {
        km: util.formatNumber(result.route.distanceKm, 0),
        time: util.formatDuration(result.time.totalHours)
      }), 'ok');
    }).catch(function (err) {
      if (err && err.code === 'CANCELLED') return;
      app.trackEvent('route_failed', { errorCode: err && err.code });
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
    el.m_drivers.addEventListener('change', syncDriversNote);

    el.m_reset.addEventListener('click', function () {
      el.m_origin.value = '';
      el.m_dest.value = '';
      state.picked.origin = null;
      state.picked.destination = null;
      applyForm(null);
      clearResults();
      showView('plan');
      app.toast(t('form.formReset'), 'info');
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
        app.toast(t('map.popupBlocked'), 'warn');
      }
    });

    el.m_downloadMap.addEventListener('click', function () {
      if (state.result) TRP.mapExport.download(state.result);
    });

    el.m_copyReport.addEventListener('click', function () {
      if (!state.result) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.m_report.value).then(function () {
          app.toast(t('report.copied'), 'ok');
        }).catch(function () { app.toast(t('report.clipboardFail'), 'warn'); });
      } else {
        el.m_report.select();
        document.execCommand('copy');
        app.toast(t('report.copied'), 'ok');
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

  /* ------------------------------------------------------ native extras */

  /*
   * Break reminders and "use my location" exist only in the packaged app.
   * A browser tab cannot fire a notification hours later while the phone is
   * in a pocket, and the whole value of the reminder is that it arrives when
   * nobody is looking at the screen - so on the web the controls stay hidden
   * rather than being offered and quietly doing nothing.
   */
  var reminderState = { on: false };

  function nativeAvailable() {
    return !!(TRP.native && TRP.native.available());
  }

  function setReminderUi(on, message) {
    reminderState.on = on;
    if (el.m_remindBtn) {
      el.m_remindBtn.textContent = app.t(on ? 'remind.disable' : 'remind.enable');
    }
    if (el.m_remindState) {
      el.m_remindState.textContent = message || app.t(on ? 'remind.on' : 'remind.off');
    }
  }

  /** Show the panel only when there is a plan worth reminding anyone about. */
  function refreshReminders() {
    if (!el.m_remindCard) return;
    var plan = state.result && state.result.legal && state.result.legal.plan;
    var worth = nativeAvailable() && plan && plan.length > 0;
    el.m_remindCard.hidden = !worth;
    if (!worth) return;

    TRP.native.pendingReminders().then(function (pending) {
      setReminderUi(pending > 0);
    });
  }

  function toggleReminders() {
    var plan = state.result && state.result.legal && state.result.legal.plan;
    if (!plan || !plan.length) return;

    if (reminderState.on) {
      TRP.native.cancelReminders().then(function () {
        setReminderUi(false);
        app.toast(app.t('remind.off'));
      });
      return;
    }

    var list = TRP.reminders.schedule(plan);
    if (!list.length) {
      /* Everything is already in the past - scheduling would be a lie. */
      app.toast(app.t('remind.off'));
      return;
    }

    TRP.native.scheduleReminders(list, app.t).then(function (result) {
      if (result.ok) {
        setReminderUi(true);
        app.toast(app.t('remind.on'));
        return;
      }
      /* iOS never shows the permission sheet twice, so a refusal has to send
         the user to Settings rather than silently failing again. */
      setReminderUi(false, app.t(result.reason === 'denied'
        ? 'remind.denied' : 'remind.unavailable'));
    });
  }

  function useMyLocation() {
    if (!el.m_locateBtn) return;
    el.m_locateBtn.disabled = true;
    el.m_locateBtn.textContent = app.t('location.finding');

    TRP.native.currentPosition().then(function (pos) {
      if (!pos.ok) {
        app.toast(app.t(pos.reason === 'denied' ? 'location.denied' : 'location.failed'));
        return null;
      }
      /* Turn the fix into something a human recognises, and something the
         router can geocode again later. */
      return TRP.api.reverseAddress(pos.lat, pos.lon).then(function (place) {
        var label = (place && place.label) || (pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5));
        el.m_origin.value = label;
        state.picked.origin = { lat: pos.lat, lon: pos.lon, label: label };
        return label;
      }).catch(function () {
        var label = pos.lat.toFixed(5) + ', ' + pos.lon.toFixed(5);
        el.m_origin.value = label;
        state.picked.origin = { lat: pos.lat, lon: pos.lon, label: label };
        return label;
      });
    }).then(function () {
      el.m_locateBtn.disabled = false;
      el.m_locateBtn.textContent = app.t('location.use');
    });
  }

  function initNative() {
    if (!nativeAvailable()) return;
    if (el.m_locateBtn) {
      el.m_locateBtn.hidden = false;
      el.m_locateBtn.addEventListener('click', useMyLocation);
    }
    if (el.m_remindBtn) {
      el.m_remindBtn.addEventListener('click', toggleReminders);
    }
    setReminderUi(false);
  }

  function init() {
    cacheElements();
    app.initLanguage(el.m_langSelect, onLanguageChange, true);
    app.initTheme(el.m_themeToggle);
    app.initPrivacy('mobile');
    initNative();
    applyForm(app.loadForm());
    clearResults();
    bindEvents();
    setBusy(false);

    app.attachAutocomplete(el.m_origin, el.m_originSuggest, function (place) {
      state.picked.origin = place
        ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });
    app.attachAutocomplete(el.m_dest, el.m_destSuggest, function (place) {
      state.picked.destination = place
        ? { lat: place.lat, lon: place.lon, label: place.label, countryCode: place.countryCode } : null;
    });

    if (el.m_appVersion) el.m_appVersion.textContent = 'v' + CONFIG.APP_VERSION;

    TRP.dataStore.load().then(function (data) { updateDataSource(data.source); });

    showView('plan');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
