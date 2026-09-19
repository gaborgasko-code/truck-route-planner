#!/usr/bin/env node
/**
 * Truck Route Planner - generate the iOS resources that Capacitor does not.
 *
 *     node tools/build-ios-resources.js
 *
 * Writes into ios-resources/, which the build workflow copies over the Xcode
 * project after `cap add ios`. Staging them rather than editing ios/ directly
 * means the generated project stays disposable - it can be deleted and
 * recreated on any machine without losing anything hand-edited.
 *
 * Two things are produced:
 *
 *   PrivacyInfo.xcprivacy   Apple's privacy manifest, required since May 2024.
 *                           App Store Connect rejects builds without one when
 *                           the app touches a "required reason" API, and
 *                           Capacitor touches UserDefaults on every launch.
 *
 *   <lang>.lproj/           One InfoPlist.strings per supported language. The
 *                           app already speaks 24; without these folders iOS
 *                           reports it as English-only and the App Store
 *                           listing says the same.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'ios-resources', 'App');

/* The display name under the icon. Kept short: iOS truncates past about 12
   characters on the home screen, and a truncated name looks broken. */
const DISPLAY_NAME = 'Planificador';

function languages() {
  /* The single source of truth is the app's own language table. */
  const i18n = require(path.join(root, 'js', 'core', 'i18n.js'));

  return i18n.available().map((code) => {
    /* The permission text is a normal dictionary entry, translated by the same
       process as everything else, rather than a second copy living in this
       script. Loading the pack here is what lets Info.plist reuse it. */
    let purpose = i18n.STRINGS['location.purpose'].en;
    if (code === 'es' || code === 'en') {
      purpose = i18n.STRINGS['location.purpose'][code];
    } else {
      const pack = loadPack(code);
      if (pack && pack['location.purpose']) purpose = pack['location.purpose'];
    }
    return { code, name: i18n.languageName(code), locale: i18n.LANGS[code].locale, purpose };
  });
}

/** Read one language pack without registering it on the live i18n module. */
function loadPack(code) {
  const captured = {};
  const previous = global.TRP;
  global.TRP = { i18n: { register: (c, dict) => { captured[c] = dict; } } };
  try {
    delete require.cache[require.resolve(path.join(root, 'js', 'i18n', code + '.js'))];
    require(path.join(root, 'js', 'i18n', code + '.js'));
  } catch (err) {
    return null;
  } finally {
    global.TRP = previous;
  }
  return captured[code] || null;
}

/**
 * Apple's privacy manifest.
 *
 * Declared honestly rather than minimally: with Google Analytics switched on
 * the app does collect product-interaction data, and saying otherwise in the
 * manifest while the App Privacy questionnaire says something else is the
 * mismatch that gets builds rejected.
 *
 * `NSPrivacyTracking` is false because the data is not linked to a third-party
 * identifier for advertising. That stops being true the moment Google Signals
 * or ads personalisation is enabled in GA4 - if that ever happens, this file
 * and the App Store answers both have to change, and an ATT prompt becomes
 * mandatory.
 */
function privacyManifest() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <!-- No cross-app tracking: nothing is linked to an advertising identifier. -->',
    '  <key>NSPrivacyTracking</key>',
    '  <false/>',
    '  <key>NSPrivacyTrackingDomains</key>',
    '  <array/>',
    '',
    '  <key>NSPrivacyCollectedDataTypes</key>',
    '  <array>',
    '    <dict>',
    '      <!-- Which screens are opened and how many routes are calculated. -->',
    '      <key>NSPrivacyCollectedDataType</key>',
    '      <string>NSPrivacyCollectedDataTypeProductInteraction</string>',
    '      <key>NSPrivacyCollectedDataTypeLinked</key>',
    '      <false/>',
    '      <key>NSPrivacyCollectedDataTypeTracking</key>',
    '      <false/>',
    '      <key>NSPrivacyCollectedDataTypePurposes</key>',
    '      <array>',
    '        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>',
    '      </array>',
    '    </dict>',
    '  </array>',
    '',
    '  <key>NSPrivacyAccessedAPITypes</key>',
    '  <array>',
    '    <dict>',
    '      <!-- Capacitor stores its own state in UserDefaults on every launch. -->',
    '      <key>NSPrivacyAccessedAPIType</key>',
    '      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>',
    '      <key>NSPrivacyAccessedAPITypeReasons</key>',
    '      <array>',
    '        <string>CA92.1</string>',
    '      </array>',
    '    </dict>',
    '  </array>',
    '</dict>',
    '</plist>',
    ''
  ].join('\n');
}

/**
 * One InfoPlist.strings per language.
 *
 * The display name is intentionally the same in every one. It is a product
 * name, not a word to be translated, and a driver who switches their phone to
 * Polish should still find the same icon. The files exist so iOS and the App
 * Store know which languages the app actually speaks.
 */
function infoPlistStrings(lang) {
  /* .strings files are quote-delimited, so an embedded quote would end the
     value early and leave a file Xcode refuses to compile. */
  const escape = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const lines = [
    '/* Truck Route Planner - ' + lang.name + ' (' + lang.code + ')',
    '   GENERATED by tools/build-ios-resources.js - do not edit. */',
    '',
    '"CFBundleDisplayName" = "' + escape(DISPLAY_NAME) + '";',
    '"CFBundleName" = "' + escape(DISPLAY_NAME) + '";'
  ];

  /* The text iOS shows in its own permission sheet. Apple rejects builds whose
     purpose strings are vague, and an untranslated one in a Greek interface
     reads as carelessness about exactly the thing being asked for. */
  if (lang.purpose) {
    lines.push('');
    lines.push('"NSLocationWhenInUseUsageDescription" = "' + escape(lang.purpose) + '";');
  }

  lines.push('');
  return lines.join('\n');
}

function build() {
  fs.rmSync(path.join(root, 'ios-resources'), { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'PrivacyInfo.xcprivacy'), privacyManifest(), 'utf8');

  const langs = languages();
  langs.forEach((lang) => {
    const dir = path.join(outDir, lang.code + '.lproj');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'InfoPlist.strings'), infoPlistStrings(lang), 'utf8');
  });

  /* Xcode needs the list in the project's Info.plist too, or it ignores the
     .lproj folders entirely. The workflow merges this in. */
  fs.writeFileSync(
    path.join(root, 'ios-resources', 'CFBundleLocalizations.json'),
    JSON.stringify(langs.map((l) => l.code), null, 2) + '\n',
    'utf8'
  );

  process.stdout.write('ios-resources/: PrivacyInfo.xcprivacy + ' +
    langs.length + ' localisations (' + langs.map((l) => l.code).join(' ') + ')\n');
  return langs;
}

if (require.main === module) build();

module.exports = { build, privacyManifest, infoPlistStrings, languages, DISPLAY_NAME };
