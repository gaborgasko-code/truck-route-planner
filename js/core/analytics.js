/**
 * Truck Route Planner - privacy-preserving audience measurement.
 *
 * Design constraints, in order of importance:
 *
 *   1. Nothing is sent before the visitor grants the `analytics` category.
 *   2. No cookie, no localStorage entry, no device fingerprint, no persistent
 *      identifier of any kind is created. The server does the de-duplication
 *      with a salt it rotates daily and never stores the IP.
 *   3. No free text ever leaves the browser. Addresses, coordinates and the
 *      route polyline are never part of a payload; distances and timings are
 *      reduced to coarse bands so a single run cannot be recognised.
 *   4. If the collector is unreachable, the app carries on silently.
 *
 * `buildPayload` is pure so the tests can assert exactly what would be sent.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.consent) require('./consent.js');
  }
  var CONFIG = TRP.CONFIG;

  /* Coarse bands: enough to see usage patterns, too coarse to single out a run. */
  var DISTANCE_BANDS = [100, 300, 600, 1000, 2000];
  var DURATION_BANDS = [1000, 3000, 10000, 30000, 60000];

  function band(value, edges, unit) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return 'na';
    for (var i = 0; i < edges.length; i++) {
      if (n < edges[i]) return (i === 0 ? '0' : String(edges[i - 1])) + '-' + edges[i] + unit;
    }
    return edges[edges.length - 1] + '+' + unit;
  }

  /** Screen size bucket, never the exact resolution. */
  function screenBand(width) {
    var w = Number(width);
    if (!isFinite(w) || w <= 0) return 'na';
    if (w < 420) return 'xs';
    if (w < 760) return 'sm';
    if (w < 1100) return 'md';
    if (w < 1600) return 'lg';
    return 'xl';
  }

  /**
   * Only the referring host, and only when it is a different site.
   * A full referrer URL can carry a search query, so it is discarded.
   */
  function referrerHost(referrer, ownHost) {
    if (!referrer) return '';
    try {
      var host = new URL(referrer).hostname;
      return host && host !== ownHost ? host : '';
    } catch (e) {
      return '';
    }
  }

  /** Page identity without any query string or fragment. */
  function pagePath(pathname) {
    var path = String(pathname || '/');
    var file = path.split('/').pop() || '';
    return file || 'index.html';
  }

  /**
   * Build the exact object that would be sent. Pure: everything it needs is
   * passed in, so the tests can pin the output down.
   *
   * @param {string} event
   * @param {Object} [props] event-specific values, already safe to send
   * @param {Object} ctx { site, path, lang, view, referrer, host, screenWidth }
   */
  function buildPayload(event, props, ctx) {
    var context = ctx || {};
    var payload = {
      site: context.site || (CONFIG && CONFIG.ANALYTICS_SITE) || 'app',
      event: String(event || 'unknown').slice(0, 40),
      path: pagePath(context.path),
      lang: String(context.lang || '').slice(0, 5),
      view: context.view === 'mobile' ? 'mobile' : 'desktop',
      screen: screenBand(context.screenWidth),
      ref: referrerHost(context.referrer, context.host).slice(0, 80)
    };

    var p = props || {};
    if (p.distanceKm != null) payload.distance = band(p.distanceKm, DISTANCE_BANDS, 'km');
    if (p.durationMs != null) payload.speed = band(p.durationMs, DURATION_BANDS, 'ms');
    if (p.countries != null) payload.countries = Math.min(20, Math.max(0, Math.round(Number(p.countries) || 0)));
    if (p.tollDetail) payload.detail = String(p.tollDetail).slice(0, 12);
    if (p.drivers != null) payload.drivers = Number(p.drivers) === 2 ? 2 : 1;
    if (p.errorCode) payload.error = String(p.errorCode).slice(0, 24);
    return payload;
  }

  /* ---------------------------------------------------------------- send */

  var context = null;

  function currentContext() {
    if (context) return context;
    context = {
      site: (CONFIG && CONFIG.ANALYTICS_SITE) || 'app',
      path: typeof location !== 'undefined' ? location.pathname : '/',
      host: typeof location !== 'undefined' ? location.hostname : '',
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      screenWidth: typeof window !== 'undefined' ? (window.innerWidth || 0) : 0,
      view: null
    };
    return context;
  }

  function enabled() {
    return !!(CONFIG && CONFIG.ANALYTICS_ENDPOINT) && TRP.consent && TRP.consent.has('analytics');
  }

  function post(payload) {
    var url = CONFIG.ANALYTICS_ENDPOINT;
    var body = JSON.stringify(payload);
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        /* text/plain keeps it a CORS-simple request, so no preflight. */
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(url, blob)) return true;
      }
      fetch(url, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        mode: 'cors',
        credentials: 'omit'
      }).catch(function () { /* measurement must never disturb the app */ });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Record one event. Silently does nothing without consent or a collector.
   * @returns {boolean} whether anything was sent
   */
  function track(event, props) {
    if (!enabled()) return false;
    var ctx = currentContext();
    ctx.lang = TRP.i18n ? TRP.i18n.lang() : '';
    ctx.screenWidth = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
    return post(buildPayload(event, props, ctx));
  }

  /** One page view for the current build. */
  function pageView(view) {
    currentContext().view = view;
    return track('pageview');
  }

  /**
   * Wire up: send the page view once, and re-send it if consent is granted
   * later in the same visit.
   */
  function init(view) {
    if (!CONFIG || !CONFIG.ANALYTICS_ENDPOINT) return;
    currentContext().view = view;
    var sent = false;
    function attempt() {
      if (sent || !enabled()) return;
      sent = pageView(view);
    }
    attempt();
    if (TRP.consent) TRP.consent.onChange(attempt);
  }

  TRP.analytics = {
    DISTANCE_BANDS: DISTANCE_BANDS,
    DURATION_BANDS: DURATION_BANDS,
    band: band,
    screenBand: screenBand,
    referrerHost: referrerHost,
    pagePath: pagePath,
    buildPayload: buildPayload,
    enabled: enabled,
    track: track,
    pageView: pageView,
    init: init
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.analytics;
})(typeof globalThis !== 'undefined' ? globalThis : this);
