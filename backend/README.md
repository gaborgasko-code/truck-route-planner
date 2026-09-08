# Traffic measurement

**created by Gabor Gasko**

An optional, self-hosted collector that answers "how many people use this?"
without tracking anybody. It is **off by default**: leave `ANALYTICS_ENDPOINT`
empty in `js/core/config.js` and the app collects nothing, the analytics
category never appears in the consent dialog, and no code path sends a request.

There are three backends. They store data differently and share everything that
matters:

| | `server.js` | `firebase/` | `cloudflare/` |
|---|---|---|---|
| Runs on | anything with Node and a disk | Cloud Functions | Workers |
| Stores in | NDJSON + `rollup.json` | Firestore | D1 (SQLite) |
| Retention | hourly `prune()` | native TTL policy | cron-triggered prune |
| Card needed | depends on the host | **yes** (Blaze) | **no** |
| Good for | a VPS, a container, local dev | no server to patch | free with no card |

All three call the same `lib/events.js`, which holds the field allowlist, the
visitor hashing and the aggregation. That file is the privacy design; the rest
is plumbing. Each backend supplies only persistence, and each is checked
against `aggregate()` by the tests, because three separate ways of counting
the same events is three chances for them to drift into disagreeing.

Pick one. Running two at once would split the counts between them.

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

## Option A — Firebase Cloud Functions (currently deployed)

Nothing to run or patch, and at this traffic the bill is zero. Cloud Functions
require the **Blaze** plan, so a card has to be on the billing account even
though the free allowance (2M invocations/month, 20k Firestore writes/day)
covers far more than this app will use.

Two writes per page view, so roughly **10,000 views a day before anything is
billable**. Setting `ANALYTICS_STORE_RAW` to `false` halves that, at the cost
of being unable to rebuild the rollup later.

### What stops it costing money

Blaze bills past the free quota instead of blocking, and a budget alert in the
console is an alert, **not a cap** — Google does not stop billing when you hit
one. So the guarantee has to come from the code:

| Defence | What it does |
|---|---|
| `ANALYTICS_DAILY_CAP` (8,000) | Past this many events in a UTC day the collector answers normally and **stops writing**. This is the hard stop; nothing else guarantees a zero bill. |
| Per-visitor rate limit (120 / 5 min) | Stops one client flooding. Held in instance memory, so the real ceiling is this times the instance count. |
| `maxInstances: 5` | Caps total throughput, which is what makes the in-memory limit meaningful rather than unbounded. |

The cap is deliberately blunt: past it you lose counts for the rest of the day.
That is the intended trade — an undercount is recoverable, a surprise invoice
is not. Raise it with `ANALYTICS_DAILY_CAP`, or set it to `0` to remove the
stop entirely, which is only sensible once you are content to be billed.

The running total is read from the rollup at most once a minute per instance
rather than on every request, so the check itself costs almost nothing. It
therefore lags slightly, and the cap can be overshot by about a minute of
traffic. It is a circuit breaker, not an accountant.

### One-time setup

```bash
npm install -g firebase-tools
firebase login
```

Create the project at <https://console.firebase.google.com>, then:

1. **Enable Firestore** in *Native* mode. Choose the location carefully — it is
   permanent. `eur3` (Europe multi-region) or `europe-southwest1` (Madrid) both
   keep the data in the EU.
2. **Upgrade to Blaze** (Settings → Usage and billing). A budget alert is worth
   setting, but note it only notifies - it does not stop billing. The actual
   guarantee is `ANALYTICS_DAILY_CAP` above.

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

### Retention

The function stamps `expiresAt` on every raw event, salt and visitor marker,
and Firestore only deletes them where a **TTL policy** exists. Those policies
are declared in `firestore.indexes.json` and applied by the deploy above, so
there is nothing manual to remember:

```json
{ "collectionGroup": "events", "fieldPath": "expiresAt", "ttl": true }
```

That matters beyond convenience. If retention depended on someone running a
`gcloud` command after every fresh deploy, then a redeploy to a new project
would quietly leave data forever while the privacy policy still promised 90
days. Declaring it means the promise is enforced by the same command that ships
the code.

Check what is actually live with:

```bash
firebase firestore:indexes
```

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

## Option B — Cloudflare Workers + D1

Genuinely free with no card: the Workers free plan allows 100,000 requests a
day, and D1's free tier is far beyond what this app will use. No cold-start
penalty worth worrying about, and nothing to patch.

The trade against Firebase is that D1 has **no TTL feature**, so retention is a
scheduled job rather than something the platform does. That job is declared in
`wrangler.toml` as a cron trigger, so it ships with the code — if it were a
manual step, forgetting it would mean keeping data forever while the privacy
policy still promised ninety days.

### Setup

```bash
npm install -g wrangler        # or use npx, as the package.json scripts do
wrangler login                 # opens a browser; no card is asked for
```

```bash
cd backend/cloudflare
npm install

wrangler d1 create trp-analytics
# paste the printed database_id into wrangler.toml

wrangler d1 execute trp-analytics --remote --file=schema.sql
wrangler secret put ANALYTICS_TOKEN      # generate one, see below
wrangler deploy
```

Generate the token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The deploy prints the worker URL, of the form
`https://trp-analytics.<your-subdomain>.workers.dev`. Point the app at it by
setting `ANALYTICS_ENDPOINT` in `js/core/config.js` to that URL plus
`/api/collect`, then redeploy the site.

### Settings

They live in `[vars]` in `wrangler.toml`: `ANALYTICS_ORIGINS`,
`ANALYTICS_SITE`, `ANALYTICS_RETENTION_DAYS`, `ANALYTICS_STORE_RAW` and
`ANALYTICS_DAILY_CAP`. Only `ANALYTICS_TOKEN` is a secret, and it is set with
`wrangler secret put` rather than committed.

The same defences apply as on Firebase: an 8,000-event daily cap that stops
writing rather than spending, and a 120-per-5-minute per-visitor rate limit
held in isolate memory.

### Working on it locally

```bash
cd backend/cloudflare
echo "ANALYTICS_TOKEN=local-dev-token" > .dev.vars    # gitignored
npx wrangler dev --local
npx wrangler d1 execute trp-analytics --local --file=schema.sql
```

That runs the real Workers runtime and a real SQLite database with **no
Cloudflare account at all**, which is the quickest way to check a change. Fire
the retention job by hand with:

```bash
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"
```

---

## Option C — your own server

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

The Cloud Function takes the same settings as deploy-time parameters, plus
`ANALYTICS_DAILY_CAP` (default `8000`) and `ANALYTICS_STORE_RAW` (default
`true`). It has no `TRUST_PROXY`: it is always behind Google's load balancer,
so the first entry of `X-Forwarded-For` is always the caller.

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
node tools/build-backends.js    # refresh the copies under each backend
```

`firebase/functions/events.js` and `dashboard.html` are **generated copies** of
`backend/lib/events.js` and `backend/dashboard.html`. `firebase deploy` uploads
only the functions directory, so anything it requires has to live inside it.
Editing a copy is pointless — the next build overwrites it — and a test fails
if a copy is stale, because deploying stale rules is how the allowlist would
quietly fall out of step with the app.

The Firestore and D1 tests run against fakes, so there is no emulator, no
wrangler and no credentials involved. That is possible because `FirestoreStore` takes `db` and
`FieldValue` as constructor arguments instead of importing the Admin SDK.
