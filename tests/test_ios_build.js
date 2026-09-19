/**
 * Truck Route Planner - iOS packaging tests.
 *
 * These matter more than usual because the thing they check runs on a machine
 * nobody here has. The Xcode build happens on a macOS runner; the scripts that
 * feed it are written and changed on Windows, where they cannot be run against
 * a real project. Pure functions and tests are the only way to know they are
 * right before a twenty-minute CI round trip.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  if (typeof require !== 'function' || typeof module === 'undefined') return;

  if (!global.TRPTest) require('./harness.js');
  const T = global.TRPTest;
  const { describe, test, assert } = T;

  const fs = require('fs');
  const path = require('path');

  const buildApp = require('../tools/build-app.js');
  const iosRes = require('../tools/build-ios-resources.js');
  const plist = require('../tools/apply-ios-plist.js');

  const root = path.join(__dirname, '..');

  /* ------------------------------------------------------- the web bundle */

  describe('ios - the packaged bundle', function () {
    test('the service worker registration is stripped', function () {
      /* Shipped as-is, the page would register a worker whose script was never
         copied: a silent failure on every launch, and a second cache layer
         that turns reinstalling the app into a way to serve stale files. */
      const html = '<body>\n<script>\n  if ("serviceWorker" in navigator) {\n' +
        '    navigator.serviceWorker.register("sw.js");\n  }\n</script>\n</body>';
      const out = buildApp.stripServiceWorker(html);
      assert.equal(out.indexOf('serviceWorker'), -1, 'no registration survives');
      assert.ok(out.indexOf('<body>') !== -1, 'the rest of the page is untouched');
    });

    test('a page with no service worker is left alone', function () {
      const html = '<body>\n<p>hello</p>\n</body>';
      assert.equal(buildApp.stripServiceWorker(html), html);
    });

    test('the native entry point goes straight to the mobile build', function () {
      const index = buildApp.nativeIndex();
      assert.ok(index.indexOf('mobile.html?view=mobile') !== -1,
        'it jumps to the mobile build');
      assert.ok(index.indexOf('location.replace') !== -1, 'without a history entry');
      assert.ok(index.indexOf('http-equiv="refresh"') !== -1,
        'and still works if scripts are blocked');
    });

    test('the backend and tests are not in the shipped file list', function () {
      /* Server code in a client bundle is dead weight at best. */
      ['backend', 'tests', 'tools', 'node_modules'].forEach(function (dir) {
        assert.equal(buildApp.COPY_DIRS.indexOf(dir), -1, dir + ' must not ship');
      });
      assert.equal(buildApp.COPY_FILES.indexOf('sw.js'), -1,
        'the service worker must not ship');
    });

    test('everything the app needs at runtime is listed', function () {
      ['css', 'js', 'data', 'assets'].forEach(function (dir) {
        assert.ok(buildApp.COPY_DIRS.indexOf(dir) !== -1, dir + ' must ship');
      });
      ['mobile.html', 'PRIVACY.html'].forEach(function (file) {
        assert.ok(buildApp.COPY_FILES.indexOf(file) !== -1, file + ' must ship');
      });
    });

    test('a built bundle really contains the language packs and data', function () {
      const www = path.join(root, 'www');
      if (!fs.existsSync(www)) return;   /* not built in this checkout */
      assert.ok(fs.existsSync(path.join(www, 'js', 'i18n', 'el.js')),
        'the Greek pack is packaged');
      assert.ok(fs.existsSync(path.join(www, 'data', 'eu_driving_rules.json')),
        'the EU rules dataset is packaged, so compliance works offline');
      assert.equal(fs.existsSync(path.join(www, 'sw.js')), false,
        'the service worker did not sneak in');
      assert.equal(fs.existsSync(path.join(www, 'backend')), false,
        'the backend did not sneak in');
    });
  });

  /* ---------------------------------------------------------- iOS resources */

  describe('ios - the staged resources', function () {
    test('the privacy manifest declares what the app actually does', function () {
      const xml = iosRes.privacyManifest();
      assert.ok(xml.indexOf('NSPrivacyTracking') !== -1, 'tracking is declared');
      assert.ok(xml.indexOf('NSPrivacyCollectedDataTypeProductInteraction') !== -1,
        'analytics data is declared rather than hidden');
      assert.ok(xml.indexOf('CA92.1') !== -1,
        'the UserDefaults required-reason code is present');
      /* Balanced tags, because a malformed manifest fails at submission time -
         the slowest possible moment to find out. */
      assert.equal((xml.match(/<dict>/g) || []).length,
        (xml.match(/<\/dict>/g) || []).length, 'dict tags balance');
    });

    test('every language the app speaks has an iOS localisation', function () {
      const i18n = require('../js/core/i18n.js');
      const langs = iosRes.languages().map(function (l) { return l.code; });
      assert.equal(langs.length, 24, 'all 24 EU languages');
      i18n.available().forEach(function (code) {
        assert.ok(langs.indexOf(code) !== -1, code + ' is missing from the iOS list');
      });
    });

    test('the display name is short enough for the home screen', function () {
      /* iOS truncates past roughly twelve characters and a cut-off name looks
         like a bug rather than a brand. */
      assert.ok(iosRes.DISPLAY_NAME.length <= 12,
        'display name is ' + iosRes.DISPLAY_NAME.length + ' characters');
    });

    test('the name is not translated, only the language list', function () {
      const el = iosRes.infoPlistStrings({ code: 'el', name: 'Ελληνικά' });
      const de = iosRes.infoPlistStrings({ code: 'de', name: 'Deutsch' });
      assert.ok(el.indexOf('"' + iosRes.DISPLAY_NAME + '"') !== -1);
      assert.ok(de.indexOf('"' + iosRes.DISPLAY_NAME + '"') !== -1,
        'a product name stays the same in every language');
    });
  });

  /* ------------------------------------------------------------- Info.plist */

  describe('ios - merging into the generated Info.plist', function () {
    const BASE = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0">',
      '<dict>',
      '\t<key>CFBundleIdentifier</key>',
      '\t<string>online.ggabor.planificador</string>',
      '</dict>',
      '</plist>',
      ''
    ].join('\n');

    test('our keys are added without disturbing Capacitor\'s', function () {
      const out = plist.applyKeys(BASE, ['es', 'en']);
      assert.ok(out.indexOf('CFBundleIdentifier') !== -1, 'existing keys survive');
      assert.ok(out.indexOf('<key>CFBundleLocalizations</key>') !== -1);
      assert.ok(out.indexOf('<string>es</string>') !== -1);
      assert.ok(out.indexOf('ITSAppUsesNonExemptEncryption') !== -1);
      assert.ok(out.indexOf('</dict>') !== -1 && out.indexOf('</plist>') !== -1,
        'the document still closes properly');
    });

    test('running twice does not duplicate anything', function () {
      /* cap add ios regenerates the file, but a rerun on an already-patched
         project must not end up with two of each key - a duplicate key makes
         the plist invalid and the build fails late. */
      const once = plist.applyKeys(BASE, ['es', 'en']);
      const twice = plist.applyKeys(once, ['es', 'en']);
      assert.equal(twice, once, 'the operation is idempotent');
      assert.equal((twice.match(/<key>CFBundleLocalizations<\/key>/g) || []).length, 1);
      assert.equal((twice.match(/<key>CFBundleDisplayName<\/key>/g) || []).length, 1);
    });

    test('a changed language list replaces the old one', function () {
      const first = plist.applyKeys(BASE, ['es', 'en']);
      const second = plist.applyKeys(first, ['es', 'en', 'de']);
      assert.equal((second.match(/<key>CFBundleLocalizations<\/key>/g) || []).length, 1);
      assert.ok(second.indexOf('<string>de</string>') !== -1, 'the new language is there');
    });

    test('the export-compliance flag is false, not absent', function () {
      /* Absent means TestFlight asks the encryption question on every upload. */
      const out = plist.applyKeys(BASE, ['es']);
      const i = out.indexOf('ITSAppUsesNonExemptEncryption');
      assert.ok(out.slice(i, i + 80).indexOf('<false/>') !== -1,
        'declared false so uploads stop asking');
    });

    test('a plist with no closing dict is rejected loudly', function () {
      let threw = false;
      try { plist.applyKeys('<plist></plist>', ['es']); } catch (e) { threw = true; }
      assert.ok(threw, 'a malformed plist should fail here, not in Xcode');
    });
  });

  describe('ios - the location permission text', function () {
    test('every language gets its own purpose string', function () {
      /* Apple rejects vague purpose strings, and an English one shown inside a
         Greek interface reads as carelessness about the very thing being
         asked for. */
      const langs = iosRes.languages();
      const en = langs.filter(function (l) { return l.code === 'en'; })[0].purpose;
      const untranslated = langs.filter(function (l) {
        return l.code !== 'en' && l.purpose === en;
      }).map(function (l) { return l.code; });
      assert.equal(untranslated.length, 0,
        'falling back to English: ' + untranslated.join(', '));
    });

    test('the purpose string says what it is used for and what is not kept', function () {
      const en = iosRes.languages().filter(function (l) { return l.code === 'en'; })[0];
      assert.ok(/starting point/i.test(en.purpose), 'it names the actual use');
      assert.ok(/never stored|not stored/i.test(en.purpose), 'and what happens to it');
    });

    test('the generated strings file declares the location key', function () {
      const out = iosRes.infoPlistStrings({ code: 'de', name: 'Deutsch', purpose: 'Nur fuer den Start.' });
      assert.ok(out.indexOf('NSLocationWhenInUseUsageDescription') !== -1);
      assert.ok(out.indexOf('"Nur fuer den Start."') !== -1);
    });

    test('a quote in the text cannot break the strings file', function () {
      /* .strings values are quote-delimited; an unescaped quote ends the value
         early and Xcode refuses to compile the file. */
      const out = iosRes.infoPlistStrings({ code: 'x', name: 'X', purpose: 'He said "no".' });
      assert.ok(out.indexOf('\\"no\\"') !== -1, 'the quotes are escaped');
    });
  });


  describe('ios - the native plugins are wired in', function () {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const declared = Object.assign({}, pkg.dependencies, pkg.devDependencies);

    test('the plugins the app calls are declared', function () {
      /* Capacitor discovers plugins by scanning package.json, and it reads
         both dependencies and devDependencies - verified in
         @capacitor/cli/dist/plugin.js getDependencies(). A plugin that is not
         declared is simply not linked, and the feature fails silently at
         runtime while the build stays green. */
      ['@capacitor/local-notifications', '@capacitor/geolocation'].forEach(function (name) {
        assert.ok(declared[name], name + ' is not declared in package.json');
      });
    });

    test('each plugin actually supports iOS', function () {
      ['@capacitor/local-notifications', '@capacitor/geolocation'].forEach(function (name) {
        const dir = path.join(root, 'node_modules', name, 'package.json');
        if (!fs.existsSync(dir)) return;    /* not installed in this checkout */
        const meta = JSON.parse(fs.readFileSync(dir, 'utf8'));
        assert.ok(meta.capacitor && meta.capacitor.ios,
          name + ' declares no iOS support');
      });
    });

    test('every plugin the code calls is one we declared', function () {
      /* The reverse direction: asking for a plugin that was never added
         returns undefined and the feature quietly does nothing. */
      const native = fs.readFileSync(path.join(root, 'js', 'ui', 'native.js'), 'utf8');
      const calls = native.match(/plugin\(['"]([A-Za-z]+)['"]\)/g) || [];
      const used = calls.map(function (m) {
        return m.replace(/^plugin\(['"]/, '').replace(/['"]\)$/, '');
      });
      const known = { LocalNotifications: '@capacitor/local-notifications',
        Geolocation: '@capacitor/geolocation' };
      used.forEach(function (name) {
        assert.ok(known[name], 'native.js calls an unknown plugin: ' + name);
        assert.ok(declared[known[name]], name + ' is used but ' + known[name] + ' is not declared');
      });
      assert.ok(used.length >= 2, 'found ' + used.length + ' plugin call sites');
    });
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
