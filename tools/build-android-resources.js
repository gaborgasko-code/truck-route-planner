#!/usr/bin/env node
/**
 * Truck Route Planner - finish the generated Android project.
 *
 *     node tools/build-android-resources.js        (after `npx cap add android`)
 *
 * android/ is generated in CI by `cap add android` and never committed, like
 * ios/. This applies what the template lacks, idempotently:
 *
 *   AndroidManifest.xml  the two location permissions the Geolocation plugin
 *                        needs ("Usar mi ubicación"), and GPS marked optional:
 *                        ACCESS_FINE_LOCATION alone makes Google Play treat
 *                        GPS hardware as required and hide the app from
 *                        devices without it.
 *   app/build.gradle     versionCode (must grow with every upload; the CI run
 *                        number), versionName (package.json), and a release
 *                        signing config read from the environment, so the
 *                        upload key never sits in the project.
 *   res/drawable-*       the notification icon, a white silhouette per
 *                        density (assets/generated/notification-icon.png).
 *   res/values*          the name under the icon: "Truck Planner" by default,
 *                        so every phone outside Spanish shows the English
 *                        name, and "Planificador" on Spanish phones.
 *
 * The notification permission (POST_NOTIFICATIONS) and its alarms come from
 * the Local Notifications plugin's own manifest.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ANDROID = path.join(root, 'android');

const NOTIFICATION_ICON = 'ic_stat_planificador';
const DENSITIES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

const PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION'
];
const OPTIONAL_FEATURES = [
  'android.hardware.location',
  'android.hardware.location.gps'
];

/* The launcher name per resource qualifier; '' is the default (values/). */
const LABELS = { '': 'Truck Planner', es: 'Planificador' };
const LABEL_STRINGS = ['app_name', 'title_activity_main'];

function xmlText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'");
}

/** values/strings.xml with the default launcher name. */
function applyStrings(xml, label) {
  let s = xml;
  LABEL_STRINGS.forEach((name) => {
    const re = new RegExp('(<string name="' + name + '">)[^<]*(</string>)');
    if (!re.test(s)) throw new Error('strings.xml has no ' + name);
    s = s.replace(re, '$1' + xmlText(label) + '$2');
  });
  return s;
}

/** A values-<lang>/strings.xml holding only the launcher name. */
function localeStrings(label) {
  return "<?xml version='1.0' encoding='utf-8'?>\n<resources>\n" +
    LABEL_STRINGS.map((name) => '    <string name="' + name + '">' + xmlText(label) + '</string>\n').join('') +
    '</resources>\n';
}

/** The manifest with the location permissions and optional GPS features. */
function applyManifest(xml) {
  let s = xml;
  const add = [];
  PERMISSIONS.forEach((p) => {
    if (s.indexOf('android:name="' + p + '"') === -1) {
      add.push('    <uses-permission android:name="' + p + '" />');
    }
  });
  OPTIONAL_FEATURES.forEach((f) => {
    if (s.indexOf('<uses-feature android:name="' + f + '"') === -1) {
      add.push('    <uses-feature android:name="' + f + '" android:required="false" />');
    }
  });
  if (!add.length) return s;
  const close = s.lastIndexOf('</manifest>');
  if (close === -1) throw new Error('AndroidManifest.xml has no </manifest>');
  return s.slice(0, close) + add.join('\n') + '\n' + s.slice(close);
}

const SIGNING_BLOCK = [
  '    // Release signing from the environment (CI secrets), never from files',
  '    // in the project. Without it the release build is simply unsigned.',
  '    signingConfigs {',
  '        release {',
  '            if (System.getenv("ANDROID_KEYSTORE_PATH")) {',
  '                storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH"))',
  '                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")',
  '                keyAlias = System.getenv("ANDROID_KEY_ALIAS")',
  '                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")',
  '            }',
  '        }',
  '    }'
].join('\n');

/** app/build.gradle with the version and the environment-driven signing. */
function applyGradle(gradle, opts) {
  let s = gradle;
  if (!/versionCode\s*=?\s*\d+/.test(s)) throw new Error('app/build.gradle has no versionCode');
  s = s.replace(/versionCode\s*=?\s*\d+/, 'versionCode ' + opts.versionCode);
  s = s.replace(/versionName\s*=?\s*"[^"]*"/, 'versionName "' + opts.versionName + '"');

  if (s.indexOf('signingConfigs {') === -1) {
    s = s.replace(/(\n\s*buildTypes\s*\{)/, '\n' + SIGNING_BLOCK + '$1');
  }
  if (!/release\s*\{[^}]*signingConfig\s*=/.test(s)) {
    s = s.replace(/(buildTypes\s*\{\s*release\s*\{)/,
      '$1\n            if (System.getenv("ANDROID_KEYSTORE_PATH")) {\n' +
      '                signingConfig = signingConfigs.release\n            }');
  }
  return s;
}

function versionCode() {
  const raw = process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || '1';
  const n = parseInt(raw, 10);
  if (!(n > 0) || n > 2100000000) throw new Error('bad versionCode ' + raw);
  return n;
}

async function writeNotificationIcons() {
  const sharp = require('sharp');
  const src = path.join(root, 'assets', 'generated', 'notification-icon.png');
  if (!fs.existsSync(src)) throw new Error('missing ' + src + ' - run npm run build:icons');
  const res = path.join(ANDROID, 'app', 'src', 'main', 'res');
  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(res, 'drawable-' + density);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(src).resize(size, size).png().toFile(path.join(dir, NOTIFICATION_ICON + '.png'));
  }
}

async function main() {
  if (!fs.existsSync(ANDROID)) throw new Error('no android/ - run npx cap add android first');

  const manifestFile = path.join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');
  fs.writeFileSync(manifestFile, applyManifest(fs.readFileSync(manifestFile, 'utf8')));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const opts = { versionCode: versionCode(), versionName: pkg.version };
  const gradleFile = path.join(ANDROID, 'app', 'build.gradle');
  fs.writeFileSync(gradleFile, applyGradle(fs.readFileSync(gradleFile, 'utf8'), opts));

  await writeNotificationIcons();

  const res = path.join(ANDROID, 'app', 'src', 'main', 'res');
  Object.keys(LABELS).forEach((q) => {
    if (q === '') {
      const file = path.join(res, 'values', 'strings.xml');
      fs.writeFileSync(file, applyStrings(fs.readFileSync(file, 'utf8'), LABELS[q]));
    } else {
      fs.mkdirSync(path.join(res, 'values-' + q), { recursive: true });
      fs.writeFileSync(path.join(res, 'values-' + q, 'strings.xml'), localeStrings(LABELS[q]));
    }
  });

  process.stdout.write('Android project: version ' + opts.versionName + ' (' + opts.versionCode + '), ' +
    'location permissions, GPS optional, release signing from env, notification icon in ' +
    Object.keys(DENSITIES).length + ' densities, launcher name ' +
    Object.keys(LABELS).map((q) => (q || 'default') + ' "' + LABELS[q] + '"').join(', ') + '\n');
}

if (require.main === module) {
  main().catch((err) => { process.stderr.write(String(err.stack || err) + '\n'); process.exit(1); });
}

module.exports = { applyManifest, applyGradle, applyStrings, localeStrings, LABELS,
  NOTIFICATION_ICON, PERMISSIONS, OPTIONAL_FEATURES };
