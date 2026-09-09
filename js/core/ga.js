/**
 * Truck Route Planner - Google Analytics 4.
 *
 * Off unless `GA_MEASUREMENT_ID` is set in config.js, and even then nothing
 * loads until the visitor has granted the `analytics` category.
 *
 * The order matters and is the whole point of this file. Google's own snippet
 * is usually pasted straight into <head>, which fires a page view - and sets
 * the _ga cookie - before any banner has been answered. Under Article 5(3) of
 * the ePrivacy Directive that is the thing you may not do: GA is not strictly
 * necessary for a route planner, so the cookie needs consent *first*. So the
 * tag is injected on grant and never before.
 *
 * Two settings are deliberately off:
 *
 *   allow_google_signals            cross-device tracking and demographics,
 *                                   which pull this from measurement into
 *                                   advertising and would need a wider consent
 *                                   than the banner asks for.
 *   allow_ad_personalization_signals sharing the visit for ad targeting.
 *
 * With both disabled this stays audience measurement, which is what the
 * banner, the privacy policy and the consent category all describe. Turning
 * either on would make those texts untrue.
 *
 * GA4 truncates IP addresses before storage and offers no option to keep them,
 * so there is nothing to configure there.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function' && typeof module !== 'undefined') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.consent) require('./consent.js');
  }
  var CONFIG = TRP.CONFIG;

  var SCRIPT_ID = 'trp-ga-tag';
  var loaded = false;
  var started = false;

  function measurementId() {
    return (CONFIG && CONFIG.GA_MEASUREMENT_ID) || '';
  }

  /** Configured for this deployment at all? */
  function available() {
    return !!measurementId();
  }

  /** Configured *and* allowed right now. */
  function enabled() {
    return available() && !!(TRP.consent && TRP.consent.has(TRP.consent.ANALYTICS));
  }

  /** The gtag queue function, created before the remote script arrives. */
  function gtag() {
    if (!global.dataLayer) global.dataLayer = [];
    global.dataLayer.push(arguments);
  }

  /**
   * Inject the tag. Idempotent: a second consent change must not add a second
   * copy, which would double every count.
   */
  function load() {
    if (loaded || !available() || typeof document === 'undefined') return false;
    loaded = true;

    var id = measurementId();

    /*
     * Consent Mode. We only load after a grant, so this is belt and braces -
     * but it is what Google's own tooling expects to see, and it keeps the
     * advertising signals denied even if someone later adds a second tag that
     * does not go through this file.
     */
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });

    gtag('js', new Date());
    gtag('config', id, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      /* The app is a single page per build; the path is enough and carries no
         query string, so nothing a visitor typed can end up in a page view. */
      page_path: pagePath()
    });

    var script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(script);
    return true;
  }

  /** Page identity without any query string or fragment. */
  function pagePath() {
    if (typeof location === 'undefined') return '/';
    var file = (location.pathname || '/').split('/').pop();
    return '/' + (file || 'index.html');
  }

  /**
   * Stop measuring and remove what was set.
   *
   * The tag cannot be un-injected from a live page, so this denies consent
   * through Consent Mode, drops the cookies, and leaves `started` false so a
   * reload does not bring it back. Withdrawing has to actually delete data,
   * not merely stop adding to it.
   */
  function unload() {
    if (available() && global.dataLayer) {
      gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
    started = false;
    if (TRP.consent && TRP.consent.INVENTORY) {
      TRP.consent.INVENTORY.forEach(function (item) {
        if (item.kind !== 'cookie' || item.category !== TRP.consent.ANALYTICS) return;
        TRP.consent.matchingCookies(item).forEach(TRP.consent.dropCookie);
        TRP.consent.dropCookie(item.key);
      });
    }
    return true;
  }

  /**
   * Send a custom event. Silently does nothing when GA is not running, so
   * callers never have to check first.
   *
   * Only pass values that are already safe to send: this does no filtering of
   * its own, and an address handed to it would reach Google.
   */
  function track(name, params) {
    if (!started || !enabled() || !global.gtag) return false;
    global.gtag('event', String(name || 'event').slice(0, 40), params || {});
    return true;
  }

  /** Bring GA up or down to match the current consent state. */
  function sync() {
    if (enabled()) {
      if (!started) {
        load();
        started = true;
        /* The queue exists before the remote script arrives, so this is safe
           to assign either way. */
        if (!global.gtag) global.gtag = gtag;
      }
    } else if (started || hasCookies()) {
      unload();
    }
  }

  function hasCookies() {
    if (!TRP.consent || !TRP.consent.matchingCookies) return false;
    return TRP.consent.INVENTORY.some(function (item) {
      return item.kind === 'cookie' && item.category === TRP.consent.ANALYTICS &&
        TRP.consent.matchingCookies(item).length > 0;
    });
  }

  /**
   * Wire to the consent state and follow it from then on, so accepting starts
   * measurement and withdrawing stops it without a reload.
   */
  function init() {
    if (!available()) return false;
    sync();
    if (TRP.consent && TRP.consent.onChange) TRP.consent.onChange(sync);
    return true;
  }

  /** Test seam: forget that the tag was injected. */
  function reset() {
    loaded = false;
    started = false;
  }

  TRP.ga = {
    available: available,
    enabled: enabled,
    started: function () { return started; },
    pagePath: pagePath,
    load: load,
    unload: unload,
    sync: sync,
    track: track,
    init: init,
    reset: reset
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.ga;
})(typeof globalThis !== 'undefined' ? globalThis : this);
