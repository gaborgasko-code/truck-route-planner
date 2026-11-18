#!/usr/bin/env node
/**
 * Truck Route Planner - the store listings of the app, one file per app
 * language in store/listings/<lang>.json, for both stores.
 *
 *     node tools/store-listings.js check   checks every text against the
 *                                          stores' limits and rules
 *     node tools/store-listings.js build   check, then write build/store-listings/:
 *         google-play.csv  Play Console -> Main store listing -> Import a file
 *         asc.json         App Store Connect, one entry per Apple locale
 *
 * Fields of a language file:
 *   name, subtitle, keywords    App Store search fields (Apple indexes these)
 *   promotionalText, whatsNew   App Store
 *   playTitle, shortDescription Google Play
 *   screenshotCaptions          the six screenshot captions, in shot order
 *   description                 both stores; it must say near the top that
 *                               this is not a government app (`notGov` is
 *                               that heading) and end with the official
 *                               sources, which Google Play requires
 *   variants                    {<Apple locale>: {name, subtitle, keywords}}
 *                               for a second keyword set, e.g. Catalan,
 *                               which the Spanish App Store also searches
 *
 * Shared settings (URLs, copyright, categories, review notes) are in
 * store/listings/store.json. The keyword choices and the searches behind
 * them are explained in store/aso.md.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DIR = path.join(root, 'store', 'listings');
const OUT = path.join(root, 'build', 'store-listings');

const LIMITS = {
  name: 30, subtitle: 30, keywords: 100, promotionalText: 170, whatsNew: 500,
  playTitle: 30, shortDescription: 80, description: 4000, caption: 34
};
const CAPTIONS = 6;

/** Google Play listing languages for each app language. Play has no Irish or Maltese. */
const PLAY_LOCALES = {
  en: ['en-US', 'en-GB'], es: ['es-ES'], de: ['de-DE'], fr: ['fr-FR'], it: ['it-IT'], nl: ['nl-NL'],
  pt: ['pt-PT'], pl: ['pl-PL'], ro: ['ro'], cs: ['cs-CZ'], sk: ['sk'], hu: ['hu-HU'], bg: ['bg'],
  hr: ['hr'], sl: ['sl'], el: ['el-GR'], da: ['da-DK'], sv: ['sv-SE'], fi: ['fi-FI'], et: ['et'],
  lv: ['lv'], lt: ['lt']
};

/** App Store Connect locales for each app language. Apple has no Bulgarian or Baltic languages. */
const ASC_LOCALES = {
  en: ['en-GB', 'en-US'], es: ['es-ES'], de: ['de-DE'], fr: ['fr-FR'], it: ['it'], nl: ['nl-NL'],
  pt: ['pt-PT'], pl: ['pl'], ro: ['ro'], cs: ['cs'], sk: ['sk'], hu: ['hu'], hr: ['hr'], sl: ['sl-SI'],
  el: ['el'], da: ['da'], sv: ['sv'], fi: ['fi']
};

const SOURCES_PAGE = 'https://chispapps.com/truckrouteplanner/sources.html';
const ROAD_CHARGING = 'https://transport.ec.europa.eu/transport-modes/road/road-charging_en';
const REGULATION = /https:\/\/eur-lex\.europa\.eu\/\S*(2006\/561|32006R0561)/;

const len = function (s) { return Array.from(s || '').length; };
const norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
const words = function (s) { return norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean); };

function load() {
  const langs = fs.readdirSync(DIR)
    .filter(function (f) { return /^[a-z]{2}\.json$/.test(f); })
    .map(function (f) { return f.slice(0, 2); })
    .sort();
  const listings = {};
  langs.forEach(function (l) { listings[l] = JSON.parse(fs.readFileSync(path.join(DIR, l + '.json'), 'utf8')); });
  return listings;
}

function loadStore() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'store.json'), 'utf8'));
}

/** Apple searches the name, subtitle and keywords together: a keyword already in the name or subtitle wastes its characters. */
function searchFieldProblems(where, name, subtitle, keywords) {
  const out = [];
  [['name', name], ['subtitle', subtitle], ['keywords', keywords]].forEach(function (f) {
    if (!f[1]) out.push(where + ': ' + f[0] + ' is empty');
    else if (len(f[1]) > LIMITS[f[0]]) out.push(where + ': ' + f[0] + ' is ' + len(f[1]) + ' characters (limit ' + LIMITS[f[0]] + ')');
  });
  if (!keywords) return out;
  if (/\s/.test(keywords)) out.push(where + ': keywords contain spaces (Apple separates them by commas only)');
  const list = keywords.split(',');
  if (list.some(function (k) { return !k; })) out.push(where + ': keywords have an empty entry');
  const shown = {};
  words(name || '').concat(words(subtitle || '')).forEach(function (w) { shown[w] = true; });
  const repeats = list.filter(function (k) { return shown[norm(k)]; });
  if (repeats.length) out.push(where + ': keywords repeat the name or subtitle: ' + repeats.join(', '));
  const twice = list.filter(function (k, i) { return list.map(norm).indexOf(norm(k)) !== i; });
  if (twice.length) out.push(where + ': keywords listed twice: ' + twice.join(', '));
  return out;
}

function problems(listings, store) {
  const out = [];
  Object.keys(listings).forEach(function (lang) {
    const l = listings[lang];
    if (!PLAY_LOCALES[lang]) out.push(lang + ': no Google Play locale mapped');
    if (ASC_LOCALES[lang]) {
      out.push.apply(out, searchFieldProblems(lang, l.name, l.subtitle, l.keywords));
      ['promotionalText', 'whatsNew'].forEach(function (f) {
        if (!l[f]) out.push(lang + ': ' + f + ' is empty');
        else if (len(l[f]) > LIMITS[f]) out.push(lang + ': ' + f + ' is ' + len(l[f]) + ' characters (limit ' + LIMITS[f] + ')');
      });
    }
    Object.keys(l.variants || {}).forEach(function (locale) {
      const v = l.variants[locale];
      out.push.apply(out, searchFieldProblems(lang + ' (' + locale + ')', v.name || l.name, v.subtitle || l.subtitle, v.keywords || l.keywords));
    });
    ['playTitle', 'shortDescription', 'description'].forEach(function (f) {
      if (!l[f]) out.push(lang + ': ' + f + ' is empty');
      else if (len(l[f]) > LIMITS[f]) out.push(lang + ': ' + f + ' is ' + len(l[f]) + ' characters (limit ' + LIMITS[f] + ')');
    });
    /* Google Play refuses price, ranking and promotion words in a title. */
    if (/\b(free|gratis|gratuit|kostenlos|darmowa|zdarma|ingyenes|no ads|best|top|#1|new)\b/i.test(l.playTitle || '')) {
      out.push(lang + ': playTitle has a word Google Play refuses');
    }
    /* One caption per store screenshot (tools/store-captions.js). */
    const caps = l.screenshotCaptions;
    if (!Array.isArray(caps) || caps.length !== CAPTIONS) out.push(lang + ': screenshotCaptions needs ' + CAPTIONS + ' captions');
    else caps.forEach(function (c, i) {
      if (!c || len(c) > LIMITS.caption) out.push(lang + ': caption ' + (i + 1) + ' is ' + len(c) + ' characters (limit ' + LIMITS.caption + ')');
    });
    const d = l.description || '';
    const at = l.notGov ? d.indexOf(l.notGov) : -1;
    if (at < 0 || at > 400) out.push(lang + ': description must say "' + (l.notGov || '?') + '" within its first 400 characters');
    if (d.indexOf(SOURCES_PAGE) === -1) out.push(lang + ': description must link ' + SOURCES_PAGE);
    if (!REGULATION.test(d)) out.push(lang + ': description must link Regulation 561/2006 on EUR-Lex');
    if (d.indexOf(ROAD_CHARGING) === -1) out.push(lang + ': description must link the road charging page');
    /* The app is published by Aissa Bamogo Redondo and names nobody else. */
    if (/gabor/i.test(JSON.stringify(l))) out.push(lang + ': names someone other than the publisher');
  });
  ['supportUrl', 'privacyPolicyUrl', 'copyright'].forEach(function (f) {
    if (!store[f]) out.push('store.json: ' + f + ' is missing');
  });
  if (/gabor/i.test(JSON.stringify(store))) out.push('store.json: names someone other than the publisher');
  return out;
}

function playRows(listings) {
  const rows = [];
  Object.keys(listings).forEach(function (lang) {
    const l = listings[lang];
    PLAY_LOCALES[lang].forEach(function (code) {
      rows.push({ language: code, title: l.playTitle, short_description: l.shortDescription, full_description: l.description });
    });
  });
  return rows;
}

function ascLocales(listings, store) {
  const out = {};
  Object.keys(listings).forEach(function (lang) {
    const l = listings[lang];
    const locales = (ASC_LOCALES[lang] || []).concat(Object.keys(l.variants || {}).filter(function (v) {
      return (ASC_LOCALES[lang] || []).indexOf(v) === -1;
    }));
    locales.forEach(function (locale) {
      const v = (l.variants || {})[locale] || {};
      out[locale] = {
        name: v.name || l.name, subtitle: v.subtitle || l.subtitle, keywords: v.keywords || l.keywords,
        promotionalText: l.promotionalText, description: l.description, whatsNew: l.whatsNew,
        supportUrl: store.supportUrl, marketingUrl: store.marketingUrl, privacyPolicyUrl: store.privacyPolicyUrl
      };
    });
  });
  return out;
}

function build(outDir) {
  const listings = load();
  const store = loadStore();
  const found = problems(listings, store);
  if (found.length) throw new Error(found.join('\n'));
  fs.mkdirSync(outDir, { recursive: true });
  const q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
  const rows = playRows(listings);
  const csv = ['language,title,short_description,full_description'].concat(rows.map(function (r) {
    return [r.language, r.title, r.short_description, r.full_description].map(q).join(',');
  }));
  fs.writeFileSync(path.join(outDir, 'google-play.csv'), '﻿' + csv.join('\r\n') + '\r\n', 'utf8');
  const asc = ascLocales(listings, store);
  fs.writeFileSync(path.join(outDir, 'asc.json'), JSON.stringify(asc, null, 1) + '\n', 'utf8');
  return { play: rows.length, asc: Object.keys(asc).length };
}

function main() {
  const listings = load();
  const found = problems(listings, loadStore());
  if (found.length) {
    console.log(found.join('\n'));
    process.exit(1);
  }
  console.log(Object.keys(listings).length + ' languages OK: ' + Object.keys(listings).join(' '));
  if (process.argv[2] !== 'build') return;
  const n = build(OUT);
  console.log('wrote build/store-listings/google-play.csv (' + n.play + ' Play languages) and asc.json (' + n.asc + ' Apple locales)');
}

module.exports = { load, loadStore, problems, playRows, ascLocales, build, LIMITS, PLAY_LOCALES, ASC_LOCALES, SOURCES_PAGE };

if (require.main === module) main();
