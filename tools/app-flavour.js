#!/usr/bin/env node
/**
 * Truck Route Planner - the native app's flavour of the web code.
 *
 * The iOS app is published by Aissa Bamogo Redondo and carries no reference
 * to its developer at all: not in the interface, the texts in any of the 24
 * languages, the data files, the exports it writes, or the source comments
 * that travel inside the bundle. The website keeps its credit; this runs only
 * on the copy that goes into www/.
 *
 * tools/build-app.js passes every text file through flavour() and then calls
 * leftovers(), which fails the build if the name survives anywhere - so a new
 * mention added to the web code later cannot slip into the app unnoticed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PUBLISHER = 'Aissa Bamogo Redondo';
const CONTACT = 'aissa.b.code@gmail.com';

/* The developer's name as it may appear in any file, any case. */
const NAME = /gabor/i;

/*
 * "Controller and contact" in the privacy section, naming the publisher of
 * the app. Phrased so the publisher's name never needs a gendered article or
 * verb form (Greek and Irish use a "publisher:" construction for that).
 */
const PUBLISHER_TEXT = {
  es: 'Esta aplicación la publica ' + PUBLISHER + '. Para cualquier cuestión sobre privacidad, escriba a ' + CONTACT + '.',
  en: 'This application is published by ' + PUBLISHER + '. For any privacy question, write to ' + CONTACT + '.',
  bg: 'Това приложение се публикува от ' + PUBLISHER + '. За всякакви въпроси относно поверителността пишете на ' + CONTACT + '.',
  cs: 'Tuto aplikaci vydává ' + PUBLISHER + '. S dotazy k ochraně soukromí pište na ' + CONTACT + '.',
  da: 'Denne app udgives af ' + PUBLISHER + '. Spørgsmål om privatliv kan sendes til ' + CONTACT + '.',
  de: 'Diese Anwendung wird von ' + PUBLISHER + ' veröffentlicht. Bei Fragen zum Datenschutz schreiben Sie bitte an ' + CONTACT + '.',
  el: 'Η εφαρμογή δημοσιεύεται από: ' + PUBLISHER + '. Για κάθε ερώτημα σχετικά με το απόρρητο, γράψτε στο ' + CONTACT + '.',
  et: 'Selle rakenduse avaldaja on ' + PUBLISHER + '. Privaatsusega seotud küsimuste korral kirjutage aadressil ' + CONTACT + '.',
  fi: 'Tämän sovelluksen julkaisija on ' + PUBLISHER + '. Tietosuojaa koskevat kysymykset voi lähettää osoitteeseen ' + CONTACT + '.',
  fr: 'Cette application est publiée par ' + PUBLISHER + '. Pour toute question relative à la confidentialité, écrivez à ' + CONTACT + '.',
  ga: 'Foilsitheoir an fheidhmchláir: ' + PUBLISHER + '. Le haghaidh aon cheist faoi phríobháideachas, scríobh chuig ' + CONTACT + '.',
  hr: 'Ovu aplikaciju objavljuje ' + PUBLISHER + '. Za sva pitanja o privatnosti pišite na ' + CONTACT + '.',
  hu: 'Az alkalmazás kiadója: ' + PUBLISHER + '. Adatvédelmi kérdéseivel írjon az ' + CONTACT + ' címre.',
  it: 'Questa applicazione è pubblicata da ' + PUBLISHER + '. Per qualsiasi questione di privacy, scrivere a ' + CONTACT + '.',
  lt: 'Šią programėlę leidžia ' + PUBLISHER + '. Kilus klausimų dėl privatumo, rašykite adresu ' + CONTACT + '.',
  lv: 'Šo lietotni publicē ' + PUBLISHER + '. Ar jautājumiem par privātumu rakstiet uz ' + CONTACT + '.',
  mt: 'Din l-applikazzjoni hija ppubblikata minn ' + PUBLISHER + '. Għal kwalunkwe mistoqsija dwar il-privatezza, ikteb lil ' + CONTACT + '.',
  nl: 'Deze applicatie wordt uitgegeven door ' + PUBLISHER + '. Voor vragen over privacy kunt u schrijven naar ' + CONTACT + '.',
  pl: 'Tę aplikację publikuje ' + PUBLISHER + '. W sprawach dotyczących prywatności napisz na adres ' + CONTACT + '.',
  pt: 'Esta aplicação é publicada por ' + PUBLISHER + '. Para qualquer questão de privacidade, escreva para ' + CONTACT + '.',
  ro: 'Această aplicație este publicată de ' + PUBLISHER + '. Pentru orice întrebare privind confidențialitatea, scrieți la ' + CONTACT + '.',
  sk: 'Túto aplikáciu vydáva ' + PUBLISHER + '. S otázkami o ochrane súkromia píšte na ' + CONTACT + '.',
  sl: 'To aplikacijo izdaja ' + PUBLISHER + '. Za vsa vprašanja o zasebnosti pišite na ' + CONTACT + '.',
  sv: 'Den här appen ges ut av ' + PUBLISHER + '. Frågor om integritet kan skickas till ' + CONTACT + '.'
};

/* As a single-quoted JavaScript string literal, matching the i18n files. */
function jsString(s) {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/*
 * The rewrites, most specific first. Each one targets a shape the web code
 * actually has; anything they miss is caught by leftovers() afterwards.
 */
function flavour(text, relPath) {
  const file = relPath.replace(/\\/g, '/');
  let s = text;

  /* Source header lines:  " * created by Gabor Gasko"  in JS and CSS. */
  s = s.replace(/^[ \t]*\*[ \t]*created by Gabor Gasko[ \t]*\r?\n/gm, '');

  /* The "created by" link to the LinkedIn profile, wherever it sits. */
  s = s.replace(/[ \t]*<a class="author-link[^"]*"[\s\S]*?<\/a>[ \t]*\r?\n?/g, '');
  /* A footer that held nothing else would be an empty framed box. */
  s = s.replace(/[ \t]*<footer class="view-footer">\s*<\/footer>[ \t]*\r?\n?/g, '');

  /* The product name: "Planificador de ruta - Gabor", in every language. */
  s = s.replace(/[ \t]+-[ \t]+Gabor\b/g, '');

  /* Data files and the copy of them embedded in the code. */
  s = s.replace(/"author"\s*:\s*"created by Gabor Gasko"\s*,\s*/g, '');

  /* The credit the code prints into reports and exports. With these empty,
     the exporters leave the line out altogether. */
  if (file === 'js/core/config.js') {
    s = s.replace(/(AUTHOR\s*:\s*)'[^']*'/, "$1''");
    s = s.replace(/(AUTHOR_URL\s*:\s*)'[^']*'/, "$1''");
  }

  /* Translations: the credit, and who the app is published by. */
  if (file === 'js/core/i18n.js') {
    s = s.replace(/('app\.author'\s*:\s*)\{[^}]*\}/, "$1{ es: '', en: '' }");
    s = s.replace(/('privacy\.s8body'\s*:\s*\{\s*es:\s*)'(?:[^'\\]|\\.)*'(\s*,\s*en:\s*)'(?:[^'\\]|\\.)*'/,
      function (m, a, b) { return a + jsString(PUBLISHER_TEXT.es) + b + jsString(PUBLISHER_TEXT.en); });
  }
  const pack = /^js\/i18n\/([a-z]{2})\.js$/.exec(file);
  if (pack) {
    const code = pack[1];
    if (!PUBLISHER_TEXT[code]) throw new Error('no publisher text for language ' + code);
    s = s.replace(/('app\.author'\s*:\s*)'[^']*'/, "$1''");
    s = s.replace(/('privacy\.s8body'\s*:\s*)'(?:[^'\\]|\\.)*'/,
      function (m, a) { return a + jsString(PUBLISHER_TEXT[code]); });
  }

  /* The app has a "use my location" button the website does not, so its
     privacy page says what happens to the location - in the words iOS
     already shows when asking for permission, which exist in every language. */
  if (file === 'PRIVACY.html') {
    s = s.replace(/([ \t]*)(<p data-i18n="privacy\.s3body"><\/p>)/,
      '$1$2\n$1<p data-i18n="location.purpose"></p>');
  }

  /* Whatever is left of the credit in descriptions and metadata. */
  s = s.replace(/[ \t]*created by Gabor Gasko/g, '');

  return s;
}

/* Files flavour() reads and rewrites; images and fonts are left alone. */
const TEXT = /\.(html?|js|mjs|css|json|webmanifest|txt|svg|xml|md)$/i;

/** Every remaining mention of the name under dir, as "file:line: text". */
function leftovers(dir) {
  const found = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (NAME.test(e.name)) found.push(path.relative(dir, p) + ': file name');
      const buf = fs.readFileSync(p);
      /* latin1 keeps every byte, so a name inside a binary is found too. */
      const text = buf.toString(TEXT.test(e.name) ? 'utf8' : 'latin1');
      if (!NAME.test(text)) return;
      text.split(/\r?\n/).forEach(function (line, i) {
        if (NAME.test(line)) {
          found.push(path.relative(dir, p).replace(/\\/g, '/') + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
        }
      });
    });
  })(dir);
  return found;
}

module.exports = { flavour, leftovers, TEXT, PUBLISHER, CONTACT, PUBLISHER_TEXT };
