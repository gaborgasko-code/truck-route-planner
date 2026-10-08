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
      '\t<string>com.aissaapps.planificador</string>',
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


  describe('ios - the bundle id', function () {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
    const signing = fs.readFileSync(path.join(root, 'tools', 'ios-signing.sh'), 'utf8');

    test('the app is published under the Aissa Apps namespace', function () {
      /* A bundle id is permanent once an app is published. Changing it later
         does not rename the app - it creates a different one, with no
         reviews, no ratings and none of the existing installs. */
      assert.equal(config.appId, 'com.aissaapps.planificador');
    });

    test('it is a valid bundle id', function () {
      /* Reverse-DNS, letters, digits and dots. Hyphens are legal on iOS but
         not in an Android package name, so they are avoided here too. */
      assert.ok(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(config.appId),
        config.appId + ' is not a clean reverse-DNS id');
    });

    test('the signing script reads it from the config, not from a copy', function () {
      /* If the id registered at Apple and the id the app is built with ever
         differ, Xcode refuses to sign - but only in CI, after the secrets
         are set. One source of truth makes that drift impossible. */
      assert.ok(signing.indexOf('capacitor.config.json') !== -1,
        'the script reads capacitor.config.json');
      const hardcoded = signing.match(/\b(?:com|online|io)\.[a-z0-9]+\.[a-z0-9.]+/g) || [];
      assert.equal(hardcoded.length, 0,
        'hard-coded bundle id(s) in ios-signing.sh: ' + hardcoded.join(', '));
    });

    test('the signing script checks the profile against it', function () {
      assert.ok(signing.indexOf('application-identifier') !== -1,
        'a profile for the wrong App ID is caught before upload');
    });
  });


  describe('ios - signing from Windows', function () {
    const sh = fs.readFileSync(path.join(root, 'tools', 'ios-signing.sh'), 'utf8');
    const ps = fs.readFileSync(path.join(root, 'tools', 'ios-signing.ps1'), 'utf8');
    const guide = fs.readFileSync(path.join(root, 'MOBILE_APP_GUIDE.md'), 'utf8');

    test('bash never prompts when PowerShell is driving it', function () {
      /* A Git Bash prompt started from PowerShell does not reliably receive
         keystrokes; step 1 sat at its email prompt until it was killed. */
      assert.ok(/\$env:TRP_NO_PROMPT = '1'/.test(ps), 'the wrapper switches prompting off');
      const reads = sh.match(/^\s*read\s/gm) || [];
      assert.equal(reads.length, 2, 'only the two reads inside ask(), found ' + reads.length);
      const ask = sh.slice(sh.indexOf('ask() {'), sh.indexOf('\n}', sh.indexOf('ask() {')));
      assert.ok(ask.indexOf('TRP_NO_PROMPT') !== -1 && (ask.match(/read\s/g) || []).length === 2,
        'every read is behind the no-prompt switch');
    });

    test('step 1 asks nothing at all', function () {
      const csr = sh.slice(sh.indexOf('step_csr() {'), sh.indexOf('\n}', sh.indexOf('step_csr() {')));
      assert.equal(/^\s*(ask|read)\s/m.test(csr), false, 'csr has a prompt');
      assert.ok(csr.indexOf('Step 1 was already done') !== -1, 'running it twice keeps the key');
    });

    test('the wrapper asks for the password hidden, case-sensitively', function () {
      assert.ok(/Read-Host -Prompt \$Prompt -AsSecureString/.test(ps));
      /* -ne on strings ignores case: 'Abc' -ne 'abc' is false. */
      assert.ok(ps.indexOf('$first -cne $again') !== -1, 'passwords compared with -cne');
    });

    test('every answer handed over is removed afterwards', function () {
      const set = {};
      (ps.match(/\$env:(TRP_[A-Z_]+)\s*=/g) || []).forEach(function (m) {
        set[m.replace(/\$env:|\s*=/g, '')] = true;
      });
      const list = (ps.match(/\$handover = ([\s\S]*?)\n\n/) || [, ''])[1];
      Object.keys(set).forEach(function (name) {
        assert.ok(list.indexOf("'" + name + "'") !== -1, name + ' is set but never removed');
      });
      assert.ok(Object.keys(set).length >= 7, 'found ' + Object.keys(set).length);
      assert.ok(/finally \{\s*foreach \(\$name in \$handover\)/.test(ps), 'removed in finally');
    });

    test('the script output is shown, not swallowed into the exit code', function () {
      /* Whatever a PowerShell function prints becomes its return value. */
      assert.ok(/& \$bash 'tools\/ios-signing.sh' @args \| Out-Host/.test(ps));
    });

    test('OpenSSL gets paths it can open', function () {
      /* With path conversion off, /c/Users/... reaches OpenSSL unconverted. */
      assert.ok(sh.indexOf('export MSYS_NO_PATHCONV=1') !== -1);
      assert.ok(/pwd -W 2>\/dev\/null \|\| pwd/.test(sh), 'paths in the C:/ form');
    });

    test('the .p12 password never goes on a command line', function () {
      assert.equal(/pass:\$/.test(sh), false, 'pass:$VAR exposes it to other processes');
      assert.ok(sh.indexOf('-passout env:TRP_P12_PASS') !== -1);
    });

    test('the certificate is checked against the key and the team', function () {
      assert.ok(sh.indexOf('-pubkey') !== -1 && sh.indexOf('-pubout') !== -1, 'key match');
      assert.ok(sh.indexOf('CERT_TEAM') !== -1, 'certificate team vs profile team');
      assert.ok(sh.indexOf('-checkend 0') !== -1, 'expiry');
    });

    test('errors are not shown above the lines that explain them', function () {
      assert.ok(/\[ -z "\$\{TRP_NO_PROMPT:-\}" \] \|\| exec 2>&1/.test(sh));
    });

    test('the guide shows the commands as they are typed', function () {
      ['csr', 'secrets', 'appstore'].forEach(function (step) {
        assert.ok(guide.indexOf('.\\tools\\ios-signing.ps1 ' + step) !== -1, step);
      });
      assert.equal(/\toolsios-signing/.test(guide), false, 'a mangled \\t in the guide');
    });
  });


  describe('ios - the app names no developer', function () {
    const flavourMod = require('../tools/app-flavour.js');
    const vm = require('vm');
    const os = require('os');
    const NAME = /gabor/i;

    /* Exactly the files build-app.js copies, with their paths inside www/. */
    function shipped() {
      const list = [];
      buildApp.COPY_DIRS.forEach(function (dir) {
        (function walk(rel) {
          const abs = path.join(root, rel);
          if (!fs.existsSync(abs)) return;
          fs.readdirSync(abs, { withFileTypes: true }).forEach(function (e) {
            const r = rel + '/' + e.name;
            if (e.isDirectory()) walk(r);
            else if (flavourMod.TEXT.test(e.name)) list.push(r);
          });
        })(dir);
      });
      buildApp.COPY_FILES.forEach(function (f) {
        if (fs.existsSync(path.join(root, f))) list.push(f);
      });
      return list.map(function (rel) {
        return { rel: rel, out: flavourMod.flavour(fs.readFileSync(path.join(root, rel), 'utf8'), rel) };
      });
    }
    const files = shipped();

    test('no shipped file mentions the developer', function () {
      const hits = [];
      files.forEach(function (f) {
        f.out.split(/\r?\n/).forEach(function (line, i) {
          if (NAME.test(line)) hits.push(f.rel + ':' + (i + 1) + ' ' + line.trim().slice(0, 80));
        });
      });
      assert.equal(hits.length, 0, hits.slice(0, 5).join(' | '));
      assert.equal(NAME.test(buildApp.nativeIndex()), false, 'the generated index.html');
      assert.ok(files.length > 50, 'checked ' + files.length + ' files');
    });

    test('the rewritten code still runs and the data still parses', function () {
      files.forEach(function (f) {
        if (/\.js$/.test(f.rel)) new vm.Script(f.out, { filename: f.rel });
        if (/\.(json|webmanifest)$/.test(f.rel)) JSON.parse(f.out);
      });
    });

    test('every language names the publisher and a contact', function () {
      const codes = ['es', 'en'].concat(fs.readdirSync(path.join(root, 'js', 'i18n'))
        .map(function (n) { return n.replace(/\.js$/, ''); }));
      assert.equal(codes.length, 24);
      codes.forEach(function (code) {
        const text = flavourMod.PUBLISHER_TEXT[code];
        assert.ok(text && text.indexOf(flavourMod.PUBLISHER) !== -1 &&
          text.indexOf(flavourMod.CONTACT) !== -1, code);
      });
      files.filter(function (f) { return /^js\/i18n\/|^js\/core\/i18n\.js$/.test(f.rel); })
        .forEach(function (f) {
          assert.ok(f.out.indexOf(flavourMod.CONTACT) !== -1, f.rel + ' privacy contact');
        });
    });

    test('the name loses its suffix and nothing else', function () {
      const pack = files.filter(function (f) { return f.rel === 'js/i18n/de.js'; })[0].out;
      assert.ok(pack.indexOf("'app.name': 'Routenplaner',") !== -1);
      const mobile = files.filter(function (f) { return f.rel === 'mobile.html'; })[0].out;
      assert.ok(mobile.indexOf('data-i18n="app.name">Planificador de ruta</h1>') !== -1);
      assert.equal(/<footer class="view-footer">\s*<\/footer>/.test(mobile), false, 'no empty footer box');
    });

    test('exports leave the credit out when it is empty', function () {
      const render = fs.readFileSync(path.join(root, 'js', 'ui', 'render.js'), 'utf8');
      assert.equal((render.match(/if \(CONFIG\.AUTHOR\) L\.push\(CONFIG\.AUTHOR\)/g) || []).length, 2);
      const exp = fs.readFileSync(path.join(root, 'js', 'core', 'map-export.js'), 'utf8');
      const uses = (exp.match(/esc\(D\.author\)/g) || []).length;
      const guarded = (exp.match(/D\.author\?"<div class=foot>"\+esc\(D\.author\)\+"<\/div>":""/g) || []).length;
      assert.ok(uses === 2 && guarded === uses, 'every footer is conditional: ' + guarded + '/' + uses);
      assert.ok(exp.indexOf("(CONFIG.AUTHOR ? '<a class=\"by\"") !== -1, 'the header link too');
      const common = fs.readFileSync(path.join(root, 'js', 'ui', 'app-common.js'), 'utf8');
      assert.ok(common.indexOf("(CONFIG.AUTHOR ? ' - ' + CONFIG.AUTHOR : '')") !== -1, 'GPX creator');
    });

    test('a mention that slips through fails the build', function () {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-www-'));
      fs.mkdirSync(path.join(dir, 'js'));
      fs.writeFileSync(path.join(dir, 'js', 'new.js'), 'var a = 1;\n// thanks, GABOR\n');
      const found = flavourMod.leftovers(dir);
      assert.equal(found.length, 1);
      assert.ok(/js\/new\.js:2/.test(found[0]), found[0]);
    });

    test('the website keeps its credit', function () {
      /* Only the app drops it; the web pages are unchanged. */
      ['mobile.html', 'desktop.html', 'USER_GUIDE.html'].forEach(function (f) {
        assert.ok(fs.readFileSync(path.join(root, f), 'utf8').indexOf('created by Gabor Gasko') !== -1, f);
      });
    });
  });


  describe('ios - the store pages', function () {
    const legal = require('../tools/build-legal-pages.js');
    const flav = require('../tools/app-flavour.js');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-legal-'));
    const result = legal.build(dir);
    const read = function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); };

    test('a privacy policy in every language, a support page and an index', function () {
      assert.equal(result.languages.length, 24);
      result.languages.forEach(function (code) {
        assert.ok(fs.existsSync(path.join(dir, legal.pageFile(code))), code);
      });
      ['privacy.html', 'privacy-en.html', 'support.html', 'index.html', '.nojekyll'].forEach(function (f) {
        assert.ok(fs.existsSync(path.join(dir, f)), f);
      });
    });

    test('they name the publisher, a contact, and nobody else', function () {
      assert.equal(flav.leftovers(dir).length, 0);
      result.languages.forEach(function (code) {
        const page = read(legal.pageFile(code));
        assert.ok(page.indexOf(flav.PUBLISHER) !== -1 && page.indexOf(flav.CONTACT) !== -1, code);
        assert.ok(page.indexOf('lang="' + code + '"') !== -1, code + ' declares its language');
      });
    });

    test('the policy covers the location button, in the words iOS shows', function () {
      const es = read('privacy.html');
      assert.ok(es.indexOf('Su ubicación se usa solo para rellenar el punto de partida') !== -1);
      const inApp = flav.flavour(fs.readFileSync(path.join(root, 'PRIVACY.html'), 'utf8'), 'PRIVACY.html');
      assert.ok(/data-i18n="privacy\.s3body"><\/p>\s*<p data-i18n="location\.purpose">/.test(inApp),
        'the in-app policy says it too');
    });

    test('the services listed are the ones the app lists', function () {
      const page = fs.readFileSync(path.join(root, 'PRIVACY.html'), 'utf8');
      const inApp = (page.match(/host: '([^']+)'/g) || []).map(function (m) { return m.slice(7, -1); });
      assert.deepEqual(legal.THIRD_PARTIES.map(function (p) { return p.host; }), inApp);
    });

    test('the pages load nothing from anywhere else', function () {
      fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
        const html = read(f);
        assert.equal(/<script|<link|<img|<iframe/i.test(html), false, f + ' has an external resource');
      });
    });
  });


  describe('ios - the App Store listing', function () {
    const listing = JSON.parse(fs.readFileSync(path.join(root, 'store', 'listing-es-ES.json'), 'utf8'));
    const upload = require('../tools/asc-upload-screenshots.js');
    const crypto = require('crypto');

    test('every text fits Apple\'s limits', function () {
      const limits = { name: 30, subtitle: 30, promotionalText: 170, description: 4000,
        keywords: 100, copyright: 200, reviewNotes: 4000 };
      Object.keys(limits).forEach(function (k) {
        const n = Array.from(listing[k] || '').length;
        assert.ok(n > 0 && n <= limits[k], k + ' is ' + n + ' of ' + limits[k]);
      });
    });

    test('it names nobody but the publisher, and links the published pages', function () {
      assert.equal(/gabor/i.test(JSON.stringify(listing)), false);
      assert.ok(/^https:\/\/aissab-code\.github\.io\/planificador-legal\/privacy\.html$/.test(listing.privacyPolicyUrl));
      assert.ok(/^https:\/\/aissab-code\.github\.io\/planificador-legal\/support\.html$/.test(listing.supportUrl));
      assert.ok(listing.copyright.indexOf('Aissa Bamogo Redondo') !== -1);
    });

    test('keywords do not repeat the name, which Apple already indexes', function () {
      const name = listing.name.toLowerCase();
      listing.keywords.split(',').forEach(function (k) {
        assert.equal(name.indexOf(k.trim().toLowerCase()), -1, k);
      });
    });

    test('the screenshots are the size App Store Connect takes', function () {
      const sets = upload.collect();
      const es = sets.filter(function (s) { return s.locale === 'es-ES'; })[0];
      assert.ok(es && es.files.length >= 3 && es.files.length <= 10, 'es-ES screenshots');
      es.files.forEach(function (f) { assert.equal(f.size, '1290x2796', f.name); });
    });

    test('the API token is an ES256 JWT Apple can verify', function () {
      const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const saved = [process.env.ASC_KEY_ID, process.env.ASC_ISSUER_ID, process.env.ASC_PRIVATE_KEY_B64];
      process.env.ASC_KEY_ID = 'TESTKEY123';
      process.env.ASC_ISSUER_ID = '00000000-0000-0000-0000-000000000000';
      process.env.ASC_PRIVATE_KEY_B64 = Buffer.from(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
      try {
        const parts = upload.token().split('.');
        const dec = function (x) { return Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); };
        assert.deepEqual(JSON.parse(dec(parts[0])), { alg: 'ES256', kid: 'TESTKEY123', typ: 'JWT' });
        const body = JSON.parse(dec(parts[1]));
        assert.equal(body.aud, 'appstoreconnect-v1');
        assert.ok(body.exp - body.iat <= 1200, 'Apple refuses tokens valid for more than 20 minutes');
        assert.ok(crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]),
          { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, dec(parts[2])));
      } finally {
        ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY_B64'].forEach(function (k, i) {
          if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i];
        });
      }
    });
  });


  describe('ios - what reaches the built app', function () {
    const verify = require('../tools/verify-ios-bundle.js');
    const os = require('os');
    const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ios.yml'), 'utf8');

    /* A throwaway App.app on disk, shaped like the real thing. */
    function fakeApp(opts) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-app-'));
      const app = path.join(dir, 'App.app');
      fs.mkdirSync(app);
      const expected = verify.expectations();
      fs.writeFileSync(path.join(app, 'Info.plist'),
        'bplist00 CFBundleIdentifier ' + (opts.bundleId || expected.bundleId) +
        ' NSLocationWhenInUseUsageDescription x');
      if (opts.manifest !== false) fs.writeFileSync(path.join(app, 'PrivacyInfo.xcprivacy'), 'x');
      (opts.langs || expected.langs).forEach(function (code) {
        fs.mkdirSync(path.join(app, code + '.lproj'));
        fs.writeFileSync(path.join(app, code + '.lproj', 'InfoPlist.strings'), 'x');
      });
      return { app: app, expected: expected };
    }

    test('a complete bundle passes', function () {
      const f = fakeApp({});
      assert.equal(verify.problems(f.app, f.expected).length, 0,
        verify.problems(f.app, f.expected).join('; '));
    });

    test('the failure that actually shipped is caught', function () {
      /* Files copied into the Xcode folder but never registered in the
         project: no manifest and no .lproj, while the build said success. */
      const f = fakeApp({ manifest: false, langs: [] });
      const found = verify.problems(f.app, f.expected).join(' | ');
      assert.ok(/PrivacyInfo/.test(found), 'the missing manifest is reported');
      assert.ok(/24 of 24 localisations missing/.test(found), 'all missing languages are reported');
    });

    test('a single missing language is named', function () {
      const all = verify.expectations().langs;
      const f = fakeApp({ langs: all.filter(function (l) { return l !== 'mt'; }) });
      const found = verify.problems(f.app, f.expected).join(' | ');
      assert.ok(/1 of 24/.test(found) && / mt\b/.test(found), found);
    });

    test('a bundle built with the wrong id is caught', function () {
      const f = fakeApp({ bundleId: 'online.ggabor.planificador' });
      const found = verify.problems(f.app, f.expected).join(' | ');
      assert.ok(/bundle id/.test(found), 'the old id is rejected: ' + found);
    });

    test('the workflow registers the resources and then verifies them', function () {
      const reg = workflow.indexOf('register-ios-resources.rb');
      const build = workflow.indexOf('name: Build (unsigned)');
      const check = workflow.indexOf('verify-ios-bundle.js build/Build/Products');
      assert.ok(reg !== -1, 'the resources are registered in the Xcode project');
      assert.ok(reg < build, 'and before the build, not after');
      assert.ok(check > build, 'the unsigned bundle is verified after building');
      assert.ok(workflow.indexOf('verify-ios-bundle.js build/App.xcarchive') !== -1,
        'and so is the signed archive');
    });

    test('signing is configured on the App target, not the command line', function () {
      /* On the command line CODE_SIGN_STYLE and PROVISIONING_PROFILE_SPECIFIER
         reach the Capacitor pod targets too, which refuse a profile. */
      assert.ok(workflow.indexOf('configure-ios-signing.rb "$TEAM_ID"') !== -1,
        'manual signing is applied to the App target');
      assert.equal(/xcodebuild[^\n]*\n?[^\n]*PROVISIONING_PROFILE_SPECIFIER=/.test(workflow), false,
        'no profile is passed globally to xcodebuild');
      assert.ok(workflow.indexOf('configure-ios-signing.rb --check') !== -1,
        'the unsigned build exercises the signing script every time');
    });

    test('the app is built for iOS 15 and iPhone, from one setting', function () {
      const platform = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'ios-platform.json'), 'utf8'));
      assert.equal(platform.deploymentTarget, '15.0', 'App Store Connect refuses iOS 14 from April 2027');
      assert.equal(platform.deviceFamily, '1', 'iPhone only');
      /* The Podfile is patched before Sync, the project after it. */
      const pod = workflow.indexOf('Set the minimum iOS version in the Podfile');
      const sync = workflow.indexOf('name: Sync');
      assert.ok(pod !== -1 && pod < sync, 'the Podfile is patched before pod install');
      assert.ok(workflow.indexOf("require('./tools/ios-platform.json').deploymentTarget") !== -1,
        'the Podfile value comes from ios-platform.json');
      const conf = workflow.indexOf('ruby tools/configure-ios-platform.rb');
      assert.ok(conf > sync && conf < workflow.indexOf('name: Build (unsigned)'), 'project set before building');
      const rb = fs.readFileSync(path.join(root, 'tools', 'configure-ios-platform.rb'), 'utf8');
      assert.ok(/IPHONEOS_DEPLOYMENT_TARGET/.test(rb) && /TARGETED_DEVICE_FAMILY/.test(rb));
      assert.ok(rb.indexOf('ios-platform.json') !== -1, 'no second copy of the values');
    });

    test('the bundle check rejects the wrong iOS version or devices', function () {
      const e = verify.expectations();
      const good = { CFBundleIdentifier: e.bundleId, NSLocationWhenInUseUsageDescription: 'x',
        MinimumOSVersion: '15.0', UIDeviceFamily: [1] };
      assert.equal(verify.infoProblems(good, e).length, 0, verify.infoProblems(good, e).join('; '));
      const old = Object.assign({}, good, { MinimumOSVersion: '14.0' });
      assert.ok(/minimum iOS is 14\.0/.test(verify.infoProblems(old, e).join(' ')));
      const ipad = Object.assign({}, good, { UIDeviceFamily: [1, 2] });
      assert.ok(/device family is \[1,2\]/.test(verify.infoProblems(ipad, e).join(' ')));
    });

    test('every upload gets a new build number', function () {
      /* App Store Connect rejects a second upload with the same build number. */
      assert.ok(/CURRENT_PROJECT_VERSION="\$GITHUB_RUN_NUMBER"/.test(workflow));
    });
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
