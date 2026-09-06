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

    T.test('both languages are offered', function () {
      assert.deepEqual(i18n.available(), ['es', 'en']);
      assert.equal(i18n.languageName('es'), 'Español');
      assert.equal(i18n.languageName('en'), 'English');
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
      i18n.set('fr', true);
      assert.equal(i18n.lang(), 'es');
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
