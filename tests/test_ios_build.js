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

    test('every upload gets a new build number', function () {
      /* App Store Connect rejects a second upload with the same build number. */
      assert.ok(/CURRENT_PROJECT_VERSION="\$GITHUB_RUN_NUMBER"/.test(workflow));
    });
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
