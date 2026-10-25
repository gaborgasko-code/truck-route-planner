# Planificador de ruta camión on Google Play

Published from the **Aissa Apps** Play Console account (an organisation
account, so no 12-tester closed test is required before production).

| Item | Value |
|---|---|
| Package name | `com.aissaapps.planificador` (permanent once uploaded) |
| Version | from `package.json` (`versionName`); `versionCode` = the Android workflow's run number |
| Target SDK | 36 (Android 16), Google Play's requirement since 31 Aug 2026; Capacitor 8 |
| Build | Aissa's repo → Actions → **Android** → Run workflow with **signed** ticked |
| Output | `planificador-<version>-<run>.aab` for Play, `.apk` (same key) to install directly for testing |
| Signing | upload key from `tools/android-signing.ps1` (in `.signing/`, secrets on `aissab-code/planificador`); Google holds the app signing key (Play App Signing) |
| Listing texts | `store/google-play/listing-en-US.json` (default language, English) and `listing-es-ES.json` (Spanish translation) |
| Graphics | `store/google-play/icon-512.png`, `feature-graphic-<locale>.png`, `screenshots/<locale>/*.png` (1080 × 1920), for en-US and es-ES |
| App language | the phone's language when it is one of the 24 EU languages, otherwise English (the website keeps Spanish) |
| Name under the icon | **Truck Planner**; **Planificador** on Spanish phones (`LABELS` in tools/build-android-resources.js, checked in the bundle) |
| Privacy policy | https://chispapps.com/truckrouteplanner/privacy.html |

Regenerate the graphics with:

```bash
node tools/store-screenshots.js --android --lang en
node tools/store-screenshots.js --android
node tools/store-graphics.js
```

## 1. Create the app

Play Console → **Create app**

- App name: **Truck Route Planner EU** (Spanish listing: Planificador de ruta camión)
- Default language: **English (United States) – en-US**, with **Spanish (Spain) – es-ES** as a translation
- App or game: **App** · Free or paid: **Free**
- Declarations: Developer Program Policies, US export laws.

## 2. Set up your app (Dashboard → "Set up your app")

| Section | Answer |
|---|---|
| Privacy policy | https://chispapps.com/truckrouteplanner/privacy.html |
| App access | All functionality is available without special access (no login) |
| Ads | No, the app does not contain ads |
| Content rating | Category **All other app types**; every question **No** (no violence, sexuality, language, drugs, gambling; users cannot interact or share content or location; no purchases; no web browser) |
| Target audience | **18 and over** (professional drivers); not designed to appeal to children |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Data safety | see below |
| App category | **Maps & Navigation**; contact email aissa.b.code@gmail.com; website = the support page |

### Data safety

- Collects or shares required user data: **Yes**
- Encrypted in transit: **Yes** (all requests are HTTPS)
- Users can request deletion: **No** (no accounts; nothing is stored against a user)
- Shared with third parties: **none**. Google Analytics and OpenStreetMap's services
  process data on the app's behalf, which Play does not count as sharing.

| Data type | Collected | Processed ephemerally | Required or optional | Purpose |
|---|---|---|---|---|
| Location → Precise location ("Usar mi ubicación" → Nominatim) | Yes | Yes | Optional | App functionality |
| App activity → In-app search history (typed addresses → Nominatim) | Yes | Yes | Required | App functionality |
| Location → Approximate location (Google Analytics, from the IP) | Yes | No | Optional (consent) | Analytics |
| App activity → App interactions (Google Analytics, own statistics) | Yes | No | Optional (consent) | Analytics |
| Device or other IDs (Google Analytics instance id) | Yes | No | Optional (consent) | Analytics |

These match the App Store privacy answers (MOBILE_APP_GUIDE.md B.9).

## 3. Store listing (Grow users → Store presence → Main store listing)

Default language English: from `store/google-play/listing-en-US.json`, with
feature graphic `feature-graphic-en-US.png` and phone screenshots
`screenshots/en-US/1-plan.png` … `6-rules.png` (in that order). The Spanish
translation takes `listing-es-ES.json`, `feature-graphic-es-ES.png` and
`screenshots/es-ES/`. The app icon `icon-512.png` is shared.

## 4. Release

1. **Testing → Internal testing → Create new release.** Upload the signed
   `.aab` from the Android workflow's artifact, release notes from
   `releaseNotes` (en-US and es-ES). Add testers (the Google accounts of the phones), install
   from the opt-in link and check the app once on a real phone. The first
   upload must be done by hand in the Console.
2. **Production → Create new release** → *Add from library* (the same
   bundle) → release notes → **Review release** → **Start rollout to
   Production**. Countries: all, or the EU and neighbours.

Google reviews new apps in a few hours to a few days.

## Notes

- **Exact alarms.** The Local Notifications plugin declares
  `SCHEDULE_EXACT_ALARM`. Android 14+ denies it by default, so break reminders
  may fire a minute or two late. That is fine for "your break is in 15
  minutes", and that permission needs no Play declaration.
- **Analytics origin.** The Android WebView's origin is `https://localhost`.
  It is in `ANALYTICS_ORIGINS` (backend `.env` / `wrangler.toml`), but the
  Firebase function must be redeployed before the app's own statistics accept
  Android events. Google Analytics works regardless.
