-- Truck Route Planner - analytics schema for Cloudflare D1.
--
-- Apply with:
--   wrangler d1 execute trp-analytics --remote --file=schema.sql
--
-- Every table is safe to re-run: this file is the whole schema, not a
-- migration, and creating it twice changes nothing.
--
-- Note what is absent. There is no column for an IP address or a user agent,
-- and no place to put one. That is the point: the allowlist in events.js
-- decides what may be stored, and the schema makes anything else impossible to
-- write even by mistake.
--
-- created by Gabor Gasko

-- One random salt per UTC day, shared by every isolate so a visitor hashes the
-- same way wherever the request lands. Deleted by the scheduled prune, which
-- is what stops yesterday's hashes being matchable at all.
CREATE TABLE IF NOT EXISTS salts (
  day        TEXT PRIMARY KEY,
  salt       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- One row per visitor per day. The primary key is the de-duplication: an
-- INSERT OR IGNORE that changes no rows means this person was already counted.
CREATE TABLE IF NOT EXISTS visitors (
  day        TEXT NOT NULL,
  visitor    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (day, visitor)
);

-- The raw records, kept only so a rollup can be rebuilt if the counting logic
-- changes. Optional: set ANALYTICS_STORE_RAW=false and only the counts remain.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  day        TEXT NOT NULL,
  event      TEXT NOT NULL,
  path       TEXT,
  lang       TEXT,
  view       TEXT,
  screen     TEXT,
  ref        TEXT,
  distance   TEXT,
  speed      TEXT,
  detail     TEXT,
  error      TEXT,
  countries  INTEGER,
  drivers    INTEGER,
  visitor    TEXT,
  site       TEXT,
  expires_at INTEGER NOT NULL
);

-- Daily totals: views, routes, failures, visitors.
CREATE TABLE IF NOT EXISTS counters (
  day    TEXT NOT NULL,
  metric TEXT NOT NULL,
  value  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric)
);

-- Everything the dashboard groups by: pages, langs, builds, screens, refs,
-- distances, countries, drivers, errors.
CREATE TABLE IF NOT EXISTS breakdowns (
  day       TEXT NOT NULL,
  dimension TEXT NOT NULL,
  key       TEXT NOT NULL,
  value     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dimension, key)
);

-- The prune deletes by expiry, and the dashboard reads by day.
CREATE INDEX IF NOT EXISTS idx_events_expires  ON events (expires_at);
CREATE INDEX IF NOT EXISTS idx_events_day      ON events (day);
CREATE INDEX IF NOT EXISTS idx_visitors_expires ON visitors (expires_at);
CREATE INDEX IF NOT EXISTS idx_salts_expires   ON salts (expires_at);
