/**
 * Truck Route Planner - consent state tests.
 *
 * Consent is the one place where a bug is a legal problem rather than a
 * cosmetic one, so these tests pin down the rules that matter:
 *
 *   - strictly necessary storage never asks and is never blocked;
 *   - optional storage is refused until it is explicitly granted;
 *   - refusing is recorded, not treated as "ask me again";
 *   - a stale or foreign decision re-prompts instead of being trusted;
 *   - withdrawing consent deletes what that consent allowed.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function' && typeof module !== 'undefined') {
    if (!global.TRPTest) require('./harness.js');
    if (!TRP.CONFIG) require('../js/core/config.js');
    if (!TRP.util) require('../js/core/util.js');
    if (!TRP.consent) require('../js/core/consent.js');
  }

  var T = global.TRPTest;
  var describe = T.describe;
  var test = T.test;
  var assert = T.assert;
  var CONFIG = TRP.CONFIG;

  /*
   * Node has no localStorage, and in the browser we must not trample the real
   * one, so every test runs against a fresh in-memory stand-in. The module
   * reads `localStorage` off the global at call time, so swapping it is enough.
   */
  var realStorage = Object.getOwnPropertyDescriptor(global, 'localStorage');

  function fakeStorage() {
    var data = {};
    return {
      data: data,
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }

  /** Run `fn` against a clean storage and a clean consent cache. */
  function withStorage(fn) {
    var store = fakeStorage();
    Object.defineProperty(global, 'localStorage', {
      value: store, configurable: true, writable: true
    });
    var endpointBefore = CONFIG.ANALYTICS_ENDPOINT;
    try {
      /* consent.js caches the parsed record; reset() drops it. */
      TRP.consent.reset();
      return fn(store, TRP.consent);
    } finally {
      CONFIG.ANALYTICS_ENDPOINT = endpointBefore;
      TRP.consent.reset();
      if (realStorage) Object.defineProperty(global, 'localStorage', realStorage);
      else delete global.localStorage;
    }
  }

  describe('consent - categories offered', function () {
    test('analytics is not offered when no collector is configured', function () {
      withStorage(function (store, consent) {
        CONFIG.ANALYTICS_ENDPOINT = '';
        var offered = consent.offered();
        assert.ok(offered.indexOf(consent.PREFERENCES) !== -1,
          'preferences must always be offered');
        assert.equal(offered.indexOf(consent.ANALYTICS), -1,
          'analytics must not be offered with no endpoint');
        assert.equal(consent.has(consent.ANALYTICS), false,
          'analytics must be denied with no endpoint');
      });
    });

    test('analytics is offered once a collector is configured', function () {
      withStorage(function (store, consent) {
        CONFIG.ANALYTICS_ENDPOINT = 'https://example.invalid/api/collect';
        var offered = consent.offered();
        assert.equal(offered.length, 2, 'both optional categories are offered');
        assert.ok(offered.indexOf(consent.ANALYTICS) !== -1, 'analytics is offered');
      });
    });

    test('the inventory covers every category and nothing else', function () {
      withStorage(function (store, consent) {
        assert.ok(consent.INVENTORY.length > 0, 'the inventory is not empty');
        consent.INVENTORY.forEach(function (item) {
          assert.ok(consent.CATEGORIES.indexOf(item.category) !== -1,
            item.key + ' has a known category');
          assert.ok(/^trp\./.test(item.key), item.key + ' is namespaced');
        });
        /* The privacy page renders one row per entry; duplicates would double it. */
        var keys = consent.INVENTORY.map(function (i) { return i.key; });
        assert.equal(keys.length, keys.filter(function (k, i) {
          return keys.indexOf(k) === i;
        }).length, 'no duplicate keys in the inventory');
      });
    });
  });

  describe('consent - necessary storage is exempt', function () {
    test('necessary is allowed before any decision is made', function () {
      withStorage(function (store, consent) {
        assert.equal(consent.has(consent.NECESSARY), true,
          'strictly necessary storage never needs consent');
        assert.equal(consent.needsPrompt(), true,
          'but the banner is still due, because optional categories exist');
      });
    });

    test('a necessary key can be written with no decision on record', function () {
      withStorage(function (store, consent) {
        var ok = consent.storeIfAllowed(consent.NECESSARY, 'trp.lang', 'de');
        assert.equal(ok, true, 'the write is allowed');
        assert.ok(store.getItem('trp.lang') !== null, 'and it actually landed');
      });
    });
  });

  describe('consent - optional storage is blocked until granted', function () {
    test('a preferences write is refused before consent', function () {
      withStorage(function (store, consent) {
        var ok = consent.storeIfAllowed(consent.PREFERENCES, 'trp.form.v1', { origin: 'Madrid' });
        assert.equal(ok, false, 'the write is refused');
        assert.equal(store.getItem('trp.form.v1'), null, 'nothing was stored');
      });
    });

    test('the same write succeeds after acceptAll', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        var ok = consent.storeIfAllowed(consent.PREFERENCES, 'trp.form.v1', { origin: 'Madrid' });
        assert.equal(ok, true, 'the write is allowed');
        assert.ok(store.getItem('trp.form.v1') !== null, 'and it landed');
      });
    });

    test('rejectAll records a decision instead of leaving it open', function () {
      withStorage(function (store, consent) {
        consent.rejectAll();
        assert.equal(consent.needsPrompt(), false,
          'a refusal is a decision - the banner must not come back');
        assert.equal(consent.has(consent.PREFERENCES), false, 'preferences stay denied');
        assert.ok(consent.decidedAt(), 'the refusal is timestamped');
      });
    });

    test('save() honours a partial choice', function () {
      withStorage(function (store, consent) {
        CONFIG.ANALYTICS_ENDPOINT = 'https://example.invalid/api/collect';
        consent.save({ preferences: true, analytics: false });
        assert.equal(consent.has(consent.PREFERENCES), true, 'preferences granted');
        assert.equal(consent.has(consent.ANALYTICS), false, 'analytics still denied');
      });
    });
  });

  describe('consent - the stored record is not blindly trusted', function () {
    test('a record from an older category set re-prompts', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        var record = JSON.parse(store.getItem(CONFIG.CONSENT_KEY));
        record.v = CONFIG.CONSENT_VERSION - 1;
        store.setItem(CONFIG.CONSENT_KEY, JSON.stringify(record));
        consent.reset();
        assert.equal(consent.needsPrompt(), true, 'an outdated version asks again');
        assert.equal(consent.has(consent.PREFERENCES), false, 'and grants nothing');
      });
    });

    test('a decision older than the retention window re-prompts', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        var record = JSON.parse(store.getItem(CONFIG.CONSENT_KEY));
        var ageDays = (CONFIG.CONSENT_MONTHS + 1) * 31;
        record.ts = new Date(Date.now() - ageDays * 24 * 3600 * 1000).toISOString();
        store.setItem(CONFIG.CONSENT_KEY, JSON.stringify(record));
        consent.reset();
        assert.equal(consent.needsPrompt(), true, 'a stale consent expires');
        assert.equal(consent.has(consent.PREFERENCES), false, 'and grants nothing');
      });
    });

    test('a corrupt record re-prompts rather than throwing', function () {
      withStorage(function (store, consent) {
        store.setItem(CONFIG.CONSENT_KEY, '{not json');
        consent.reset();
        assert.equal(consent.needsPrompt(), true, 'unreadable means undecided');
      });
    });
  });

  describe('consent - withdrawal', function () {
    test('withdraw() denies the optional categories again', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        consent.withdraw();
        assert.equal(consent.has(consent.PREFERENCES), false, 'preferences revoked');
        assert.equal(consent.needsPrompt(), true, 'and the choice is open again');
      });
    });

    test('withdraw() deletes the data that consent had allowed', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        consent.storeIfAllowed(consent.PREFERENCES, 'trp.form.v1', { origin: 'Madrid' });
        consent.storeIfAllowed(consent.NECESSARY, 'trp.lang', 'de');
        consent.withdraw();
        assert.equal(store.getItem('trp.form.v1'), null,
          'the optional data is erased, not just ignored');
        assert.ok(store.getItem('trp.lang') !== null,
          'necessary data survives - it was never covered by the consent');
      });
    });

    test('clearDenied() erases only the categories that are now denied', function () {
      withStorage(function (store, consent) {
        consent.acceptAll();
        consent.storeIfAllowed(consent.PREFERENCES, 'trp.form.v1', { origin: 'Madrid' });
        consent.save({ preferences: false, analytics: false });
        consent.clearDenied();
        assert.equal(store.getItem('trp.form.v1'), null, 'refused data is removed');
        assert.ok(store.getItem(CONFIG.CONSENT_KEY) !== null,
          'the consent record itself is kept, or we would ask forever');
      });
    });
  });

  describe('consent - change notification', function () {
    test('onChange fires with the new state after every decision', function () {
      withStorage(function (store, consent) {
        var seen = [];
        consent.onChange(function (s) { seen.push(s); });
        consent.acceptAll();
        consent.rejectAll();
        assert.equal(seen.length, 2, 'one notification per decision');
        assert.equal(seen[0].preferences, true, 'the first reports the grant');
        assert.equal(seen[1].preferences, false, 'the second reports the refusal');
      });
    });

    test('withdrawing also notifies, so live features can switch off', function () {
      withStorage(function (store, consent) {
        var last = null;
        consent.onChange(function (s) { last = s; });
        consent.acceptAll();
        consent.withdraw();
        assert.ok(last, 'a withdrawal is announced');
        assert.equal(last.preferences, false, 'and reports the revoked state');
      });
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
