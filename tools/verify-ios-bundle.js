#!/usr/bin/env node
/**
 * Truck Route Planner - check what actually ended up inside the built app.
 *
 *     node tools/verify-ios-bundle.js path/to/App.app
 *
 * Exists because a green build proved nothing. Files copied into the Xcode
 * folder were silently left out of the app - Xcode bundles only what
 * project.pbxproj references - while every step reported success. The privacy
 * manifest and all 24 localisations were missing from a build that passed.
 *
 * So this opens the finished bundle and checks the things that matter:
 *
 *   - our privacy manifest is at the top level of the app;
 *   - every language has its .lproj with the localised InfoPlist.strings, or
 *     the location permission prompt shows English in all 24 languages;
 *   - Info.plist carries the bundle id from capacitor.config.json and the
 *     location purpose string Apple requires.
 *
 * Runs in CI after the build, and locally on a downloaded artifact.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function expectations() {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  const langsFile = path.join(root, 'ios-resources', 'CFBundleLocalizations.json');
  const langs = fs.existsSync(langsFile)
    ? JSON.parse(fs.readFileSync(langsFile, 'utf8'))
    : require(path.join(root, 'tools', 'build-ios-resources.js')).languages().map((l) => l.code);
  return { bundleId: config.appId, langs };
}

/**
 * Read Info.plist as text. Built apps store it as a binary plist; plutil (on
 * macOS) converts it properly, and elsewhere the ASCII strings inside the
 * binary are still searchable, which is enough for presence checks.
 */
function readInfoPlist(app) {
  const file = path.join(app, 'Info.plist');
  if (!fs.existsSync(file)) return { text: '', exact: false };
  try {
    const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', file],
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    return { text: json, exact: true, data: JSON.parse(json) };
  } catch (err) {
    return { text: fs.readFileSync(file).toString('latin1'), exact: false };
  }
}

/** Every problem found, as human-readable lines. Empty means the app is right. */
function problems(app, expected) {
  const out = [];

  if (!fs.existsSync(app) || !fs.statSync(app).isDirectory()) {
    return ['no app bundle at ' + app];
  }

  if (!fs.existsSync(path.join(app, 'PrivacyInfo.xcprivacy'))) {
    out.push('PrivacyInfo.xcprivacy is not at the top level of the app');
  }

  const missing = expected.langs.filter((code) =>
    !fs.existsSync(path.join(app, code + '.lproj', 'InfoPlist.strings')));
  if (missing.length) {
    out.push(missing.length + ' of ' + expected.langs.length +
      ' localisations missing: ' + missing.join(' '));
  }

  const info = readInfoPlist(app);
  if (!info.text) {
    out.push('Info.plist is missing');
  } else if (info.exact) {
    if (info.data.CFBundleIdentifier !== expected.bundleId) {
      out.push('bundle id is ' + info.data.CFBundleIdentifier + ', expected ' + expected.bundleId);
    }
    if (!info.data.NSLocationWhenInUseUsageDescription) {
      out.push('Info.plist has no NSLocationWhenInUseUsageDescription');
    }
  } else {
    if (info.text.indexOf(expected.bundleId) === -1) {
      out.push('bundle id ' + expected.bundleId + ' not found in Info.plist');
    }
    if (info.text.indexOf('NSLocationWhenInUseUsageDescription') === -1) {
      out.push('Info.plist has no NSLocationWhenInUseUsageDescription');
    }
  }

  return out;
}

function main() {
  const app = process.argv[2];
  if (!app) {
    process.stderr.write('usage: node tools/verify-ios-bundle.js path/to/App.app\n');
    process.exit(2);
  }
  const expected = expectations();
  const found = problems(path.resolve(app), expected);

  if (found.length) {
    process.stdout.write('The built app is incomplete:\n');
    found.forEach((p) => process.stdout.write('  - ' + p + '\n'));
    process.exit(1);
  }
  process.stdout.write('App bundle verified: ' + expected.bundleId + ', privacy manifest, ' +
    expected.langs.length + ' localisations\n');
}

if (require.main === module) main();

module.exports = { problems, expectations, readInfoPlist };
