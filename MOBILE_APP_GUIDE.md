# Native iOS and Android build guide

**Truck Route Planner — created by Gabor Gasko**

This guide turns the existing web app into real, installable **iPhone** and
**Android** applications. There is no rewrite: Capacitor wraps the same
`mobile.html`, the same `js/core/` logic and the same datasets in a native
shell, so every future fix lands in all three targets at once.

Three routes are covered:

| Route | Effort | Result |
|-------|--------|--------|
| **A. PWA** | minutes | Add to Home Screen, works today, no store account |
| **B. Capacitor** | ~1 hour | Real `.ipa` / `.aab` for the App Store and Play Store |
| **C. TWA** (Android only) | ~30 min | Play Store listing that wraps the hosted PWA |

Route B is the recommended one and is documented in full.

---

## A. Progressive Web App (available right now)

The app already ships `manifest.webmanifest`, a service worker and SVG icons.

1. Host the folder over **HTTPS** (see *Deployment* in `README.md`).
2. **iPhone:** open the site in Safari → Share → *Add to Home Screen*.
3. **Android:** open in Chrome → menu → *Install app* / *Add to Home screen*.

It launches full screen with its own icon, keeps the app shell offline and
remembers form values, theme and the country cache. It cannot be distributed
through the stores and has no access to native APIs — that is what route B is for.

---

## B. Capacitor — native iOS and Android

### B.0 Prerequisites

| Target | Requirements |
|--------|--------------|
| Both | Node.js 18+ (20 LTS recommended), npm |
| Android | Android Studio (Hedgehog or newer), JDK 17, Android SDK 34+ |
| iOS | macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`), an Apple Developer account for device builds |

> iOS builds require macOS. There is no supported way to produce a signed `.ipa`
> on Windows. Use a Mac, a hosted Mac runner (GitHub Actions `macos-latest`) or
> a cloud build service such as Ionic Appflow.

### B.1 Create the wrapper project

Create the wrapper **next to** the web app, not inside it, so the web project
stays clean:

```bash
mkdir truck-route-planner-native
cd truck-route-planner-native
npm init -y
npm install @capacitor/core @capacitor/cli
npm install @capacitor/app @capacitor/browser @capacitor/share @capacitor/filesystem
npx cap init "Truck Route Planner" "online.ggabor.routeplanner" --web-dir=www
```

- **App name:** `Truck Route Planner`
- **Bundle / application id:** reverse-DNS, lower case, no hyphens —
  e.g. `online.ggabor.routeplanner`. It is permanent once published.

### B.2 Copy the web app in

```bash
mkdir www
cp -r ../truck_route_planner_web/* www/
rm -rf www/tests www/tools www/.claude
```

Then make `mobile.html` the entry point, because the native shell already knows
it is a phone:

```bash
mv www/index.html www/auto.html
cp www/mobile.html www/index.html
```

Keep `auto.html` if you also serve the same folder on the web.

> Re-run this copy (or script it as an npm task) after every change to the web
> app, then `npx cap sync`.

### B.3 Configure Capacitor

`capacitor.config.json`:

```json
{
  "appId": "online.ggabor.routeplanner",
  "appName": "Truck Route Planner",
  "webDir": "www",
  "backgroundColor": "#0b4ea2",
  "android": {
    "allowMixedContent": false,
    "backgroundColor": "#0b4ea2"
  },
  "ios": {
    "contentInset": "always",
    "backgroundColor": "#0b4ea2"
  },
  "server": {
    "androidScheme": "https",
    "iosScheme": "https"
  }
}
```

`androidScheme: "https"` matters: it makes the WebView origin `https://localhost`,
which keeps `localStorage`, the service worker and CORS behaving exactly as they
do on the web.

### B.4 Add the platforms

```bash
npx cap add android
npx cap add ios        # macOS only
npx cap sync
```

### B.5 Permissions

**Android** — `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

No location permission is needed — the app geocodes typed addresses. Add
`ACCESS_FINE_LOCATION` only if you later add "use my current position".

**iOS** — no entry is required for plain networking. Add
`NSLocationWhenInUseUsageDescription` to `ios/App/App/Info.plist` only if you
add positioning later.

### B.6 Icons and splash screen

```bash
npm install -D @capacitor/assets
mkdir assets
# Export 1024x1024 PNGs from the shipped SVGs first:
#   assets/icon.png            (from www/assets/icon.svg)
#   assets/icon-foreground.png (from www/assets/icon-maskable.svg)
#   assets/icon-background.png (solid #0b4ea2)
#   assets/splash.png          (2732x2732, logo centred on #0b4ea2)
npx capacitor-assets generate
```

The manifest ships SVG icons, which browsers accept but the native tooling does
not — PNG sources are mandatory here.

### B.7 Run and debug

```bash
npx cap run android          # device or emulator
npx cap open android         # or open Android Studio
npx cap open ios             # Xcode: pick a team, then Run
```

Debug the WebView with the normal dev tools:
- Android: `chrome://inspect` in desktop Chrome
- iOS: Safari → Develop → *device name*

### B.8 Release builds

**Android (Play Store):**

```bash
keytool -genkey -v -keystore truck-route-planner.keystore \
        -alias routeplanner -keyalg RSA -keysize 2048 -validity 10000
```

Reference the keystore from `android/app/build.gradle` (`signingConfigs`), then:

```bash
cd android
./gradlew bundleRelease          # android/app/build/outputs/bundle/release/app-release.aab
```

Back up the keystore permanently — losing it means you can never update the
listing.

**iOS (App Store):** in Xcode select *Any iOS Device*, then
*Product → Archive → Distribute App → App Store Connect*.

---

## C. Trusted Web Activity (Android shortcut)

If the app is already hosted over HTTPS, `bubblewrap` produces a Play Store
package that opens the live site full screen, with no wrapper code to maintain:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://your-domain/manifest.webmanifest
bubblewrap build
```

You must host `/.well-known/assetlinks.json` for the URL bar to disappear.
There is no iOS equivalent.

---

## Mobile-specific behaviour already handled

The web app was written with the native wrapper in mind:

| Concern | How it is handled |
|---------|-------------------|
| iOS input zoom | Inputs use 16 px font on mobile, so Safari never zooms on focus |
| Notch / home indicator | `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the header, bottom navigation and views |
| Touch targets | Buttons at 14 px padding, 60 px bottom navigation bar |
| Map on a small screen | Both overlay panels start collapsed below 760 px |
| Hidden-tab map | `invalidateSize()` before drawing and after layout settles, SVG renderer to keep the polyline aligned |
| Orientation change | Map re-measures on `orientationchange` |
| Offline start | Service worker caches the app shell and the datasets |
| Rate limits | Nominatim calls are serialised at 1 req/s with an offline bounding-box pre-filter and a persistent cache |

---

## Known issues and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| White screen after `cap sync` | `webDir` does not contain an `index.html` | Copy `mobile.html` to `www/index.html` (step B.2) |
| `net::ERR_CLEARTEXT_NOT_PERMITTED` | Plain HTTP request on Android 9+ | All services here are HTTPS; if you add one, use HTTPS or set `usesCleartextTraffic` deliberately |
| Leaflet tiles blank in the app | CDN blocked, or offline | Vendor `leaflet.js` / `leaflet.css` into `www/vendor/` and change the `<script>`/`<link>` tags to relative paths |
| Nominatim returns 403 in the app | Missing or generic user agent | Set a descriptive `appendUserAgent` in `capacitor.config.json`, e.g. `"TruckRoutePlanner/2.0 (contact@example.com)"` |
| `localStorage` empty after an update | Origin changed | Keep `androidScheme`/`iosScheme` at `https` and never change `appId` |
| Gradle fails on JDK 21 | Capacitor 6 targets JDK 17 | Point Android Studio at JDK 17 (*Settings → Build Tools → Gradle → Gradle JDK*) |
| CocoaPods error on `cap add ios` | Stale spec repo | `pod repo update`, then `npx cap sync ios` |
| Download buttons do nothing | The WebView blocks blob downloads | Use `@capacitor/filesystem` to write the file and `@capacitor/share` to hand it to the OS |
| Map export pop-up blocked | `window.open` in a WebView | Use `@capacitor/browser` `Browser.open({ url })` instead |

### Native-only refinement (optional)

Downloads and pop-ups behave differently inside a WebView. Guard the two export
paths in `js/ui/app-common.js` and `js/core/map-export.js`:

```js
var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform &&
                  window.Capacitor.isNativePlatform());
```

- `isNative === false` → keep the current blob download / `window.open`
- `isNative === true` → `Filesystem.writeFile()` then `Share.share()`, and
  `Browser.open()` for the standalone map

Everything else runs unchanged.

---

## Release checklist

- [ ] `node tests/run_node.js` is green
- [ ] `node tools/build-embedded-data.js` re-run after any dataset edit
- [ ] `www/` refreshed from the web app, then `npx cap sync`
- [ ] Version bumped in `js/core/config.js`, `package.json`, `build.gradle`
      (`versionCode`/`versionName`) and Xcode (`CFBundleShortVersionString`)
- [ ] Tested on a real phone in both portrait and landscape
- [ ] Tested in airplane mode: the shell opens and shows a clear network error
- [ ] Store listing states clearly that tolls, times and regulations are
      **estimates only**
- [ ] Privacy note included: addresses typed by the user are sent to
      OpenStreetMap Nominatim and the OSRM routing service; nothing else leaves
      the device, and no analytics or tracking is used

---

**created by Gabor Gasko**
