/**
 * Truck Route Planner - Google Analytics tests.
 *
 * Google's own snippet is meant to go straight into <head>, where it fires a
 * page view and sets the _ga cookie before any banner has been answered. For a
 * route planner GA is not strictly necessary, so under Article 5(3) of the
 * ePrivacy Directive that is exactly the thing that needs consent first.
 *
 * The load *order* is therefore the whole point of js/core/ga.js, and it is
 * not something a reviewer can see at a glance - the tag is injected from a
 * consent callback several files away. So these tests pin it down: no script
 * element and no request before a grant, and cookies actually deleted on
 * withdrawal rather than merely stopping new ones.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  if (typeof require !== 'function' || typeof module === 'undefined') return;

  var TRP = (global.TRP = global.TRP || {});
  if (!global.TRPTest) require('./harness.js');
  if (!TRP.CONFIG) require('../js/core/config.js');
  if (!TRP.consent) require('../js/core/consent.js');

  var T = global.TRPTest;
  var describe = T.describe;
  var test = T.test;
  var assert = T.assert;
  var CONFIG = TRP.CONFIG;

  var ID = 'G-TESTID1234';

  /* ------------------------------------------------------------ fake DOM */

  var saved = {};

  function fakeDom() {
    var head = { children: [] };
    var doc = {
      cookie: '',
      head: {
        appendChild: function (node) { head.children.push(node); }
      },
      createElement: function () {
        return { tagName: 'SCRIPT', async: false, src: '', id: '' };
      }
    };
    doc.__scripts = head.children;
    return doc;
  }

  function fakeStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; }
    };
  }

  /**
   * Run against a fresh document, localStorage and consent state, with GA
   * configured. Everything is restored afterwards so no other suite is
   * affected by a stray global.
   */
  function withGa(options, fn) {
    var opts = options || {};
    ['document', 'location', 'localStorage', 'dataLayer', 'gtag'].forEach(function (k) {
      saved[k] = Object.getOwnPropertyDescriptor(global, k);
    });

    var doc = fakeDom();
    Object.defineProperty(global, 'document', { value: doc, configurable: true, writable: true });
    Object.defineProperty(global, 'location', {
      value: { hostname: 'planificador.ggabor.online', pathname: '/desktop.html' },
      configurable: true, writable: true
    });
    Object.defineProperty(global, 'localStorage', {
      value: fakeStorage(), configurable: true, writable: true
    });
    delete global.dataLayer;
    delete global.gtag;

    var beforeId = CONFIG.GA_MEASUREMENT_ID;
    var beforeEndpoint = CONFIG.ANALYTICS_ENDPOINT;
    CONFIG.GA_MEASUREMENT_ID = opts.id === undefined ? ID : opts.id;
    CONFIG.ANALYTICS_ENDPOINT = '';

    /* ga.js is required after CONFIG is set, but it reads CONFIG lazily so a
       single require is enough for every case. */
    var ga = require('../js/core/ga.js');
    ga.reset();
    TRP.consent.reset();

    try {
      return fn(ga, TRP.consent, doc);
    } finally {
      CONFIG.GA_MEASUREMENT_ID = beforeId;
      CONFIG.ANALYTICS_ENDPOINT = beforeEndpoint;
      ga.reset();
      TRP.consent.reset();
      Object.keys(saved).forEach(function (k) {
        if (saved[k]) Object.defineProperty(global, k, saved[k]);
        else delete global[k];
      });
    }
  }

  function scriptsOf(doc) {
    return doc.__scripts.filter(function (n) { return /googletagmanager/.test(n.src || ''); });
  }

  /* ------------------------------------------------- nothing before consent */

  describe('ga - nothing loads before consent', function () {
    test('no tag is injected while the banner is unanswered', function () {
      withGa({}, function (ga, consent, doc) {
        ga.init();
        assert.equal(consent.needsPrompt(), true, 'no decision has been made yet');
        assert.equal(ga.started(), false, 'GA has not started');
        assert.equal(scriptsOf(doc).length, 0,
          'the Google tag must not be in the document before a grant');
        assert.equal(global.dataLayer, undefined, 'and no dataLayer exists yet');
      });
    });

    test('refusing keeps it off', function () {
      withGa({}, function (ga, consent, doc) {
        ga.init();
        consent.rejectAll();
        assert.equal(ga.enabled(), false);
        assert.equal(scriptsOf(doc).length, 0, 'still no tag after a refusal');
      });
    });

    test('accepting only preferences does not start GA', function () {
      withGa({}, function (ga, consent, doc) {
        ga.init();
        consent.save({ preferences: true, analytics: false });
        assert.equal(ga.enabled(), false, 'analytics was not the category granted');
        assert.equal(scriptsOf(doc).length, 0, 'no tag');
      });
    });

    test('with no measurement id nothing happens at all', function () {
      withGa({ id: '' }, function (ga, consent, doc) {
        assert.equal(ga.available(), false);
        assert.equal(ga.init(), false, 'init is a no-op');
        consent.acceptAll();
        ga.sync();
        assert.equal(scriptsOf(doc).length, 0, 'no tag without an id');
      });
    });

    test('the analytics category is offered once GA is configured', function () {
      withGa({}, function (ga, consent) {
        /* Even with no self-hosted collector, GA alone is reason to ask. */
        assert.equal(CONFIG.ANALYTICS_ENDPOINT, '');
        assert.equal(consent.analyticsAvailable(), true);
        assert.ok(consent.offered().indexOf(consent.ANALYTICS) !== -1);
      });
    });
  });

  /* ------------------------------------------------------- after a grant */

  describe('ga - it starts on consent', function () {
    test('accepting injects exactly one tag', function () {
      withGa({}, function (ga, consent, doc) {
        ga.init();
        consent.acceptAll();
        var tags = scriptsOf(doc);
        assert.equal(tags.length, 1, 'the tag is loaded once');
        assert.ok(tags[0].src.indexOf(ID) !== -1, 'and carries the measurement id');
        assert.equal(tags[0].async, true, 'loaded asynchronously');
        assert.equal(ga.started(), true);
      });
    });

    test('a second consent change does not add a second tag', function () {
      /* Two tags would double every number while looking perfectly normal. */
      withGa({}, function (ga, consent, doc) {
        ga.init();
        consent.acceptAll();
        consent.save({ preferences: false, analytics: true });
        ga.sync();
        assert.equal(scriptsOf(doc).length, 1, 'still exactly one tag');
      });
    });

    test('advertising signals are switched off', function () {
      withGa({}, function (ga, consent) {
        ga.init();
        consent.acceptAll();
        var calls = (global.dataLayer || []).map(function (a) { return Array.prototype.slice.call(a); });

        var config = calls.filter(function (c) { return c[0] === 'config'; })[0];
        assert.ok(config, 'a config call was made');
        assert.equal(config[2].allow_google_signals, false,
          'Google Signals turns measurement into advertising and needs a wider consent');
        assert.equal(config[2].allow_ad_personalization_signals, false);

        var denied = calls.filter(function (c) {
          return c[0] === 'consent' && c[1] === 'default';
        })[0];
        assert.ok(denied, 'consent mode defaults are declared');
        assert.equal(denied[2].ad_storage, 'denied');
        assert.equal(denied[2].ad_personalization, 'denied');
      });
    });

    test('the page path carries no query string', function () {
      withGa({}, function (ga) {
        assert.equal(ga.pagePath(), '/desktop.html');
        assert.equal(ga.pagePath().indexOf('?'), -1);
      });
    });

    test('track() does nothing until GA has started', function () {
      withGa({}, function (ga, consent) {
        assert.equal(ga.track('route_calculated', {}), false, 'refused before consent');
        ga.init();
        consent.acceptAll();
        global.gtag = function () { (global.__sent = global.__sent || []).push(arguments); };
        assert.equal(ga.track('route_calculated', { countries: 3 }), true, 'sent after consent');
        delete global.__sent;
      });
    });
  });

  /* ---------------------------------------------------------- withdrawal */

  describe('ga - withdrawing deletes the cookies', function () {
    test('the _ga cookies are expired when consent is withdrawn', function () {
      withGa({}, function (ga, consent, doc) {
        ga.init();
        consent.acceptAll();

        /* Stand in for what Google would have set. */
        doc.cookie = '_ga=GA1.1.123.456; _ga_TESTID1234=GS1.1.789; trp.lang=es';
        var written = [];
        Object.defineProperty(doc, 'cookie', {
          get: function () { return '_ga=GA1.1.123.456; _ga_TESTID1234=GS1.1.789; trp.lang=es'; },
          set: function (v) { written.push(v); },
          configurable: true
        });

        consent.withdraw();
        ga.sync();

        var expired = written.filter(function (c) { return /expires=Thu, 01 Jan 1970/.test(c); });
        assert.ok(expired.some(function (c) { return c.indexOf('_ga=') === 0; }),
          'the _ga cookie is expired');
        assert.ok(expired.some(function (c) { return c.indexOf('_ga_TESTID1234=') === 0; }),
          'the per-stream cookie is expired too - its name is not known in advance');
        assert.ok(expired.some(function (c) { return /domain=\.ggabor\.online/.test(c); }),
          'and on the parent domain, where GA actually set it');
        assert.equal(ga.enabled(), false, 'GA is off afterwards');
      });
    });

    test('withdrawal denies consent mode as well as dropping cookies', function () {
      withGa({}, function (ga, consent) {
        ga.init();
        consent.acceptAll();
        var before = (global.dataLayer || []).length;
        consent.withdraw();
        ga.sync();
        var calls = (global.dataLayer || []).slice(before)
          .map(function (a) { return Array.prototype.slice.call(a); });
        var update = calls.filter(function (c) {
          return c[0] === 'consent' && c[1] === 'update';
        }).pop();
        assert.ok(update, 'a consent update is sent');
        assert.equal(update[2].analytics_storage, 'denied');
      });
    });

    test('a non-analytics cookie is left alone', function () {
      withGa({}, function (ga, consent, doc) {
        var written = [];
        Object.defineProperty(doc, 'cookie', {
          get: function () { return 'trp.lang=es'; },
          set: function (v) { written.push(v); },
          configurable: true
        });
        consent.acceptAll();
        consent.withdraw();
        assert.equal(written.filter(function (c) { return c.indexOf('trp.lang=') === 0; }).length, 0,
          'language is strictly necessary and is not a cookie we set anyway');
      });
    });
  });

  /* ------------------------------------------------------------ inventory */

  describe('ga - the policy table follows the configuration', function () {
    test('the _ga row appears only when GA is configured', function () {
      withGa({ id: '' }, function (ga, consent) {
        var ids = consent.inventory().map(function (i) { return i.id; });
        assert.equal(ids.indexOf('ga'), -1,
          'a cookie this deployment never sets must not be listed');
      });
      withGa({}, function (ga, consent) {
        var ids = consent.inventory().map(function (i) { return i.id; });
        assert.ok(ids.indexOf('ga') !== -1, 'and it is listed once GA is on');
      });
    });

    test('the _ga row is declared as an analytics cookie', function () {
      withGa({}, function (ga, consent) {
        var row = consent.inventory().filter(function (i) { return i.id === 'ga'; })[0];
        assert.equal(row.kind, 'cookie', 'it is a cookie, not local storage');
        assert.equal(row.category, consent.ANALYTICS, 'and needs the analytics grant');
        assert.equal(row.prefix, true, 'the per-stream name is matched by prefix');
        assert.ok(row.retentionMonths > 0, 'with a stated lifetime');
      });
    });
  });

  /* --------------------------------------------------- the policy is true */

  /*
   * The privacy texts are prose, so nothing stops them contradicting the code.
   * When Google Analytics went in, five claims became false at once - and two
   * more were only caught by reading every string by hand afterwards. This
   * suite is that reading, written down.
   */
  describe('ga - the privacy texts match what the code does', function () {
    var i18n = TRP.i18n || require('../js/core/i18n.js');

    /** Claims that cannot be true while a third-party tracker is shipped. */
    var FORBIDDEN = [
      { pattern: /writes no HTTP cookies\./i, why: 'GA sets cookies' },
      { pattern: /\bno tracking\b/i, why: 'GA is tracking' },
      { pattern: /shared with nobody/i, why: 'the data goes to Google' },
      { pattern: /no persistent identifier/i, why: 'the _ga cookie is one' },
      { pattern: /nothing shared with third parties/i, why: 'Google is a third party' }
    ];

    test('no English string makes a claim GA contradicts', function () {
      var offenders = [];
      Object.keys(i18n.STRINGS).forEach(function (key) {
        var en = (i18n.STRINGS[key] && i18n.STRINGS[key].en) || '';
        FORBIDDEN.forEach(function (rule) {
          if (rule.pattern.test(en)) offenders.push(key + ' (' + rule.why + ')');
        });
      });
      assert.deepEqual(offenders, [], 'privacy claims contradicted by the code');
    });

    test('the same holds in Spanish', function () {
      /* Spanish is the default language, so a stale claim there is the one
         most visitors would actually read. */
      var offenders = [];
      var esForbidden = [/no escribe cookies HTTP\./i, /sin seguimiento/i, /no se comparten con nadie/i];
      Object.keys(i18n.STRINGS).forEach(function (key) {
        var es = (i18n.STRINGS[key] && i18n.STRINGS[key].es) || '';
        esForbidden.forEach(function (re) { if (re.test(es)) offenders.push(key); });
      });
      assert.deepEqual(offenders, [], 'Spanish privacy claims contradicted by the code');
    });

    test('the analytics description names Google, in every language', function () {
      /* Consent has to be informed. A category called "audience measurement"
         that does not say who receives the data is not informed consent. */
      var packs = require('../tools/build-backends.js') && i18n.available();
      var missing = [];
      i18n.BASE_LANGS.forEach(function (code) {
        var text = i18n.STRINGS['cookie.cat.analyticsDesc'][code] || '';
        if (text.indexOf('Google') === -1) missing.push(code);
      });
      assert.deepEqual(missing, [], 'languages whose analytics description omits Google');
      assert.ok(packs.length === 24, 'and all 24 languages are still present');
    });

    test('the policy explains that withdrawing deletes the cookies', function () {
      var en = i18n.STRINGS['privacy.s4body'].en;
      assert.ok(/withdraw/i.test(en), 'withdrawal is described');
      assert.ok(/delete|deletes/i.test(en), 'and says the cookies are deleted');
      assert.ok(/14 months/i.test(en), 'and states how long Google keeps the data');
    });
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
