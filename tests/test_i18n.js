/**
 * Tests for localisation: Spanish is the default, both dictionaries are
 * complete, and the datasets resolve per language.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var T = global.TRPTest;
  var TRP = global.TRP;
  var i18n = TRP.i18n;
  var assert = T.assert;

  /* Keys whose two translations are legitimately identical. */
  var SAME_BY_DESIGN = {
    'app.name': true,        /* the product name */
    'app.author': true,      /* the credit must read the same everywhere */
    'nav.plan': true, 'nav.info': true,
    'toll.km': true, 'toll.total': true, 'map.total': true,
    'stat.times45': true, 'legal.atKm': true
  };

  T.describe('localisation', function () {

    T.test('Spanish is the product default', function () {
      assert.equal(i18n.DEFAULT_LANG, 'es');
      assert.equal(i18n.detect(), 'es', 'with no stored choice the app must start in Spanish');
    });

    T.test('all 24 official EU languages are offered', function () {
      var codes = i18n.available();
      assert.equal(codes.length, 24, 'the EU has 24 official languages');
      /* The full list, so a dropped or renamed pack fails here rather than silently. */
      ['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'ga', 'hr',
       'hu', 'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'sv'
      ].forEach(function (code) {
        assert.ok(codes.indexOf(code) !== -1, code + ' is offered');
        assert.ok(i18n.languageName(code), code + ' has an endonym for the picker');
      });
      assert.equal(i18n.languageName('es'), 'Español');
      assert.equal(i18n.languageName('en'), 'English');
    });

    T.test('every offered language has a locale for number and date formatting', function () {
      i18n.available().forEach(function (code) {
        var entry = i18n.LANGS[code];
        assert.ok(entry && /^[a-z]{2}-[A-Z]{2}$/.test(entry.locale),
          code + ' has a well-formed locale, got ' + (entry && entry.locale));
      });
    });

    T.test('the locale follows the language', function () {
      i18n.set('es', true);
      assert.equal(i18n.locale(), 'es-ES');
      i18n.set('en', true);
      assert.equal(i18n.locale(), 'en-GB');
      i18n.set('es', true);
    });

    T.test('an unknown language code is ignored', function () {
      i18n.set('es', true);
      i18n.set('zz', true);      /* not an EU language, and never will be */
      assert.equal(i18n.lang(), 'es', 'the current language survives a bad code');
      i18n.set('en-US', true);   /* a region tag we do not carry a pack for */
      assert.equal(i18n.lang(), 'es');
      i18n.set('', true);
      assert.equal(i18n.lang(), 'es');
    });

    T.test('a non-base language must be loaded before it can be selected', function () {
      i18n.set('es', true);
      /* `set` is synchronous and only accepts what is already registered;
         the async `setAsync` path is what fetches a pack on demand. */
      assert.equal(i18n.isSupported('de'), true, 'German is a supported language');
      assert.equal(i18n.lang(), 'es', 'but selecting it did not happen behind our back');
    });

    /* ------------------------------------------------------- completeness */

    T.test('every key has both a Spanish and an English translation', function () {
      var missing = [];
      Object.keys(i18n.STRINGS).forEach(function (key) {
        var entry = i18n.STRINGS[key];
        if (!entry.es || !entry.en) missing.push(key);
      });
      assert.deepEqual(missing, [], 'keys missing a translation');
    });

    T.test('the Spanish text actually differs from the English', function () {
      var identical = [];
      Object.keys(i18n.STRINGS).forEach(function (key) {
        if (SAME_BY_DESIGN[key]) return;
        if (i18n.STRINGS[key].es === i18n.STRINGS[key].en) identical.push(key);
      });
      assert.deepEqual(identical, [], 'keys left untranslated');
    });

    T.test('the author credit is identical in both languages', function () {
      assert.equal(i18n.STRINGS['app.author'].es, 'created by Gabor Gasko');
      assert.equal(i18n.STRINGS['app.author'].en, 'created by Gabor Gasko');
    });

    /* ------------------------------------------------------------ lookup */

    T.test('translation switches with the language', function () {
      i18n.set('es', true);
      assert.equal(i18n.t('form.calculate'), 'Calcular ruta');
      i18n.set('en', true);
      assert.equal(i18n.t('form.calculate'), 'Calculate Route');
      i18n.set('es', true);
    });

    T.test('placeholders are interpolated', function () {
      i18n.set('en', true);
      assert.equal(i18n.t('legal.atKm', { km: 350 }), 'km 350');
      i18n.set('es', true);
      assert.equal(i18n.t('legal.atKm', { km: 350 }), 'km 350');
      assert.ok(i18n.t('stat.atAverage', { speed: 70 }).indexOf('70') !== -1);
    });

    T.test('an unknown placeholder is left untouched', function () {
      assert.ok(i18n.t('legal.atKm', {}).indexOf('{km}') !== -1);
    });

    T.test('an unknown key returns the key itself', function () {
      assert.equal(i18n.t('this.key.does.not.exist'), 'this.key.does.not.exist');
      assert.equal(i18n.has('this.key.does.not.exist'), false);
      assert.equal(i18n.has('form.calculate'), true);
    });

    /* ----------------------------------------------------------- pick() */

    T.test('pick resolves a language-keyed value', function () {
      i18n.set('es', true);
      assert.equal(i18n.pick({ es: 'hola', en: 'hello' }), 'hola');
      i18n.set('en', true);
      assert.equal(i18n.pick({ es: 'hola', en: 'hello' }), 'hello');
      i18n.set('es', true);
    });

    T.test('pick passes plain values straight through', function () {
      assert.equal(i18n.pick('plain'), 'plain');
      assert.deepEqual(i18n.pick(['a', 'b']), ['a', 'b']);
      assert.equal(i18n.pick(null), null);
    });

    T.test('pick falls back to English when Spanish is absent', function () {
      i18n.set('es', true);
      assert.equal(i18n.pick({ en: 'only english' }), 'only english');
    });

    T.test('dataset keywords are translated by term()', function () {
      i18n.set('es', true);
      assert.equal(i18n.term('fac', 'showers'), 'duchas');
      assert.equal(i18n.term('booking', 'required'), 'reserva obligatoria');
      i18n.set('en', true);
      assert.equal(i18n.term('fac', 'showers'), 'showers');
      i18n.set('es', true);
    });

    T.test('an unknown keyword is passed through unchanged', function () {
      assert.equal(i18n.term('fac', 'helipad'), 'helipad');
    });

    /* ---------------------------------------------------------- datasets */

    T.test('national regulations resolve per language', function () {
      i18n.set('es', true);
      var es = TRP.regulations.forCountries(['ES'], TRP.EMBEDDED_DATA.regulations, 3)[0];
      assert.equal(es.name, 'España');
      i18n.set('en', true);
      var en = TRP.regulations.forCountries(['ES'], TRP.EMBEDDED_DATA.regulations, 3)[0];
      assert.equal(en.name, 'Spain');
      assert.ok(es.rules[0] !== en.rules[0], 'the rule text did not change language');
      i18n.set('es', true);
    });

    T.test('every regulation entry carries both languages', function () {
      var regs = TRP.EMBEDDED_DATA.regulations.regulations;
      Object.keys(regs).forEach(function (code) {
        var entry = regs[code];
        assert.ok(entry.name && entry.name.es && entry.name.en, code + ' is missing a translated name');
        assert.ok(entry.rules && Array.isArray(entry.rules.es) && Array.isArray(entry.rules.en),
          code + ' is missing translated rules');
        assert.equal(entry.rules.es.length, entry.rules.en.length,
          code + ' has a different number of rules per language');
      });
    });

    T.test('EU driving rules resolve per language', function () {
      i18n.set('es', true);
      var es = TRP.euRules.groups(TRP.EMBEDDED_DATA.euRules);
      i18n.set('en', true);
      var en = TRP.euRules.groups(TRP.EMBEDDED_DATA.euRules);
      assert.equal(es.length, en.length);
      assert.ok(es[0].title !== en[0].title, 'the group title did not change language');
      assert.ok(es[0].rules[0].text !== en[0].rules[0].text, 'the rule text did not change language');
      i18n.set('es', true);
    });

    T.test('number and date formatting follow the locale', function () {
      i18n.set('es', true);
      var esNumber = TRP.util.formatNumber(1234.5, 1);
      i18n.set('en', true);
      var enNumber = TRP.util.formatNumber(1234.5, 1);
      assert.ok(esNumber !== enNumber, 'Spanish and English number formats should differ');
      assert.ok(esNumber.indexOf(',') !== -1, 'Spanish uses a decimal comma, got ' + esNumber);
      assert.ok(enNumber.indexOf('.') !== -1, 'English uses a decimal point, got ' + enNumber);
      i18n.set('es', true);
    });

    T.test('itinerary event titles are keys the dictionary knows', function () {
      var events = TRP.timeModel.buildItinerary(1400, new Date('2026-05-11T06:00:00Z')).events;
      events.forEach(function (ev) {
        assert.ok(ev.titleKey, 'an event has no titleKey');
        assert.ok(i18n.has(ev.titleKey), 'unknown event key: ' + ev.titleKey);
      });
    });
  });

  /* ------------------------------------------------- the 22 language packs */

  /*
   * Spanish and English live inside js/core/i18n.js; the other 22 are separate
   * files loaded on demand. A pack that is short a key falls back silently to
   * English at runtime, which is easy to miss in review, so check the whole
   * set here. Node only: in the browser the packs are fetched asynchronously
   * and this runner is synchronous.
   */
  if (typeof require !== 'function' || typeof module === 'undefined') return;

  T.describe('language packs', function () {
    var PACKS = i18n.available().filter(function (code) {
      return i18n.BASE_LANGS.indexOf(code) === -1;
    });

    /* Load every pack against a throwaway registry, so the live one is untouched. */
    var loaded = {};
    var realRegister = i18n.register;
    i18n.register = function (code, dict) { loaded[code] = dict; };
    try {
      PACKS.forEach(function (code) { require('../js/i18n/' + code + '.js'); });
    } finally {
      i18n.register = realRegister;
    }

    var baseline = Object.keys(i18n.STRINGS);
    function placeholders(value) {
      return (String(value).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
    }

    T.test('there is a file for every non-base language', function () {
      assert.equal(PACKS.length, 22, 'es and en are inline, the other 22 are files');
      PACKS.forEach(function (code) {
        assert.ok(loaded[code], 'js/i18n/' + code + '.js did not register a dictionary');
      });
    });

    PACKS.forEach(function (code) {
      T.test(code + ' translates every key, with matching placeholders', function () {
        var dict = loaded[code];
        var missing = baseline.filter(function (k) { return !(k in dict); });
        var extra = Object.keys(dict).filter(function (k) { return !(k in i18n.STRINGS); });
        var blank = Object.keys(dict).filter(function (k) { return !String(dict[k]).trim(); });
        var drift = baseline.filter(function (k) {
          return k in dict && placeholders(i18n.STRINGS[k].en) !== placeholders(dict[k]);
        });

        assert.equal(missing.length, 0, 'missing keys: ' + missing.slice(0, 5).join(', '));
        assert.equal(extra.length, 0, 'keys no longer in the app: ' + extra.slice(0, 5).join(', '));
        assert.equal(blank.length, 0, 'empty translations: ' + blank.slice(0, 5).join(', '));
        /* A dropped {km} renders a literal brace to the driver, so this matters. */
        assert.equal(drift.length, 0, 'placeholder mismatch: ' + drift.slice(0, 5).join(', '));
      });
    });

    T.test('the author credit is identical in every language', function () {
      PACKS.forEach(function (code) {
        assert.equal(loaded[code]['app.author'], 'created by Gabor Gasko',
          code + ' altered the author credit');
      });
    });

    /*
     * Regression: `init()` used to upgrade to the stored language silently.
     * The main UI still repainted, because initLanguage() re-renders from its
     * own promise, but anything relying on onChange - the consent banner -
     * stayed in the default language on top of an otherwise translated page.
     */
    T.test('switching language notifies listeners so late UI repaints', function () {
      var heard = [];
      i18n.onChange(function (code) { heard.push(code); });
      i18n.set('en');
      assert.deepEqual(heard, ['en'], 'a plain set() announces the change');

      heard.length = 0;
      i18n.set('es', true);
      assert.equal(heard.length, 0, 'and the silent flag still suppresses it');
      i18n.set('es');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
