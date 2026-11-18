# Store search (ASO)

How the store texts in `store/listings/` were chosen, so the next change starts
from the evidence rather than from scratch. Research of 14 and 18 Nov 2026,
from public store endpoints only: App Store search and autocomplete per
storefront, and Google Play's search page per language and country.

## What decides the rank

| Store | Searched | Not searched |
|---|---|---|
| App Store | name (30), subtitle (30), keywords (100, hidden) of each locale the storefront indexes | description, promotional text |
| Google Play | title (30), short description (80), full description, in the listing language | — |

Both stores also weigh installs, ratings and how often people who see the
listing install it. The app had **one rating** (App Store, Spain) on 18 Nov
2026, so version 2.3.1 asks for one after the 3rd, 10th and 30th route
(`routeCalculated` in `js/ui/native.js`).

## What the research showed

- **Driving and rest times are an open field in every language.** Searches such
  as *Lenkzeiten*, *temps de conduite*, *czas jazdy*, *timpi de conducere*,
  *rij- en rusttijden*, *køretid* return 1–65 apps, and the leaders have 0–3
  ratings. Every name or subtitle carries that phrase.
- **Tachograph searches have demand and weak leaders** (top truck apps 0–47
  ratings), but the app does not read a tachograph, so *tachograph* stays in
  the hidden keywords only, never in a visible title.
- **"Truck GPS / truck navigation" belongs to TomTom, Sygic, Eurowag,
  RoadLords** (thousands of ratings). Not a target; the descriptions say the
  app plans and does not navigate.
- **Before 18 Nov the App Store page existed only in Spanish and Play only in
  English and Spanish**, so the app was invisible outside Spain on the App
  Store and only ranked from the English page on Play (#4 Slovakia, #8 Sweden,
  #10 Czechia, #10–30 for "truck route planner" across Europe).
- Spain on 14 Nov: #1 *planificador de ruta camión*, #1 *pausas camión*,
  #4 *planificador rutas camión*, #19 *ruta camión*. The Spanish name stays.

## Rules the texts follow (checked by `tools/store-listings.js`)

- Name and Play title lead with the phrase drivers type in that language
  (*LKW Routenplaner*, *Trasy TIR*, *Planificator rute camion TIR*); the
  subtitle carries the second phrase (driving and rest times, tolls).
- Apple keywords: single words, no word already in the name or subtitle (Apple
  combines them), no duplicates, diacritic variants count as duplicates.
- No price or ranking words in a Play title (*free, best, top, #1, new*).
- Every description says it is not a government app within its first 400
  characters and ends with the official sources (Google Play's Misleading
  Claims policy, see google-play.md).
- The form of address and the terms follow the app's own translation
  (`js/i18n/<lang>.js`).

## Extra keyword pages on the App Store

- **en-GB** is indexed by most European storefronts besides their own
  language, and is the only page Apple searches in Bulgaria and the Baltic
  states (Apple has no Bulgarian, Estonian, Latvian or Lithuanian locale).
- **ca** (Catalan) is also indexed in Spain: a second Spanish keyword set
  (`variants.ca` in `es.json`), with the Spanish description.
- Not used: Irish and Maltese (neither store offers them).

## Screenshots

`node tools/store-screenshots.js --lang all` (and `--android --lang all`)
photographs the app in each language on the same route, Valencia to Lyon,
with the place names in that language. `node tools/store-captions.js` frames
each shot with its caption (`screenshotCaptions`) in the app's colours: the
stores show the first three in search results. The national-rules texts in
the app exist in English and Spanish only, so shot 6 shows English text in
the other languages.

## Measuring again

The scripts and raw results are kept outside the repository, in
`Desktop/Python/_admin/aso/` (`research.mjs trp` for the 14 Nov baseline,
`trp-2026-11-18/` for the per-language research). Re-measure two to four
weeks after a store change: Apple re-indexes within days, Google within one
to two weeks.
