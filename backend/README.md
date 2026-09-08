# Traffic measurement

**created by Gabor Gasko**

An optional, self-hosted collector that answers "how many people use this?"
without tracking anybody. It is **off by default**: leave `ANALYTICS_ENDPOINT`
empty in `js/core/config.js` and the app collects nothing, the analytics
category never appears in the consent dialog, and no code path sends a request.

There are two backends. They store data differently and share everything that
matters:

| | `server.js` | `firebase/` |
|---|---|---|
| Runs on | anything with Node and a disk | Firebase Cloud Functions |
| Stores in | NDJSON files + `rollup.json` | Firestore |
| Retention | hourly `prune()` | native TTL policy |
| Good for | a VPS, a container, local development | no server to run or patch |

Both call the same `lib/events.js`, which holds the field allowlist, the
visitor hashing and the aggregation. That file is the privacy design; the rest
is plumbing.

---

## What makes it privacy-preserving

- **No cookie, no localStorage entry, no identifier of any kind** is created on
  the device. There is nothing to opt out of storing.
- **The IP address is never written to disk.** It exists only as an argument to
  `visitorHash`, whose output is truncated to 16 hex characters and salted with
  a value that rotates daily. The same person tomorrow is a different value, so
  nobody can be followed across days — the dashboard says so rather than
  implying otherwise.
- **A field allowlist on the server** is the second gate. Only the declared
  events and fields are stored, so a hand-crafted POST cannot add a field, and
  a bug in the client cannot start leaking addresses.
- **Values are banded.** A 1 783.4 km route is recorded as `1000-2000km` and a
  screen as `lg`, not `1440`. A single run cannot be picked out of the totals.
- **Raw events expire** after the retention window. Only the aggregated daily
  counts are kept.

The test suite asserts these rather than trusting them: an address handed to
`buildPayload` on purpose never reaches the payload, and an IP or an unknown
field posted straight at the collector never reaches storage.

---

## Option A — Firebase Cloud Functions

Nothing to run or patch, and at this traffic the bill is zero. Cloud Functions
require the **Blaze** plan, so a card has to be on the billing account even
though the free allowance (2M invocations/month, 20k Firestore writes/day)
covers far more than this app will use.

Two writes per page view, so roughly **10,000 views a day before anything is
billable**. Setting `ANALYTICS_STORE_RAW` to `false` halves that, at the cost
of being unable to rebuild the rollup later.

### One-time setup

```bash
npm install -g firebase-tools
firebase login
```

Create the project at <https://console.firebase.google.com>, then:

1. **Enable Firestore** in *Native* mode. Choose the location carefully — it is
   permanent. `eur3` (Europe multi-region) or `europe-southwest1` (Madrid) both
   keep the data in the EU.
2. **Upgrade to Blaze** (Settings → Usage and billing). Set a budget alert of
   a euro or two while you are there; the free allowance should mean you never
   see a bill, and the alert tells you if that stops being true.

Then point the local config at the project and install:

```bash
cd backend/firebase
cp .firebaserc.example .firebaserc     # then put your project id in it
cd functions && npm install
```

### Deploy

```bash
cd backend/firebase

# The dashboard token. Generate a long one and keep a copy:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase functions:secrets:set ANALYTICS_TOKEN

firebase deploy --only firestore:rules,functions:analytics
```

`npm run deploy` inside `functions/` does the same and refreshes the generated
copies first. **Always deploy the rules**, not just the function: they deny all
client access, which is what stops a leaked web API key from reading the
visitor hashes and the day's salt together.

The deploy prints the function URL, of the form:

```
https://europe-southwest1-<project-id>.cloudfunctions.net/analytics
```

### Finish the retention policy

The function stamps `expiresAt` on every raw event, salt and visitor marker,
but **Firestore only deletes them once a TTL policy exists**. This is a
one-time step per collection, in the console under *Firestore → TTL*, or:

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=events --enable-ttl --project=<project-id>
gcloud firestore fields ttls update expiresAt \
  --collection-group=salts --enable-ttl --project=<project-id>
gcloud firestore fields ttls update expiresAt \
  --collection-group=visitors --enable-ttl --project=<project-id>
```

Without this the data still works but nothing is ever deleted, and the privacy
policy's retention promise would be untrue.

### Point the app at it

In `js/core/config.js`:

```js
ANALYTICS_ENDPOINT: 'https://europe-southwest1-<project-id>.cloudfunctions.net/analytics/api/collect',
```

Then redeploy the site. The consent dialog will now offer the analytics
category, still off until someone accepts it.

### The dashboard

Open the function URL in a browser and paste the token. It is held in
`sessionStorage` and never put in the URL.

---

## Option B — your own server

```bash
ANALYTICS_TOKEN=choose-a-long-secret \
ANALYTICS_ORIGINS=https://planificador.ggabor.online \
ANALYTICS_DIR=/var/lib/trp-analytics \
node backend/server.js
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | listening port |
| `HOST` | `0.0.0.0` | bind address |
| `ANALYTICS_TOKEN` | — | required to read `/api/stats` and the dashboard |
| `ANALYTICS_ORIGINS` | localhost | comma-separated CORS allowlist |
| `ANALYTICS_DIR` | `backend/data` | where the daily files and rollup live |
| `ANALYTICS_RETENTION_DAYS` | `90` | age at which raw events are deleted |
| `TRUST_PROXY` | `0` | set to `1` only behind a proxy you control |

Put it behind a reverse proxy that terminates TLS — the browser will refuse a
plain-HTTP request from an HTTPS page. Set `TRUST_PROXY=1` **only** when that
proxy is yours and sets `X-Forwarded-For`; trusting the header on a directly
exposed server would let anyone forge the value the visitor hash is built from.

`ANALYTICS_DIR` must be on persistent storage. On a host with an ephemeral
filesystem every restart would silently reset the history.

---

## Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/collect` | POST | receives an event, answers `204`, never echoes anything |
| `/api/stats` | GET | aggregated JSON; `?token=` or a Bearer header, optional `from`/`to` |
| `/api/health` | GET | liveness |
| `/` | GET | the dashboard |

`/api/collect` answers `204` whatever happens, including for a payload it
rejects. A collector that reported which events were accepted would be an
oracle for probing the allowlist.

---

## Working on it

```bash
node tests/run_node.js          # includes both backends, no network, no emulator
node tools/build-firebase.js    # refresh the copies under firebase/functions/
```

`firebase/functions/events.js` and `dashboard.html` are **generated copies** of
`backend/lib/events.js` and `backend/dashboard.html`. `firebase deploy` uploads
only the functions directory, so anything it requires has to live inside it.
Editing a copy is pointless — the next build overwrites it — and a test fails
if a copy is stale, because deploying stale rules is how the allowlist would
quietly fall out of step with the app.

The Firestore tests run against a fake, so there is no emulator and no
credentials involved. That is possible because `FirestoreStore` takes `db` and
`FieldValue` as constructor arguments instead of importing the Admin SDK.
