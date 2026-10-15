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

  describe('android - the Google Play listing', function () {
    const listing = JSON.parse(fs.readFileSync(path.join(root, 'store', 'google-play', 'listing-es-ES.json'), 'utf8'));

    function pngSize(file) {
      const b = fs.readFileSync(file);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }

    test('the texts fit Google Play\'s limits and name nobody but the publisher', function () {
      const lim = { title: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 };
      Object.keys(lim).forEach(function (k) {
        const n = Array.from(listing[k] || '').length;
        assert.ok(n > 0 && n <= lim[k], k + ' is ' + n + ' of ' + lim[k]);
      });
      assert.equal(/gabor/i.test(JSON.stringify(listing)), false);
      assert.equal(/iphone/i.test(listing.fullDescription), false, 'no iPhone wording on Google Play');
    });

    test('icon and feature graphic have the required sizes', function () {
      const icon = pngSize(path.join(root, 'store', 'google-play', 'icon-512.png'));
      assert.ok(icon.w === 512 && icon.h === 512, 'icon ' + icon.w + 'x' + icon.h);
      const fg = pngSize(path.join(root, 'store', 'google-play', 'feature-graphic.png'));
      assert.ok(fg.w === 1024 && fg.h === 500, 'feature graphic ' + fg.w + 'x' + fg.h);
    });

    test('phone screenshots: 2 to 8, no longer than 2:1', function () {
      const dir = path.join(root, 'store', 'google-play', 'screenshots', 'es-ES');
      const shots = fs.readdirSync(dir).filter(function (f) { return /\.png$/.test(f); });
      assert.ok(shots.length >= 2 && shots.length <= 8, shots.length + ' screenshots');
      shots.forEach(function (f) {
        const s = pngSize(path.join(dir, f));
        assert.ok(Math.max(s.w, s.h) <= 2 * Math.min(s.w, s.h), f + ' is ' + s.w + 'x' + s.h);
        assert.ok(Math.min(s.w, s.h) >= 320 && Math.max(s.w, s.h) <= 3840, f + ' size');
      });
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
