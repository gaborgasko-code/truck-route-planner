# Truck Route Planner

**created by Gabor Gasko**

A professional, dependency-free web application for planning heavy goods vehicle
runs across Europe: real road routing, EU driving-time compliance, per-country
toll estimation, rest stop suggestions, safe truck parking proximity and
national HGV regulations — on an interactive map.

Two purpose-built front ends share one business-logic core:

| Build | File | Designed for |
|-------|------|--------------|
| **Desktop** | `desktop.html` | dispatchers and planners — sidebar controls, tabbed workspace, wide tables |
| **Mobile** | `mobile.html` | drivers and phones — single column, large touch targets, bottom tab bar |
| **Auto** | `index.html` | detects the device and forwards to the right build |

No API keys, no accounts, no build step, no npm install. Open the file and it runs.

---

## Contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [Architecture](#architecture)
4. [How the numbers are calculated](#how-the-numbers-are-calculated)
5. [Data files](#data-files)
6. [Device detection](#device-detection)
7. [Tests](#tests)
8. [Deployment](#deployment)
9. [Native iOS and Android](#native-ios-and-android)
10. [Troubleshooting](#troubleshooting)
11. [Legal disclaimer](#legal-disclaimer)

---

## Features

**Routing**
- Origin and destination address entry with live autocomplete
- Geocoding via OpenStreetMap **Nominatim**
- Real road geometry, distance and duration via the **OSRM** driving profile
- Swap origin/destination, remembered form values, Ctrl+Enter to calculate

**Truck travel time (Regulation (EC) 561/2006, simplified)**
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

**Stops, parking and rules**
- Rest stop suggested every 350 km along the real polyline
- Safe truck parkings within 50 km of each stop, nearest first, secured vs standard
- Top 3 practical regulations per country on the route, plus the EU baseline

**Map**
- Embedded interactive Leaflet map: route polyline, A/B markers, numbered rest
  stops, clustered parking markers, layer switcher
- Summary panel top-left, regulations panel top-right (both collapsible; on
  phones both start collapsed so they never cover the map)
- **Standalone export**: one self-contained HTML file with the full interactive
  map and all panels, to open in a new tab, save, or e-mail to a driver

**Exports**
- Plain-text route report (copy or download)
- `.gpx` track with waypoints for origin, destination, rest stops and parkings
- `.json` machine-readable result
- Print-friendly stylesheet

**Platform**
- Light and dark theme, remembered per device
- Installable PWA (`manifest.webmanifest` + service worker) — add to home screen
- Works offline for everything except routing and geocoding
- Runs from `file://` as well as from a web server

---

## Quick start

### Option A — just open it

Double-click **`index.html`**. It detects the device and opens the right build.

When opened from the file system the browser cannot `fetch()` the JSON files,
so the app automatically falls back to the generated offline copy in
`js/core/embedded-data.js`. Everything works; the footer chip shows
`built-in data` instead of `data/*.json`.

### Option B — local server (recommended)

Needed for the service worker, for editable `data/*.json` and for testing the
installable behaviour. Requires Node.js (any recent version).

```bash
node tools/serve.js
```

On Windows you can double-click **`start-server.cmd`** instead.

Then open:

| URL | Purpose |
|-----|---------|
| `http://localhost:8080/` | auto-detect |
| `http://localhost:8080/desktop.html` | desktop build |
| `http://localhost:8080/mobile.html` | mobile build |
| `http://localhost:8080/tests/test_runner.html` | test suite in the browser |

### First route

1. Type an origin, e.g. `Hamburg, Germany` (pick a suggestion for an exact match)
2. Type a destination, e.g. `Milan, Italy`
3. Optionally open **Vehicle profile** and set weight, axles, EURO class, fuel
4. Press **Calculate Route**
5. Use **Show Full Itinerary Map** for the map, or **Open standalone map** to
   export it

---

## Architecture

```
truck_route_planner_web/
├─ index.html                 device detection and forwarding
├─ desktop.html               desktop build
├─ mobile.html                mobile build
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
│  ├─ util.js                 formatting, storage, errors
│  ├─ geo.js                  haversine, polyline maths, sampling
│  ├─ embedded-data.js        GENERATED offline copy of data/*.json
│  ├─ data-store.js           dataset loader with offline fallback
│  ├─ api.js                  Nominatim + OSRM clients, timeouts, throttling
│  ├─ time-model.js           driving time, breaks, rests, itinerary
│  ├─ tolls.js                country segments, toll and fuel costs
│  ├─ stops.js                rest stops and safe parking proximity
│  ├─ regulations.js          national regulation lookup
│  ├─ planner.js              orchestrates the whole plan, reports progress
│  ├─ map-export.js           standalone interactive map document builder
│  └─ device.js               device classification and view routing
│
├─ js/ui/
│  ├─ render.js               shared HTML/report renderers
│  ├─ map-view.js             embedded Leaflet map
│  ├─ app-common.js           theme, toasts, autocomplete, exports
│  ├─ desktop-app.js          desktop controller
│  └─ mobile-app.js           mobile controller
│
├─ data/
│  ├─ toll_rates.json         44 countries: rate, toll system, bounding boxes
│  ├─ safe_parkings.json      37 sample secured/standard truck parkings
│  └─ trailer_regulations.json 30 countries + EU baseline
│
├─ tests/
│  ├─ harness.js              zero-dependency assert harness
│  ├─ test_time_estimation.js
│  ├─ test_toll_estimation.js
│  ├─ test_stop_suggestions.js
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
under Node. This deliberately avoids ES modules, because `type="module"`
scripts are blocked by the browser under the `file://` protocol — the app has
to work when someone simply double-clicks a file. It also means there is no
bundler, no transpiler and no `node_modules`.

**Separation.** `js/core/` never touches the DOM. `js/ui/` never talks to the
network. Both front ends call exactly the same `TRP.planner.planRoute()` and
the same renderers, so desktop and mobile can never drift apart numerically.

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
estimate deliberately conservative (worst case). Real scheduling also depends
on tachograph history, loading windows and traffic.

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

`vehicle_factor` scales the published 40 t / 5-axle / EURO VI reference rate by
weight class, axle count and emission class. Points that cannot be resolved are
reported separately as `unclassified` kilometres and cost nothing.

### Rest stops and parking

A stop is placed at every 350 km along the real polyline (a stop that would
land within 5 km of the destination is dropped). For each stop, parkings from
`safe_parkings.json` within 50 km are listed nearest-first, with secured sites
preferred on a tie.

---

## Data files

All three datasets are plain UTF-8 JSON in `data/` and are meant to be edited.

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

### `trailer_regulations.json`

```jsonc
{
  "schema": "trp.trailer_regulations/1",
  "regulations": {
    "DEFAULT": { "name": "General EU baseline", "rules": ["…"] },
    "DE":      { "name": "Germany",             "rules": ["…", "…", "…"] }
  }
}
```

Countries with no entry fall back to `DEFAULT`. The UI shows the first three
rules per country.

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

Both builds carry a link to the other one in the header (desktop) or the Info
tab (mobile).

---

## Tests

51 assertions covering the time model, toll aggregation, stop intervals,
parking proximity, geometry and the shipped datasets — including the required
edge cases (empty route, zero distance, unknown country rate). No network
access and no dependencies.

**Headless:**

```bash
node tests/run_node.js
```

**In the browser:** open `tests/test_runner.html` (directly, or through the dev
server).

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
Chrome and choose *Add to Home Screen*. It then launches full screen with its
own icon and works offline apart from routing.

---

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `No location found for "…"` | The address is too vague. Use `Street 1, City, Country`, or pick an autocomplete suggestion. |
| `No drivable road route was found` | OSRM found no road connection — typically an island or an overseas address that needs a ferry leg. |
| `The routing service replied with HTTP 429` | The free Nominatim / OSRM demo servers are rate limited. Wait a minute and retry, or switch the toll detail to **Fast**. |
| `The request timed out` | Slow or blocked network. The app retries once automatically; retry manually after that. |
| Toll analysis is slow | Use **Fast** (150 km) instead of **Precise** (50 km). Country results are cached, so the same corridor is much faster the second time. |
| Footer shows `built-in data` | The JSON files could not be fetched — normal when opening from `file://`. Run `node tools/serve.js` to use the editable files. |
| Edited a dataset but nothing changed | Either you are on `file://` (regenerate with `node tools/build-embedded-data.js`) or the service worker cached the old file (hard refresh, or bump `CACHE_VERSION`). |
| The standalone map does not open | The browser blocked the pop-up. Use **Download map (.html)** and open the saved file. |
| Map area is blank | Leaflet is loaded from a CDN; check the connection and any content blocker. |
| Place names appear in an unexpected language | Nominatim follows the browser's language preference. Change the browser language to change the labels. |
| A stop shows no parking | `safe_parkings.json` is an illustrative sample. Add your own operator's sites to the file. |

---

## Legal disclaimer

**All distances, driving times, tolls, rest stops, parking data and national
regulations produced by this application are ESTIMATES for planning purposes
only. They are not legally binding and do not constitute legal advice.**

Toll tariffs, driving bans, holiday calendars, winter equipment periods, low
emission zones and dimension limits change frequently and differ by region,
vehicle and cargo. The safe parking dataset is an illustrative sample: capacity,
security level, opening hours and booking requirements must be confirmed with
the operator. Driving and rest time compliance remains the responsibility of the
driver and the transport operator, based on actual tachograph records.

**Verify every figure with the competent national authority and the official
toll operator before departure.**

Routing and geocoding are provided by the free OpenStreetMap Nominatim service
and the OSRM demo server. Both are community resources with usage policies and
no availability guarantee; do not rely on them for production dispatch without
hosting your own instances.

---

**created by Gabor Gasko**
