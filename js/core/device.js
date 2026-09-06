/**
 * Truck Route Planner - device detection and view routing.
 *
 * The entry page (index.html) uses this to send phones and small tablets to
 * the touch-optimised mobile build and everything else to the desktop build.
 * The choice can always be overridden with `?view=desktop` / `?view=mobile`.
 * Only a choice made on the entry page itself is remembered; the in-app
 * "mobile view" / "desktop version" links are not sticky.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  /* v2: bumped when the URL override stopped being sticky, so a mobile
     preference saved by the old behaviour no longer hijacks the entry page. */
  var STORAGE_KEY = 'trp.viewPreference.v2';

  var MOBILE_UA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;
  var TABLET_UA = /iPad|Tablet|PlayBook|Nexus 7|Nexus 10|KFAPWI/i;

  function nav() {
    return (typeof navigator !== 'undefined' && navigator) || {};
  }

  /** Collected signals used to classify the device. */
  function inspect() {
    var n = nav();
    var ua = n.userAgent || '';
    var width = typeof window !== 'undefined' && window.screen
      ? Math.min(window.screen.width || 0, window.innerWidth || window.screen.width || 0)
      : 0;
    var touchPoints = Number(n.maxTouchPoints || 0);
    var coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    /* iPadOS 13+ reports a desktop UA, so detect it via touch points. */
    var isIpadOS = /Macintosh/.test(ua) && touchPoints > 1;

    return {
      userAgent: ua,
      width: width,
      touchPoints: touchPoints,
      coarsePointer: !!coarse,
      isPhoneUA: MOBILE_UA.test(ua) && !TABLET_UA.test(ua),
      isTabletUA: TABLET_UA.test(ua) || isIpadOS,
      isStandalone: typeof window !== 'undefined' && (
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        n.standalone === true
      )
    };
  }

  /**
   * Classify the device.
   * @returns {'mobile'|'desktop'}
   */
  function detect() {
    var s = inspect();
    if (s.isPhoneUA) return 'mobile';
    if (s.isTabletUA) return s.width && s.width >= 900 ? 'desktop' : 'mobile';
    /* A narrow window on a mouse-driven device is still a desktop: the
       desktop layout stacks below 900 px on its own. */
    if (s.coarsePointer && s.width && s.width < 900) return 'mobile';
    return 'desktop';
  }

  /** Explicit `?view=` override in the current URL. */
  function urlOverride() {
    if (typeof location === 'undefined') return null;
    var match = /[?&]view=(mobile|desktop)/i.exec(location.search || '');
    return match ? match[1].toLowerCase() : null;
  }

  function remembered() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'mobile' || value === 'desktop' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function remember(view) {
    try { localStorage.setItem(STORAGE_KEY, view); } catch (e) { /* ignore */ }
  }

  function forget() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  /**
   * The view that should be shown: URL override, then stored preference,
   * then automatic detection.
   */
  function resolveView() {
    var override = urlOverride();
    if (override) return { view: override, reason: 'url' };
    var saved = remembered();
    if (saved) return { view: saved, reason: 'saved' };
    return { view: detect(), reason: 'auto' };
  }

  /** Navigate to the other build for this visit (does not change the saved preference). */
  function switchTo(view) {
    if (typeof location !== 'undefined') {
      location.href = (view === 'mobile' ? 'mobile.html' : 'desktop.html') + '?view=' + view;
    }
  }

  TRP.device = {
    STORAGE_KEY: STORAGE_KEY,
    inspect: inspect,
    detect: detect,
    urlOverride: urlOverride,
    remembered: remembered,
    remember: remember,
    forget: forget,
    resolveView: resolveView,
    switchTo: switchTo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.device;
})(typeof globalThis !== 'undefined' ? globalThis : this);
