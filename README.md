# Truck Route Planner

**created by Gabor Gasko**

A professional, dependency-free web application for planning heavy goods vehicle
runs across Europe: real road routing, **EU legal stop planning**, per-country
toll estimation, safe truck parking and national HGV regulations — on an
interactive map, in **Spanish (default) or English**.

Two purpose-built front ends share one business-logic core:

| Build | File | Designed for |
|-------|------|--------------|
| **Desktop** | `desktop.html` | dispatchers and planners — sidebar controls, tabbed workspace, wide tables |
| **Mobile** | `mobile.html` | drivers and phones — single column, large touch targets, bottom tab bar |
| **Auto** | `index.html` | detects the device and forwards to the right build |

No API keys, no accounts, no build step, no npm install. Open the file and it runs.

Current version: **2.1.0**.

---

## Contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [Language](#language)
4. [Legal stops (EU)](#legal-stops-eu)
5. [Architecture](#architecture)
6. [How the numbers are calculated](#how-the-numbers-are-calculated)
7. [Data files](#data-files)
8. [Device detection](#device-detection)
9. [Tests](#tests)
10. [Deployment](#deployment)
11. [Native iOS and Android](#native-ios-and-android)
12. [Troubleshooting](#troubleshooting)
13. [Legal disclaimer](#legal-disclaimer)

---

## Features

**Bilingual, Spanish first**
- Spanish is the default language everywhere; English is one click away
- Numbers, dates and durations follow the locale (`1.234,5 km` vs `1,234.5 km`)
- Address lookups ask Nominatim for the active language
- National regulations and the EU rule texts are translated in the datasets
- Switching language re-renders the current result instantly — no recalculation

**Routing**
- Origin and destination entry with live autocomplete
- Geocoding via OpenStreetMap **Nominatim**
- Real road geometry, distance and duration via the **OSRM** driving profile
- Swap origin/destination, remembered form values, Ctrl+Enter to calculate

**EU legal stops** *(Regulation (EC) 561/2006)*
- A mandatory stop plan: what kind of stop, when, at which kilometre, for how
  long as a minimum, under which article, and what alternative is permitted
- Compliance checks: continuous driving, driving days, 56 h weekly, 90 h
  fortnightly, and the six 24-hour-period weekly rest deadline
- A seven-block reference summary of 561/2006, Regulation (EU) 165/2014
  (tachographs) and Directive 2002/15/EC (working time), with article references
- Available before any route is calculated, so it doubles as a quick reference

**Truck travel time**
- Driving time from distance and configurable average truck speed
- 45-minute break after every 4h30 of continuous driving
- 11-hour daily rest after every 9 hours of driving
- Full chronological itinerary with real timestamps and an estimated arrival
- Weekend driving-ban warnings for departure and arrival

**Toll estimation**
- Route sampled at a configurable interval (150 / 100 / 50 km)
- Each sample resolved to a country — first with **offline bounding boxes**,
  only then with the Nominatim reverse-geocoder (rate limited to 1 req/s)
- Resolved countries are cached on the device, so repeat routes are fast
- Per-country breakdown: kilometres, base rate, applied rate, cost, toll system
- Vehicle profile factor (weight, axle count, EURO class) applied to the rates
- Vignette / time-based countries shown explicitly at 0.00 EUR/km
- Diesel cost estimate and total run cost per kilometre

**Stops, parking and national rules**
- Rest stop suggested every 350 km along the real polyline
- Safe truck parkings within 50 km of each stop, nearest first, secured vs standard
- Top 3 practical regulations per country on the route, plus the EU baseline

**Map**
- Embedded interactive Leaflet map: route polyline, A/B markers, numbered rest
  stops, clustered parking markers, layer switcher
- Summary panel top-left, rules panel top-right carrying the legal stop plan
  (both collapsible; on phones both start collapsed so they never cover the map)
- **Standalone export**: one self-contained HTML file with the full interactive
  map, all panels and the legal stops, in the active language

**Exports**
- Plain-text route report including the legal stop plan and compliance checks
- `.gpx` track with waypoints for origin, destination, rest stops and parkings
- `.json` machine-readable result
- Print-friendly stylesheet

**Platform**
- Light and dark theme, remembered per device
- Installable PWA (`manifest.webmanifest` + service worker)
- Works offline for everything except routing and geocoding
- Runs from `file://` as well as from a web server

---

## Quick start

### Option A — just open it

Double-click **`index.html`**. It detects the device and opens the right build,
in Spanish.

When opened from the file system the browser cannot `fetch()` the JSON files, so
the app automatically falls back to the generated offline copy in
`js/core/embedded-data.js`. Everything works; the header shows
`origen: datos integrados` instead of `data/*.json`.

### Option B — local server (recommended)

Needed for the service worker, for editable `data/*.json` and for testing the
installable behaviour. Requires Node.js (any recent version).

```bash
node tools/serve.js
```

On Windows you can double-click **`start-server.cmd`** instead.

| URL | Purpose |
|-----|---------|
| `http://localhost:8080/` | auto-detect |
| `http://localhost:8080/desktop.html` | desktop build |
| `http://localhost:8080/mobile.html` | mobile build |
| `http://localhost:8080/tests/test_runner.html` | test suite in the browser |

### First route

1. Type an origin, e.g. `Madrid, España` (pick a suggestion for an exact match)
2. Type a destination, e.g. `Hamburgo, Alemania`
3. Optionally open **Perfil del vehículo** and set weight, axles, EURO class, fuel
4. Press **Calcular ruta**
5. Open **Paradas legales** for the mandatory stop plan, or
   **Ver mapa completo del itinerario** for the map

---

## Language

Spanish is the product default. The selector sits in the header: `Español` /
`English` on the desktop, `ES` / `EN` on mobile (where the header has to fit a
375 px phone).

- The choice is stored in `localStorage` under `trp.lang` and also drives the
  entry page and the user guide.
- Changing it re-translates the DOM and re-renders the result already on screen,
  including the embedded map panels — no network call, no recalculation.
- `util.formatNumber` / `formatDateTime` read the active locale, so figures and
  timestamps switch too.
- `api.js` sends `accept-language` to Nominatim, so place names come back in the
  selected language rather than following the browser.

### Adding a language

1. Add the code to `LOCALES` and `LANG_NAMES` in `js/core/i18n.js`, then add the
   variant to every entry of `STRINGS` (the test suite fails on any gap).
2. Add the same key to the language-keyed fields in
   `data/trailer_regulations.json` and `data/eu_driving_rules.json`.
3. Run `node tools/build-embedded-data.js`.

There is nothing to compile. `tests/test_i18n.js` will tell you what is missing.

---

## Legal stops (EU)

The **Paradas legales / Legal stops** tab is the compliance view. It answers
"where and for how long must this driver stop?" and shows the authority for each
answer.

| Block | Contents |
|-------|----------|
| Mandatory stop plan | Every required stop: type, time, kilometre, driving accumulated, minimum duration, article, permitted alternative |
| Compliance checks | Continuous driving, driving days needed, 56 h weekly, 90 h fortnightly, weekly rest deadline — each with value, limit and verdict |
| Reference rules | Seven grouped blocks with article references, available without a route |

The stop plan is derived from the same itinerary the Itinerary tab shows, so the
two can never disagree. Anything above a legal ceiling is flagged and also
appears in the planning warnings.

### The limits applied

| Rule | Value | Basis |
|------|-------|-------|
| Maximum continuous driving | 4 h 30 min | Art. 7 |
| Mandatory break after that | 45 min (or 15 + 30) | Art. 7 |
| Maximum daily driving | 9 h (10 h twice a week) | Art. 6.1 |
| Maximum weekly driving | 56 h | Art. 6.2 |
| Driving over two consecutive weeks | 90 h | Art. 6.3 |
| Regular daily rest | 11 h (3 + 9 split, or 9 h reduced ×3) | Art. 8.2, 8.4 |
| Weekly rest | 45 h (24 h reduced), after six 24-hour periods | Art. 8.6 |
| Multi-manning daily rest | 9 h within 30 h | Art. 8.5 |

The reference texts also cover the ferry/train interruption (Art. 9), the
exceptional derogation to reach a suitable stopping place (Art. 12), the ban on
spending a regular weekly rest in the vehicle (Art. 8.8), working time limits
(Directive 2002/15/EC) and tachograph record-keeping (Regulation (EU) 165/2014).

> The model assumes a fresh driver on a clean shift, single manning, no reduced
> rests, no extended days, no ferry rules and no loading time. It is a planning
> aid, not a tachograph.

---

## Architecture

```
truck_route_planner_web/
├─ index.html                 device detection and forwarding
├─ desktop.html               desktop build
├─ mobile.html                mobile build
├─ USER_GUIDE.html            bilingual user guide
├─ manifest.webmanifest       PWA metadata
├─ sw.js                      service worker (offline app shell)
├─ start-server.cmd           Windows launcher for the dev server
│
├─ css/
│  ├─ theme.css               design tokens + shared components (blue/yellow)
│  ├─ desktop.css             sidebar + tabbed workspace layout
│  └─ mobile.css              single column + bottom navigation layout
│
├─ js/core/                   UI-agnostic business logic (shared by both builds)
│  ├─ config.js               constants, legal limits, service endpoints
│  ├─ i18n.js                 dictionary, locale, DOM translation (Spanish default)
│  ├─ util.js                 locale-aware formatting, storage, errors
│  ├─ geo.js                  haversine, polyline maths, sampling
│  ├─ embedded-data.js        GENERATED offline copy of data/*.json
│  ├─ data-store.js           dataset loader with offline fallback
│  ├─ api.js                  Nominatim + OSRM clients, timeouts, throttling
│  ├─ time-model.js           driving time, breaks, rests, itinerary
│  ├─ eu-rules.js             legal stop plan and compliance checks
│  ├─ tolls.js                country segments, toll and fuel costs
│  ├─ stops.js                rest stops and safe parking proximity
│  ├─ regulations.js          national regulation lookup (per language)
│  ├─ planner.js              orchestrates the whole plan, reports progress
│  ├─ map-export.js           standalone interactive map document builder
│  └─ device.js               device classification and view routing
│
├─ js/ui/
│  ├─ render.js               shared HTML/report renderers
│  ├─ map-view.js             embedded Leaflet map
│  ├─ app-common.js           language, theme, toasts, autocomplete, exports
│  ├─ desktop-app.js          desktop controller
│  └─ mobile-app.js           mobile controller
│
├─ data/
│  ├─ toll_rates.json         44 countries: rate, toll system, bounding boxes
│  ├─ safe_parkings.json      37 sample secured/standard truck parkings
│  ├─ trailer_regulations.json 30 countries + EU baseline, ES/EN
│  └─ eu_driving_rules.json   Regulation 561/2006 et al., ES/EN, by article
│
├─ tests/                     92 assertions, no network, no dependencies
│  ├─ harness.js
│  ├─ test_time_estimation.js
│  ├─ test_toll_estimation.js
│  ├─ test_stop_suggestions.js
│  ├─ test_legal_stops.js
│  ├─ test_i18n.js
│  ├─ run_node.js             headless runner
│  └─ test_runner.html        browser runner
│
├─ tools/
│  ├─ serve.js                static dev server (no dependencies)
│  └─ build-embedded-data.js  regenerates js/core/embedded-data.js
│
└─ assets/                    SVG app icons
```

**Module pattern.** Every module is a plain IIFE that attaches itself to the
global `TRP` namespace and also exports through `module.exports` when running
under Node. This deliberately avoids ES modules, because `type="module"` scripts
are blocked by the browser under the `file://` protocol — the app has to work
when someone simply double-clicks a file. It also means there is no bundler, no
transpiler and no `node_modules`.

**Separation.** `js/core/` never touches the DOM. `js/ui/` never talks to the
network. Core modules never contain user-visible prose either: they emit
translation keys (`{key, params}`) that the renderers resolve, which is what lets
a language switch re-render an existing result with no recalculation.

---

## How the numbers are calculated

### Driving time

```
driving_hours        = distance_km / average_speed          (default 70 km/h)
breaks_count         = floor(driving_hours / 4.5)
break_minutes        = breaks_count * 45
full_days            = floor(driving_hours / 9)
overnight_rest_hours = full_days * 11
total_hours          = driving_hours + break_minutes/60 + overnight_rest_hours
```

Breaks and daily rests are applied **cumulatively**, which makes the arrival
estimate deliberately conservative (worst case).

### Tolls

1. Sample the route polyline every *N* km (150 / 100 / 50 depending on the
   chosen detail level), always including the start and the end point.
2. Resolve every sample to an ISO-2 country code:
   - **Offline first.** Every country in `toll_rates.json` carries one or more
     *generous* bounding boxes. If a point falls inside exactly one box, that
     match is guaranteed correct and costs no network call.
   - **Cache second.** Resolved coordinates are cached in `localStorage`,
     rounded to 0.1°.
   - **Network last.** Otherwise the Nominatim reverse-geocoder is called,
     serialised at one request per second per its usage policy.
3. Attribute the distance between two consecutive samples to the country of the
   earlier sample and merge consecutive identical countries into segments.
4. `cost = km × base_rate × vehicle_factor`, kilometres rounded to 1 decimal,
   costs to 2.

### Rest stops and parking

A stop is placed at every 350 km along the real polyline (a stop that would land
within 5 km of the destination is dropped). For each stop, parkings from
`safe_parkings.json` within 50 km are listed nearest-first, with secured sites
preferred on a tie.

---

## Data files

All datasets are plain UTF-8 JSON in `data/` and are meant to be edited.
Text that the user reads is language-keyed as `{ "es": …, "en": … }`.

### `toll_rates.json`

```jsonc
{
  "schema": "trp.toll_rates/1",
  "currency": "EUR",
  "rates": {
    "DE": {
      "name": "Germany",
      "rate_eur_per_km": 0.35,     // indicative blended rate, 40 t / EURO VI
      "system": "Toll Collect (LKW-Maut)",
      "distance_based": true,      // false = time-based vignette
      "bboxes": [[5.7, 47.2, 15.2, 55.2]],  // [minLon, minLat, maxLon, maxLat]
      "notes": "Applies from 3.5 t on all federal roads."
    }
  }
}
```

> **Bounding boxes must be a superset of the real border.** The offline
> pre-filter only accepts a *unique* box match, so a generous box can never
> produce a wrong country — it just falls back to the reverse-geocoder more
> often. A box that is too small, however, can misclassify points.

### `safe_parkings.json`

```jsonc
{
  "schema": "trp.safe_parkings/1",
  "parkings": [
    {
      "id": "TRP-DE-001",
      "name": "Kaldenkirchen Truck Park",
      "country": "DE", "city": "Nettetal",
      "lat": 51.3180, "lon": 6.2120,
      "secured": true, "security_level": 3,   // 1 basic … 4 high security
      "spaces": 130,
      "facilities": ["fenced", "cctv", "showers", "restaurant", "fuel", "24h"],
      "access": "A61 exit 6",
      "booking": "recommended"                // no | recommended | required
    }
  ]
}
```

`facilities` and `booking` are keywords translated through
`i18n.term('fac', …)` / `i18n.term('booking', …)`, so add the matching
`fac.<keyword>` entry to `i18n.js` when introducing a new one.

### `trailer_regulations.json` (schema v2, bilingual)

```jsonc
{
  "schema": "trp.trailer_regulations/2",
  "regulations": {
    "DEFAULT": {
      "name":  { "es": "Base común de la UE", "en": "General EU baseline" },
      "rules": { "es": ["…"], "en": ["…"] }
    },
    "DE": {
      "name":  { "es": "Alemania", "en": "Germany" },
      "rules": { "es": ["…", "…", "…"], "en": ["…", "…", "…"] }
    }
  }
}
```

Countries with no entry fall back to `DEFAULT`. The UI shows the first three
rules per country. Both languages must list the same number of rules — the test
suite checks it.

### `eu_driving_rules.json`

```jsonc
{
  "schema": "trp.eu_driving_rules/1",
  "limits": { "max_continuous_driving_h": 4.5, "break_min": 45, … },
  "groups": [
    {
      "id": "breaks",
      "icon": "☕",
      "title": { "es": "Pausas de conducción", "en": "Driving breaks" },
      "rules": [
        {
          "article": "Art. 7",
          "text": { "es": "Tras un periodo de conducción de 4 h 30 min…",
                    "en": "After a driving period of 4 hours 30 minutes…" }
        }
      ]
    }
  ]
}
```

`limits` feeds the compliance checks and the minimum stop durations; `groups`
feeds the reference panel. Editing a limit here changes the checks without
touching any code.

### After editing a dataset

Regenerate the offline copy so `file://` users see the change too:

```bash
node tools/build-embedded-data.js
```

---

## Device detection

`index.html` classifies the device from the user agent, the reported screen
width, `maxTouchPoints` and the `(pointer: coarse)` media query — including the
iPadOS case, which reports a desktop user agent but more than one touch point.

- Phone user agent, or coarse pointer under 900 px, or width under 760 px → **mobile**
- Tablet at 900 px or wider → **desktop**
- Everything else → **desktop**

The result is always overridable and is remembered:

```
index.html?view=mobile      desktop.html?view=desktop      mobile.html?view=mobile
```

---

## Tests

92 assertions across five suites — the time model, toll aggregation, stop
intervals and parking proximity, the EU legal stop plan and compliance checks,
and localisation (including a check that no dictionary key is left untranslated
and that both languages of every dataset entry line up). No network access and
no dependencies.

**Headless:**

```bash
node tests/run_node.js
```

**In the browser:** open `tests/test_runner.html`.

---

## Deployment

The app is fully static — any web host or CDN works. Copy the whole folder and
serve it. Serve `.webmanifest` as `application/manifest+json` if your host does
not already.

**GitHub Pages:** push the folder to a repository and enable Pages on the
branch. Keep the `.nojekyll` file so paths starting with an underscore are
served, and put your domain in `CNAME` if you use one.

**HTTPS is required** for the service worker and for "add to home screen" to
work. Over plain HTTP the app still runs; it just does not install or cache.

After deploying a change, bump `CACHE_VERSION` in `sw.js` so returning visitors
pick up the new shell immediately.

---

## Native iOS and Android

The same code base becomes a real App Store / Play Store app through Capacitor —
no rewrite, no second implementation. See **[MOBILE_APP_GUIDE.md](MOBILE_APP_GUIDE.md)**
for the full step-by-step build, including signing, permissions and the
platform-specific gotchas.

In the meantime, the PWA is already installable: open `mobile.html` in Safari or
Chrome and choose *Add to Home Screen*.

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `No se ha encontrado ninguna ubicación…` | The address is too vague. Use `Calle 1, Ciudad, País`, or pick an autocomplete suggestion. |
| `No se ha encontrado una ruta por carretera` | OSRM found no road connection — typically an island or an overseas address that needs a ferry leg. |
| `HTTP 429` | The free Nominatim / OSRM demo servers are rate limited. Wait a minute and retry, or switch the toll detail to **Rápido**. |
| Toll analysis is slow | Use **Rápido** (150 km) instead of **Preciso** (50 km). Country results are cached, so the same corridor is much faster the second time. |
| App opens in the wrong language | Use the header selector. Clearing site data restores Spanish, the default. |
| Header shows `datos integrados` | The JSON files could not be fetched — normal on `file://`. Run `node tools/serve.js` to use the editable files. |
| Edited a dataset but nothing changed | Either you are on `file://` (regenerate with `node tools/build-embedded-data.js`) or the service worker cached the old file (hard refresh, or bump `CACHE_VERSION`). |
| A dictionary key shows up as raw text | The key is missing from `js/core/i18n.js`. `node tests/run_node.js` lists every gap. |
| The standalone map does not open | The browser blocked the pop-up. Use **Descargar mapa (.html)** and open the saved file. |
| Map area is blank | Leaflet is loaded from a CDN; check the connection and any content blocker. |
| A stop shows no parking | `safe_parkings.json` is an illustrative sample. Add your own operator's sites to the file. |

---

## Legal disclaimer

**All distances, driving times, legal stops, tolls, rest stops, parking data and
national regulations produced by this application are ESTIMATES for planning
purposes only. They are not legally binding and do not constitute legal advice.**

The summary of Regulation (EC) 561/2006 shipped with the app is a synthesis and
does not replace the legal text. National exemptions, combined transport
arrangements, multi-manning and temporary derogations exist. Toll tariffs,
driving bans, holiday calendars, winter equipment periods, low emission zones and
dimension limits change frequently and differ by region, vehicle and cargo. The
safe parking dataset is an illustrative sample: capacity, security level, opening
hours and booking requirements must be confirmed with the operator. Driving and
rest time compliance remains the responsibility of the driver and the transport
operator, based on actual tachograph records.

**Verify every figure with the competent national authority and the official
toll operator before departure.**

Routing and geocoding are provided by the free OpenStreetMap Nominatim service
and the OSRM demo server. Both are community resources with usage policies and
no availability guarantee; do not rely on them for production dispatch without
hosting your own instances.

---

**created by Gabor Gasko**
