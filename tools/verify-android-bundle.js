#!/usr/bin/env node
/**
 * Truck Route Planner - check what actually reached the Android App Bundle.
 *
 *     node tools/verify-android-bundle.js <manifest.xml> <assets-dir>
 *
 * In CI: <manifest.xml> is `bundletool dump manifest --bundle app.aab` and
 * <assets-dir> is the bundle's base/assets/public unzipped - the web app as
 * Android will load it. A green Gradle build says nothing about either; this
 * fails the job if Google Play would refuse the bundle (target API) or if the
 * app would ship wrong (permissions, pages, the developer's name).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const appFlavour = require('./app-flavour.js');
const { PERMISSIONS, OPTIONAL_FEATURES } = require('./build-android-resources.js');

const root = path.resolve(__dirname, '..');

/* Google Play: new apps and updates must target Android 16 since 31 Aug 2026. */
const MIN_TARGET_SDK = 36;

function expectations() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return {
    packageName: config.appId,
    versionName: pkg.version,
    minTargetSdk: MIN_TARGET_SDK,
    permissions: PERMISSIONS.concat(['android.permission.POST_NOTIFICATIONS', 'android.permission.INTERNET']),
    optionalFeatures: OPTIONAL_FEATURES
  };
}

function attr(xml, tag, name) {
  const m = new RegExp('<' + tag + '\\b[^>]*\\b' + name + '="([^"]*)"').exec(xml);
  return m ? m[1] : null;
}

/** Problems in the merged manifest, as readable lines. Empty means right. */
function manifestProblems(xml, expected) {
  const out = [];
  const pkg = attr(xml, 'manifest', 'package');
  if (pkg !== expected.packageName) out.push('package is ' + pkg + ', expected ' + expected.packageName);
  const versionName = attr(xml, 'manifest', 'android:versionName');
  if (versionName !== expected.versionName) {
    out.push('versionName is ' + versionName + ', expected ' + expected.versionName);
  }
  const versionCode = parseInt(attr(xml, 'manifest', 'android:versionCode'), 10);
  if (!(versionCode > 0)) out.push('versionCode is missing');
  const target = parseInt(attr(xml, 'uses-sdk', 'android:targetSdkVersion'), 10);
  if (!(target >= expected.minTargetSdk)) {
    out.push('targetSdkVersion is ' + target + '; Google Play requires ' + expected.minTargetSdk + ' or higher');
  }
  expected.permissions.forEach((p) => {
    if (xml.indexOf('android:name="' + p + '"') === -1) out.push('missing permission ' + p);
  });
  expected.optionalFeatures.forEach((f) => {
    const m = new RegExp('<uses-feature\\b[^>]*android:name="' + f.replace(/\./g, '\\.') + '"[^>]*>').exec(xml);
    if (!m) out.push('missing uses-feature ' + f);
    else if (!/android:required="false"/.test(m[0])) out.push(f + ' must be required="false"');
  });
  return out;
}

/** Problems in the packaged web app. */
function assetProblems(dir) {
  const out = [];
  ['index.html', 'mobile.html', 'PRIVACY.html', 'js/core/i18n.js'].forEach((f) => {
    if (!fs.existsSync(path.join(dir, f))) out.push('the web app is missing ' + f);
  });
  ['desktop.html', 'USER_GUIDE.html', 'sw.js'].forEach((f) => {
    if (fs.existsSync(path.join(dir, f))) out.push(f + ' must not ship in the app');
  });
  appFlavour.leftovers(dir).forEach((line) => out.push('names the developer: ' + line));
  return out;
}

function main() {
  const [manifestFile, assetsDir] = process.argv.slice(2);
  if (!manifestFile || !assetsDir) {
    process.stderr.write('usage: node tools/verify-android-bundle.js <manifest.xml> <assets-dir>\n');
    process.exit(2);
  }
  const expected = expectations();
  const xml = fs.readFileSync(manifestFile, 'utf8');
  const found = manifestProblems(xml, expected).concat(assetProblems(assetsDir));
  if (found.length) {
    process.stdout.write('The Android bundle is not right:\n');
    found.forEach((p) => process.stdout.write('  - ' + p + '\n'));
    process.exit(1);
  }
  process.stdout.write('Android bundle verified: ' + expected.packageName + ' ' + expected.versionName +
    ' (' + attr(xml, 'manifest', 'android:versionCode') + '), target SDK ' +
    attr(xml, 'uses-sdk', 'android:targetSdkVersion') + ', location and notification permissions, ' +
    'GPS optional, app pages only, no developer name\n');
}

if (require.main === module) main();

module.exports = { manifestProblems, assetProblems, expectations, MIN_TARGET_SDK };
