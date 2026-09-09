/**
 * Truck Route Planner - consent state (ePrivacy / GDPR).
 *
 * Article 5(3) of the ePrivacy Directive treats `localStorage` exactly like a
 * cookie: storage that is *strictly necessary for a service the user
 * explicitly requested* is exempt from consent, everything else is not. So the
 * inventory below covers both, and says which each row is.
 *
 * The application itself writes no HTTP cookies. Google Analytics does, when
 * it is configured and the visitor has allowed it - which is precisely why
 * those rows are listed here and deleted on withdrawal rather than being left
 * to outlive the permission that created them.
 *
 * So the inventory below is split into three categories:
 *
 *   necessary   - language, theme, chosen build, the consent record itself and
 *                 the country cache. Exempt, always on, never asked about.
 *   preferences - remembering the form between visits. Convenience only.
 *   analytics   - anonymous audience measurement. Off until granted.
 *
 * Nothing outside `necessary` may be written before `has(category)` is true.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.util) require('./util.js');
  }
  var CONFIG = TRP.CONFIG;

  var NECESSARY = 'necessary';
  var PREFERENCES = 'preferences';
  var ANALYTICS = 'analytics';

  /** Categories the user can actually decide about. */
  var OPTIONAL = [PREFERENCES, ANALYTICS];
  var CATEGORIES = [NECESSARY].concat(OPTIONAL);

  /**
   * `kind` says where an item lives: 'local' for localStorage, 'cookie' for a
   * real HTTP cookie. Google Analytics sets cookies rather than localStorage,
   * and they have to be listed and deleted differently, so the distinction
   * cannot be glossed over.
   *
   * `prefix: true` means the name plus anything beginning with it and an
   * underscore. GA4's per-stream cookie is `_ga_<STREAM_ID>`, and the stream
   * id is not known here.
   *
   * `requires` hides a row unless that integration is actually configured, so
   * the published policy never lists a cookie this deployment does not set.
   */
  var INVENTORY = [
    { key: 'trp.lang', id: 'lang', category: NECESSARY, retentionMonths: null, kind: 'local' },
    { key: 'trp.theme', id: 'theme', category: NECESSARY, retentionMonths: null, kind: 'local' },
    { key: 'trp.viewPreference', id: 'view', category: NECESSARY, retentionMonths: null, kind: 'local' },
    { key: 'trp.consent', id: 'consent', category: NECESSARY, retentionMonths: 12, kind: 'local' },
    { key: 'trp.countryCache.v1', id: 'countryCache', category: NECESSARY, retentionMonths: null, kind: 'local' },
    { key: 'trp.form.v1', id: 'form', category: PREFERENCES, retentionMonths: null, kind: 'local' },
    {
      key: '_ga', id: 'ga', category: ANALYTICS, retentionMonths: 24,
      kind: 'cookie', prefix: true, requires: 'ga'
    }
  ];

  /** True when the integration behind an inventory row is configured. */
  function integrationOn(name) {
    if (name === 'ga') return !!(CONFIG && CONFIG.GA_MEASUREMENT_ID);
    return true;
  }

  /**
   * The rows that apply to this deployment. The privacy page renders this,
   * so a cookie that is never set is never advertised.
   */
  function inventory() {
    return INVENTORY.filter(function (item) {
      return !item.requires || integrationOn(item.requires);
    });
  }

  /**
   * Delete a cookie, trying the paths and domains it could have been set on.
   * A cookie written for `.example.org` is not removed by expiring it on
   * `www.example.org`, and getting this wrong would leave data behind after
   * someone had withdrawn their consent.
   */
  function dropCookie(name) {
    if (typeof document === 'undefined') return;
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    var host = (typeof location !== 'undefined' && location.hostname) || '';
    var domains = [null, host];
    var parts = host.split('.');
    for (var i = 0; i < parts.length - 1; i += 1) {
      domains.push('.' + parts.slice(i).join('.'));
    }
    domains.forEach(function (domain) {
      var cookie = name + '=; expires=' + past + '; path=/';
      if (domain) cookie += '; domain=' + domain;
      try { document.cookie = cookie; } catch (e) { /* ignore */ }
    });
  }

  /** Every cookie currently set whose name matches an inventory row. */
  function matchingCookies(item) {
    if (typeof document === 'undefined' || !document.cookie) return [];
    return document.cookie.split(';').map(function (pair) {
      return pair.split('=')[0].trim();
    }).filter(function (name) {
      if (!name) return false;
      return name === item.key || (item.prefix && name.indexOf(item.key + '_') === 0);
    });
  }

  var listeners = [];
  var cache = null;

  function storageKey() { return (CONFIG && CONFIG.CONSENT_KEY) || 'trp.consent'; }
  function version() { return (CONFIG && CONFIG.CONSENT_VERSION) || 1; }
  function months() { return (CONFIG && CONFIG.CONSENT_MONTHS) || 12; }

  /** Analytics can only be offered when a collector is configured. */
  function analyticsAvailable() {
    /* Either measurement backend counts: the self-hosted collector, Google
       Analytics, or both. If neither is configured the category is not
       offered at all, so nobody is asked to decide about nothing. */
    return !!(CONFIG && (CONFIG.ANALYTICS_ENDPOINT || CONFIG.GA_MEASUREMENT_ID));
  }

  /** The optional categories worth showing on this deployment. */
  function offered() {
    return OPTIONAL.filter(function (c) {
      return c !== ANALYTICS || analyticsAvailable();
    });
  }

  function readRaw() {
    try {
      var raw = localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeRaw(record) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(record));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Months between an ISO timestamp and now, as a float. */
  function monthsSince(iso) {
    var then = new Date(iso).getTime();
    if (!isFinite(then)) return Infinity;
    return (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44);
  }

  /**
   * The stored decision, or null when there is none, it is for an older set
   * of categories, or it has aged out.
   */
  function get() {
    if (cache) return cache;
    var record = readRaw();
    if (!record || record.v !== version()) return null;
    if (monthsSince(record.ts) > months()) return null;
    if (!record.cats || typeof record.cats !== 'object') return null;
    cache = record;
    return cache;
  }

  /** True when the banner should be shown. */
  function needsPrompt() {
    return get() === null;
  }

  /**
   * Is this category allowed right now?
   * `necessary` is always true; anything else needs a stored grant.
   */
  function has(category) {
    if (category === NECESSARY) return true;
    if (category === ANALYTICS && !analyticsAvailable()) return false;
    var record = get();
    return !!(record && record.cats[category] === true);
  }

  /** The decision as a plain `{preferences: bool, analytics: bool}` map. */
  function state() {
    var out = {};
    OPTIONAL.forEach(function (c) { out[c] = has(c); });
    return out;
  }

  /** When the decision was made, or null. */
  function decidedAt() {
    var record = get();
    return record ? record.ts : null;
  }

  function notify() {
    var snapshot = state();
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (e) { /* a listener must not break the rest */ }
    });
  }

  /**
   * Record a decision.
   * @param {{preferences?:boolean, analytics?:boolean}} choices
   */
  function save(choices) {
    var cats = {};
    OPTIONAL.forEach(function (c) { cats[c] = choices && choices[c] === true; });
    cache = { v: version(), ts: new Date().toISOString(), cats: cats };
    writeRaw(cache);
    clearDenied();
    notify();
    return state();
  }

  /** Grant everything on offer. */
  function acceptAll() {
    var choices = {};
    offered().forEach(function (c) { choices[c] = true; });
    return save(choices);
  }

  /** Refuse everything optional; the necessary items stay. */
  function rejectAll() {
    return save({});
  }

  /**
   * Forget the decision entirely and delete the optional data, so the next
   * visit asks again from a clean slate.
   */
  function withdraw() {
    cache = null;
    try { localStorage.removeItem(storageKey()); } catch (e) { /* ignore */ }
    purge(OPTIONAL);
    notify();
    return state();
  }

  /** Delete the stored values of every category that is not granted. */
  function clearDenied() {
    purge(OPTIONAL.filter(function (c) { return !has(c); }));
  }

  /**
   * Erase everything belonging to these categories.
   *
   * Withdrawing consent has to actually remove the data it allowed, not just
   * stop collecting more - otherwise a Google Analytics cookie set months ago
   * would quietly outlive the permission that created it.
   */
  function purge(categories) {
    INVENTORY.forEach(function (item) {
      if (categories.indexOf(item.category) === -1) return;
      if (item.kind === 'cookie') {
        matchingCookies(item).forEach(dropCookie);
        /* Also try the bare name, in case it is set on a domain this page
           cannot read back but can still expire. */
        dropCookie(item.key);
        return;
      }
      try { localStorage.removeItem(item.key); } catch (e) { /* ignore */ }
    });
  }

  /**
   * Guarded write: stores a value only when its category is allowed.
   * @returns {boolean} whether it was written
   */
  function storeIfAllowed(category, key, value) {
    if (!has(category)) return false;
    return TRP.util.storageSet(key, value);
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /** Drop the memoised record; used by the tests. */
  function reset() { cache = null; }

  TRP.consent = {
    NECESSARY: NECESSARY,
    PREFERENCES: PREFERENCES,
    ANALYTICS: ANALYTICS,
    CATEGORIES: CATEGORIES,
    OPTIONAL: OPTIONAL,
    INVENTORY: INVENTORY,
    inventory: inventory,
    dropCookie: dropCookie,
    matchingCookies: matchingCookies,
    analyticsAvailable: analyticsAvailable,
    offered: offered,
    get: get,
    state: state,
    decidedAt: decidedAt,
    needsPrompt: needsPrompt,
    has: has,
    save: save,
    acceptAll: acceptAll,
    rejectAll: rejectAll,
    withdraw: withdraw,
    clearDenied: clearDenied,
    storeIfAllowed: storeIfAllowed,
    onChange: onChange,
    reset: reset,
    monthsSince: monthsSince
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.consent;
})(typeof globalThis !== 'undefined' ? globalThis : this);
