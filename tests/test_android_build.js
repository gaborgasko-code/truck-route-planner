/**
 * Truck Route Planner - Android packaging tests.
 *
 * The Gradle build runs on a Linux runner against a project generated there
 * by `cap add android`; the scripts that finish it are written on Windows.
 * The fixtures below are the Capacitor 8 template as generated, so the
 * rewrites are checked against the real shape of the files.
 */
(function (global) {
  'use strict';

  if (typeof require !== 'function' || typeof module === 'undefined') return;

  if (!global.TRPTest) require('./harness.js');
  const T = global.TRPTest;
  const { describe, test, assert } = T;

  const fs = require('fs');
  const path = require('path');
  const res = require('../tools/build-android-resources.js');
  const verify = require('../tools/verify-android-bundle.js');

  const root = path.join(__dirname, '..');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'android.yml'), 'utf8');

  const MANIFEST = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <application android:label="@string/app_name">',
    '        <activity android:name=".MainActivity" android:exported="true"></activity>',
    '    </application>',
    '    <!-- Permissions -->',
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '</manifest>',
    ''
  ].join('\n');

  const GRADLE = [
    "apply plugin: 'com.android.application'",
    '',
    'android {',
    '    namespace = "com.aissaapps.planificador"',
    '    compileSdk = rootProject.ext.compileSdkVersion',
    '    defaultConfig {',
    '        applicationId "com.aissaapps.planificador"',
    '        minSdkVersion rootProject.ext.minSdkVersion',
    '        targetSdkVersion rootProject.ext.targetSdkVersion',
    '        versionCode 1',
    '        versionName "1.0"',
    '    }',
    '    buildTypes {',
    '        release {',
    '            minifyEnabled false',
    "            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'",
    '        }',
    '    }',
    '}',
    ''
  ].join('\n');

  describe('android - the generated project', function () {
    test('location permissions are added and GPS is optional', function () {
      const out = res.applyManifest(MANIFEST);
      res.PERMISSIONS.forEach(function (p) {
        assert.ok(out.indexOf('<uses-permission android:name="' + p + '" />') !== -1, p);
      });
      res.OPTIONAL_FEATURES.forEach(function (f) {
        assert.ok(out.indexOf('<uses-feature android:name="' + f + '" android:required="false" />') !== -1, f);
      });
      assert.ok(out.trim().endsWith('</manifest>'));
    });

    test('the manifest rewrite is idempotent', function () {
      const once = res.applyManifest(MANIFEST);
      assert.equal(res.applyManifest(once), once);
    });

    test('version and signing go into build.gradle once', function () {
      const out = res.applyGradle(GRADLE, { versionCode: 42, versionName: '2.3.0' });
      assert.ok(/versionCode 42\b/.test(out));
      assert.ok(/versionName "2\.3\.0"/.test(out));
      assert.equal((out.match(/signingConfigs \{/g) || []).length, 1);
      assert.ok(/release \{\s*if \(System\.getenv\("ANDROID_KEYSTORE_PATH"\)\) \{\s*signingConfig = signingConfigs\.release/.test(out),
        'the release build type uses the env signing config');
      assert.equal(res.applyGradle(out, { versionCode: 42, versionName: '2.3.0' }), out, 'idempotent');
      assert.equal(/storePassword\s*=\s*"/.test(out), false, 'no password is written into the file');
    });

    test('the launcher name is English by default and Spanish on Spanish phones', function () {
      const STRINGS = [
        "<?xml version='1.0' encoding='utf-8'?>",
        '<resources>',
        '    <string name="app_name">Planificador</string>',
        '    <string name="title_activity_main">Planificador</string>',
        '    <string name="package_name">com.aissaapps.planificador</string>',
        '    <string name="custom_url_scheme">com.aissaapps.planificador</string>',
        '</resources>',
        ''
      ].join('\n');
      assert.equal(res.LABELS[''], 'Truck Planner');
      assert.equal(res.LABELS.es, 'Planificador');
      const out = res.applyStrings(STRINGS, res.LABELS['']);
      assert.ok(out.indexOf('<string name="app_name">Truck Planner</string>') !== -1);
      assert.ok(out.indexOf('<string name="title_activity_main">Truck Planner</string>') !== -1);
      assert.ok(out.indexOf('<string name="package_name">com.aissaapps.planificador</string>') !== -1, 'the rest is kept');
      assert.equal(res.applyStrings(out, res.LABELS['']), out, 'idempotent');
      const es = res.localeStrings(res.LABELS.es);
      assert.ok(/^<\?xml[\s\S]*<string name="app_name">Planificador<\/string>[\s\S]*<\/resources>\n$/.test(es));
      assert.throws(function () { res.applyStrings('<resources></resources>', 'x'); });
    });

    test('the notification icon is configured and generated', function () {
      const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
      assert.equal(config.plugins.LocalNotifications.smallIcon, res.NOTIFICATION_ICON);
      const icons = fs.readFileSync(path.join(root, 'tools', 'build-app-icons.js'), 'utf8');
      assert.ok(icons.indexOf('notification-icon.png') !== -1 && icons.indexOf('icon-foreground.png') !== -1);
    });

    test('Capacitor 8, which targets the API level Google Play requires', function () {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      ['@capacitor/android', '@capacitor/core', '@capacitor/cli', '@capacitor/ios'].forEach(function (p) {
        assert.ok(/^\^?8\./.test(pkg.devDependencies[p] || ''), p + ' is ' + pkg.devDependencies[p]);
      });
      assert.equal(verify.MIN_TARGET_SDK, 36);
    });
  });

  describe('app - the language it opens in', function () {
    const flavourMod = require('../tools/app-flavour.js');
    const read = function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };

    test('the app follows the phone and falls back to English', function () {
      const config = flavourMod.flavour(read('js/core/config.js'), 'js/core/config.js');
      const i18n = flavourMod.flavour(read('js/core/i18n.js'), 'js/core/i18n.js');
      assert.ok(/LANG_AUTODETECT\s*:\s*true/.test(config), 'autodetect on in the app');
      assert.ok(/var DEFAULT_LANG\s*=\s*'en'/.test(i18n), 'English when the phone language is not one of the 24');
    });

    test('the website keeps Spanish as its default', function () {
      assert.ok(/LANG_AUTODETECT\s*:\s*false/.test(read('js/core/config.js')));
      assert.ok(/var DEFAULT_LANG\s*=\s*'es'/.test(read('js/core/i18n.js')));
    });
  });

  describe('android - the Google Play listing', function () {
    /* English is the default listing; Spanish is its translation. */
    const LOCALES = ['en-US', 'es-ES'];
    const gp = path.join(root, 'store', 'google-play');
    const listings = {};
    LOCALES.forEach(function (l) {
      listings[l] = JSON.parse(fs.readFileSync(path.join(gp, 'listing-' + l + '.json'), 'utf8'));
    });

    function pngSize(file) {
      const b = fs.readFileSync(file);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }

    test('the texts fit Google Play\'s limits and name nobody but the publisher', function () {
      const lim = { title: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 };
      LOCALES.forEach(function (l) {
        Object.keys(lim).forEach(function (k) {
          const n = Array.from(listings[l][k] || '').length;
          assert.ok(n > 0 && n <= lim[k], l + ' ' + k + ' is ' + n + ' of ' + lim[k]);
        });
        assert.equal(/gabor/i.test(JSON.stringify(listings[l])), false, l);
        assert.equal(/iphone/i.test(listings[l].fullDescription), false, l + ': no iPhone wording on Google Play');
      });
      assert.equal(listings['en-US'].privacyPolicyUrl, listings['es-ES'].privacyPolicyUrl);
    });

    test('icon and one feature graphic per language have the required sizes', function () {
      const icon = pngSize(path.join(gp, 'icon-512.png'));
      assert.ok(icon.w === 512 && icon.h === 512, 'icon ' + icon.w + 'x' + icon.h);
      LOCALES.forEach(function (l) {
        const fg = pngSize(path.join(gp, 'feature-graphic-' + l + '.png'));
        assert.ok(fg.w === 1024 && fg.h === 500, l + ' feature graphic ' + fg.w + 'x' + fg.h);
      });
    });

    test('phone screenshots in each language: 2 to 8, no longer than 2:1', function () {
      LOCALES.forEach(function (l) {
        const dir = path.join(gp, 'screenshots', l);
        const shots = fs.readdirSync(dir).filter(function (f) { return /\.png$/.test(f); });
        assert.ok(shots.length >= 2 && shots.length <= 8, l + ': ' + shots.length + ' screenshots');
        shots.forEach(function (f) {
          const s = pngSize(path.join(dir, f));
          assert.ok(Math.max(s.w, s.h) <= 2 * Math.min(s.w, s.h), l + '/' + f + ' is ' + s.w + 'x' + s.h);
          assert.ok(Math.min(s.w, s.h) >= 320 && Math.max(s.w, s.h) <= 3840, l + '/' + f + ' size');
        });
      });
    });
  });

  /*
   * Google Play rejected the first release (25 Oct 2026, Misleading Claims:
   * "Missing Source Link for Government Information"). The descriptions must
   * link official sources for every rule the app shows and say plainly that
   * the app is not a government app; the sources page carries the full list.
   */
  describe('store - official sources', function () {
    const legal = require('../tools/build-legal-pages.js');
    const os = require('os');
    const S = legal.loadSources();
    const gp = path.join(root, 'store', 'google-play');
    const listing = function (l) { return JSON.parse(fs.readFileSync(path.join(gp, 'listing-' + l + '.json'), 'utf8')); };
    const tolls = JSON.parse(fs.readFileSync(path.join(root, 'data', 'toll_rates.json'), 'utf8')).rates;
    const regs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'trailer_regulations.json'), 'utf8')).regulations;
    const regCodes = Object.keys(regs).filter(function (c) { return c !== 'DEFAULT'; });
    const byCode = {};
    S.countries.forEach(function (c) { byCode[c.code] = c; });
    const SOURCES_PAGE = 'https://chispapps.com/truckrouteplanner/sources.html';

    /* Commercial compilations are not official sources. */
    const NOT_OFFICIAL = /wikipedia|adac\.|timocom|trans\.info|transconnect|iru\.org|dhl\.|eurowag|savaexpress|europeanshippers|bustruckpark|collective-log|nakordoni|freightlink|espaceglobalfreight|pirelli|continental|ayvens|eversure|greenmotion/i;

    function allLinks() {
      const out = S.eu.map(function (s) { return s.url; });
      S.countries.forEach(function (c) {
        if (c.tolls) out.push(c.tolls.url);
        if (c.bans) out.push(c.bans.url);
        if (c.yourEurope) out.push(legal.yourEuropeUrl(c.yourEurope));
      });
      return out;
    }

    test('every country the app has tolls or rules for has its official sources', function () {
      const codes = Object.keys(tolls).concat(regCodes).filter(function (c, i, a) { return a.indexOf(c) === i; });
      codes.forEach(function (code) {
        const c = byCode[code];
        assert.ok(c, code + ' is missing from store/official-sources.json');
        assert.ok(c.name && c.name.es && c.name.en, code + ' name');
        assert.ok(c.tolls && /^https:\/\//.test(c.tolls.url) && c.tolls.label, code + ' toll source');
      });
      regCodes.forEach(function (code) {
        assert.ok(byCode[code].bans && /^https:\/\//.test(byCode[code].bans.url) && byCode[code].bans.label, code + ' driving-ban source');
      });
    });

    test('the links are official and secure', function () {
      allLinks().forEach(function (url) {
        assert.ok(/^https:\/\/[^\s"<>]+$/.test(url), url);
        assert.equal(NOT_OFFICIAL.test(url), false, url + ' is not an official source');
      });
      S.eu.forEach(function (s) {
        assert.ok(/^https:\/\/([a-z-]+\.)*(europa\.eu|unece\.org)\//.test(s.url), s.url + ' is not an EU or UN page');
        assert.ok(s.topic && s.topic.es && s.topic.en && s.label, s.url);
      });
    });

    test('Your Europe road rules for every EU, EEA and Swiss country', function () {
      ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
        'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH'].forEach(function (code) {
        assert.ok(byCode[code] && /^[a-z]+$/.test(byCode[code].yourEurope || ''), code + ' Your Europe page');
      });
    });

    test('the sources page says it is not a government app and links every source', function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-sources-'));
      legal.build(dir);
      const html = fs.readFileSync(path.join(dir, 'sources.html'), 'utf8');
      assert.ok(html.indexOf('It does not represent, and is not affiliated with, the European Union or any government') !== -1);
      assert.ok(html.indexOf('No representa a la Unión Europea ni a ningún gobierno') !== -1);
      allLinks().forEach(function (url) {
        assert.ok(html.indexOf('href="' + url.replace(/&/g, '&amp;') + '"') !== -1, url + ' is not on the page');
      });
      ['support.html', 'index.html', 'privacy-en.html'].forEach(function (f) {
        assert.ok(fs.readFileSync(path.join(dir, f), 'utf8').indexOf('href="sources.html"') !== -1, f + ' links the sources page');
      });
    });

    test('both Play descriptions carry the statement and the official sources', function () {
      const en = listing('en-US').fullDescription;
      const es = listing('es-ES').fullDescription;
      assert.ok(/NOT A GOVERNMENT APP/.test(en) && /not affiliated with, the European Union or any government/.test(en));
      assert.ok(/NO ES UNA APP OFICIAL/.test(es) && /No representa a la Unión Europea ni a ningún gobierno/.test(es));
      assert.ok(en.indexOf('NOT A GOVERNMENT APP') < 400 && es.indexOf('NO ES UNA APP OFICIAL') < 400, 'near the top, easy to see');
      [en, es].forEach(function (d) {
        assert.ok(d.indexOf(SOURCES_PAGE) !== -1, 'links the sources page');
        assert.ok(/https:\/\/eur-lex\.europa\.eu\/\S*(2006\/561|32006R0561)/.test(d), 'links Regulation 561/2006');
        assert.ok(d.indexOf('https://transport.ec.europa.eu/transport-modes/road/road-charging_en') !== -1, 'tolls source');
        assert.ok(/urban-vehicle-access-regulations/.test(d), 'low-emission zones source');
        assert.ok(/youreurope\/citizens\/travel\/driving-abroad\/road-rules-and-safety/.test(d), 'national road rules source');
      });
      ['en-US', 'es-ES'].forEach(function (l) {
        assert.equal(listing(l).privacyPolicyUrl, 'https://chispapps.com/truckrouteplanner/privacy.html');
      });
    });

    /* Google asked for the sources inside the app as well, not only in the store. */
    test('the app\'s Info tab carries the statement and the same official sources', function () {
      const flav = require('../tools/app-flavour.js');
      const mobile = flav.flavour(fs.readFileSync(path.join(root, 'mobile.html'), 'utf8'), 'mobile.html');
      const card = (/<div class="card" id="m_sources">[\s\S]*?<\/ul>/.exec(mobile) || [''])[0];
      assert.ok(/data-i18n="info\.notGov"/.test(card), 'the "not a government app" statement');
      const links = (card.match(/href="[^"]+"/g) || []).map(function (h) { return h.slice(6, -1); });
      const en = listing('en-US').fullDescription;
      assert.equal(links.length, 6);
      links.forEach(function (url) {
        assert.ok(en.indexOf(url) !== -1, url + ' is not in the Play description');
      });
      assert.ok(links.indexOf(SOURCES_PAGE) !== -1, 'links the sources page');

      const i18n = fs.readFileSync(path.join(root, 'js', 'core', 'i18n.js'), 'utf8');
      assert.ok(i18n.indexOf('not affiliated with, the European Union or any government') !== -1);
      ['info.sources', 'info.notGov', 'info.src561', 'info.srcDriving', 'info.srcTolls', 'info.srcLez', 'info.srcRoad', 'info.srcCountry'].forEach(function (key) {
        fs.readdirSync(path.join(root, 'js', 'i18n')).forEach(function (f) {
          const pack = fs.readFileSync(path.join(root, 'js', 'i18n', f), 'utf8');
          assert.ok(pack.indexOf("'" + key + "':") !== -1, f + ' lacks ' + key);
        });
      });
    });
  });

  /* Facts re-checked against the official sources on 26 Oct 2026, so an old
     copy of the data cannot come back unnoticed. */
  describe('data - rules checked against the official sources', function () {
    const tolls = JSON.parse(fs.readFileSync(path.join(root, 'data', 'toll_rates.json'), 'utf8')).rates;
    const regs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'trailer_regulations.json'), 'utf8')).regulations;
    const en = function (code) { return regs[code].rules.en.join(' '); };

    test('the Netherlands charge trucks per kilometre since 1 July 2026', function () {
      assert.ok(tolls.NL.distance_based && tolls.NL.rate_eur_per_km > 0);
      assert.ok(/vrachtwagenheffing/.test(tolls.NL.system) && /1 July 2026/.test(en('NL')));
      assert.equal(/Eurovignette required/.test(en('NL')), false);
    });

    test('Romania charges TollRO by distance since 1 October 2026', function () {
      assert.ok(tolls.RO.distance_based && /TollRO/.test(tolls.RO.system) && /1 October 2026/.test(en('RO')));
    });

    test('Lithuania keeps the vignette until the end of 2026', function () {
      assert.equal(tolls.LT.distance_based, false);
      assert.ok(/1 January 2027/.test(tolls.LT.notes) && /1 January 2027/.test(en('LT')));
    });

    test('Sweden: winter tyres on heavy vehicles from 10 November to 10 April', function () {
      assert.ok(/10 November to 10 April/.test(en('SE')));
      assert.ok(/10 de noviembre al 10 de abril/.test(regs.SE.rules.es.join(' ')));
    });
  });

  describe('android - what reaches the bundle', function () {
    const e = verify.expectations();
    const good = [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="7"',
      '    android:versionName="' + e.versionName + '" package="' + e.packageName + '">',
      '  <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>',
      e.permissions.map(function (p) { return '  <uses-permission android:name="' + p + '"/>'; }).join('\n'),
      e.optionalFeatures.map(function (f) {
        return '  <uses-feature android:name="' + f + '" android:required="false"/>';
      }).join('\n'),
      '</manifest>'
    ].join('\n');

    test('a correct manifest passes', function () {
      assert.deepEqual(verify.manifestProblems(good, e), []);
    });

    test('an old target SDK is refused, as Google Play would', function () {
      const old = good.replace('targetSdkVersion="36"', 'targetSdkVersion="35"');
      assert.ok(/targetSdkVersion is 35/.test(verify.manifestProblems(old, e).join(' ')));
    });

    test('a missing location permission or a required GPS is caught', function () {
      const noLoc = good.replace(/\s*<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION"\/>/, '');
      assert.ok(/ACCESS_FINE_LOCATION/.test(verify.manifestProblems(noLoc, e).join(' ')));
      const gps = good.replace('location.gps" android:required="false"', 'location.gps" android:required="true"');
      assert.ok(/location\.gps must be required="false"/.test(verify.manifestProblems(gps, e).join(' ')));
    });

    test('the packaged web app is checked for pages and the developer name', function () {
      const os = require('os');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-aab-'));
      fs.mkdirSync(path.join(dir, 'js', 'core'), { recursive: true });
      ['index.html', 'mobile.html', 'PRIVACY.html', 'js/core/i18n.js'].forEach(function (f) {
        fs.writeFileSync(path.join(dir, f), 'ok');
      });
      assert.deepEqual(verify.assetProblems(dir), []);
      fs.writeFileSync(path.join(dir, 'desktop.html'), 'x');
      fs.writeFileSync(path.join(dir, 'mobile.html'), 'by Gabor');
      const found = verify.assetProblems(dir).join(' | ');
      assert.ok(/desktop\.html must not ship/.test(found) && /names the developer/.test(found), found);
    });

    test('the launcher names are read back from the bundle', function () {
      const dump = [
        "Package 'com.aissaapps.planificador':",
        '0x7f0f001b - string/app_name',
        '\t(default) - [STR] "Truck Planner"',
        '\tlocale: "es" - [STR] "Planificador"'
      ].join('\n');
      assert.deepEqual(verify.labelValues(dump), { '': 'Truck Planner', es: 'Planificador' });
      assert.deepEqual(verify.labelProblems(dump, res.LABELS), []);
      const old = dump.replace('"Truck Planner"', '"Planificador"');
      assert.ok(/launcher name default is "Planificador"/.test(verify.labelProblems(old, res.LABELS).join(' ')));
      assert.ok(verify.labelProblems('', res.LABELS).length === 2, 'an empty dump fails');
      assert.ok(/dump resources --bundle "\$AAB" \\\s*--resource string\/app_name --values/.test(workflow));
    });

    test('the workflow builds, then verifies, then signs the test APK with the same key', function () {
      const add = workflow.indexOf('npx cap add android');
      const resources = workflow.indexOf('node tools/build-android-resources.js');
      const sync = workflow.indexOf('npx cap sync android');
      const bundle = workflow.indexOf('bundleRelease');
      const check = workflow.indexOf('node tools/verify-android-bundle.js');
      assert.ok(add < resources && resources < sync && sync < bundle && bundle < check, 'order');
      assert.ok(workflow.indexOf('--mode=universal') !== -1, 'a universal APK for testing');
      assert.ok(/if: github\.event_name == 'workflow_dispatch' \|\| github\.repository == 'gaborgasko-code\/truck-route-planner'/.test(workflow),
        'automatic builds only on the public repository');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
