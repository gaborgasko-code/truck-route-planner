/**
 * Truck Route Planner - analytics storage on the local file system.
 *
 * Two layers:
 *   - raw NDJSON, one file per day, pruned after the retention window;
 *   - a rollup JSON with daily totals, kept indefinitely because it holds
 *     nothing but counts.
 *
 * The rules that decide what may be stored, and how visitors are counted, are
 * in ./lib/events.js and shared with the Cloud Function backend. This file is
 * only the persistence for a long-running process that owns a disk.
 *
 * The salt is held in memory and regenerated per process-day, which is correct
 * here precisely because the process is long-lived. A stateless backend cannot
 * do that; see backend/firebase/ for how the same guarantee is met there.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const events = require('./lib/events.js');
const {
  FIELDS, NUMERIC, dayKey, clean, normaliseEvent, visitorHash,
  emptyDay, bump, aggregate, mergeCounters, summarise, top
} = events;

/* ------------------------------------------------------------- file store */

class Store {
  /**
   * @param {{dir?:string, retentionDays?:number}} [options]
   */
  constructor(options) {
    const opts = options || {};
    this.dir = opts.dir || path.join(__dirname, 'data');
    this.retentionDays = opts.retentionDays || 90;
    this.rollupPath = path.join(this.dir, 'rollup.json');
    this.salts = {};
    this.rollup = {};
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadRollup();
  }

  /** A random salt per UTC day, regenerated on restart and never persisted. */
  saltFor(day) {
    if (!this.salts[day]) {
      this.salts[day] = crypto.randomBytes(32).toString('hex');
      /* Yesterday's salt is useless now; dropping it also drops the ability
         to link a visitor across days even in memory. */
      Object.keys(this.salts).forEach((k) => { if (k !== day) delete this.salts[k]; });
    }
    return this.salts[day];
  }

  visitorFor(ip, userAgent, day) {
    return visitorHash(this.saltFor(day || dayKey()), ip, userAgent);
  }

  eventsPath(day) {
    return path.join(this.dir, 'events-' + day + '.ndjson');
  }

  loadRollup() {
    try {
      this.rollup = JSON.parse(fs.readFileSync(this.rollupPath, 'utf8'));
    } catch (e) {
      this.rollup = {};
    }
    return this.rollup;
  }

  saveRollup() {
    const tmp = this.rollupPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.rollup), 'utf8');
    fs.renameSync(tmp, this.rollupPath);
  }

  /**
   * Persist one already-normalised record and update the rollup.
   * @returns {boolean}
   */
  append(record) {
    if (!record) return false;
    const day = dayKey(record.ts);
    fs.appendFileSync(this.eventsPath(day), JSON.stringify(record) + '\n', 'utf8');

    /* Recount this visitor against the day's raw file so restarts stay right. */
    if (!this.dayVisitors) this.dayVisitors = {};
    if (!this.dayVisitors[day]) this.dayVisitors[day] = {};
    const isNewVisitor = record.v && !this.dayVisitors[day][record.v];
    if (record.v) this.dayVisitors[day][record.v] = true;

    if (!this.rollup[day]) this.rollup[day] = emptyDay(day);
    const bucket = this.rollup[day];
    const single = Object.assign({}, record);
    delete single.v;
    aggregate([single], { [day]: bucket });
    if (isNewVisitor) bucket.visitors += 1;

    this.saveRollup();
    return true;
  }

  /** Read back the raw events of one day (used by tests and re-aggregation). */
  readDay(day) {
    try {
      return fs.readFileSync(this.eventsPath(day), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /** Rebuild the rollup from every raw file still on disk. */
  rebuild() {
    const files = fs.readdirSync(this.dir).filter((f) => /^events-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f));
    const records = [];
    files.forEach((f) => { records.push(...this.readDay(f.slice(7, 17))); });
    this.rollup = aggregate(records, {});
    this.saveRollup();
    return this.rollup;
  }

  /** Delete raw files older than the retention window. Rollups are kept. */
  prune(now) {
    const cutoff = new Date(now || Date.now());
    cutoff.setUTCDate(cutoff.getUTCDate() - this.retentionDays);
    const limit = dayKey(cutoff);
    let removed = 0;
    fs.readdirSync(this.dir).forEach((f) => {
      const m = /^events-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(f);
      if (m && m[1] < limit) {
        fs.unlinkSync(path.join(this.dir, f));
        removed += 1;
      }
    });
    return removed;
  }

  stats(from, to) {
    return summarise(this.rollup, from, to);
  }
}

module.exports = {
  FIELDS,
  NUMERIC,
  dayKey,
  clean,
  normaliseEvent,
  visitorHash,
  emptyDay,
  aggregate,
  summarise,
  top,
  Store
};
