import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeoTracker, createLocationSync } from '../src/services/geoTracker.js';

// Mock Geolocation + controllable clock/interval.
function rig(extra = {}) {
  let t = 1_000_000, watchCb, watchErr, nextId = 1, watchers = 0, cleared = 0, warmCb, ivFn;
  const geolocation = {
    watchPosition: (ok, err) => { watchCb = ok; watchErr = err; watchers++; return nextId++; },
    clearWatch: () => { cleared++; watchers--; },
    getCurrentPosition: (ok) => { warmCb = ok; },
  };
  const statuses = [], fixes = [];
  const tr = createGeoTracker({
    geolocation, secure: () => true, now: () => t,
    setIv: (fn) => { ivFn = fn; return 1; }, clearIv: () => {}, doc: null,
    onFix: (f) => fixes.push(f), onStatus: (s) => statuses.push(s), ...extra,
  });
  const pos = (lat, lng, acc, ts = t, speed = null) => ({ coords: { latitude: lat, longitude: lng, accuracy: acc, speed }, timestamp: ts });
  return { tr, statuses, fixes, pos, adv: (ms) => { t += ms; ivFn && ivFn(); }, fire: (p) => watchCb(p), err: (c) => watchErr({ code: c }),
    warm: (p) => warmCb(p), counts: () => ({ watchers, cleared }), now: () => t };
}

test('starts exactly one watcher and never a duplicate', () => {
  const r = rig(); r.tr.start(); r.tr.start(); r.tr.start();
  assert.equal(r.counts().watchers, 1);
  r.tr.stop(); assert.equal(r.counts().watchers, 0);
  r.tr.stop(); assert.equal(r.counts().cleared, 1, 'stop is idempotent');
});

test('accepts a fresh fix and reports the REAL accuracy', () => {
  const r = rig(); r.tr.start(); r.fire(r.pos(17.4, 78.4, 187));
  assert.equal(r.fixes.length, 1); assert.equal(r.fixes[0].acc, 187);
  assert.equal(r.tr.getState().state, 'poor');
  r.adv(1000); r.fire(r.pos(17.4, 78.4, 6)); assert.equal(r.tr.getState().state, 'ok'); assert.equal(r.tr.getState().quality, 'good');
});

test('rejects cached/old fixes, invalid fixes, future fixes', () => {
  const r = rig(); r.tr.start();
  r.fire(r.pos(17.4, 78.4, 5, r.now() - 60000));      // cached
  r.fire(r.pos(NaN, 78.4, 5));                        // invalid
  r.fire(r.pos(95, 78.4, 5));                         // out of range
  r.fire(r.pos(17.4, 78.4, 5, r.now() + 60000));      // future
  assert.equal(r.fixes.length, 0);
  assert.ok(r.tr.getState().rejected >= 4);
});

test('older or duplicate fixes never replace newer ones', () => {
  const r = rig(); r.tr.start();
  r.fire(r.pos(17.4, 78.4, 5, r.now())); const newer = r.now();
  r.adv(2000); r.fire(r.pos(17.40001, 78.4, 5, r.now()));
  r.fire(r.pos(17.5, 78.5, 5, newer));                // out of order
  r.fire(r.pos(17.5, 78.5, 5, r.now()));              // duplicate timestamp of the accepted one
  assert.equal(r.fixes.length, 2);
  assert.equal(r.tr.getLast().lat, 17.40001);
});

test('warm-up request goes through the same validation and does not duplicate', () => {
  const r = rig(); r.tr.start(); r.warm(r.pos(17.4, 78.4, 8));
  r.fire(r.pos(17.4, 78.4, 8, r.now())); // same timestamp -> duplicate ignored
  assert.equal(r.fixes.length, 1);
});

test('glitch guard: worse-accuracy impossible jump is held back, bounded, then accepted', () => {
  const r = rig(); r.tr.start(); r.fire(r.pos(17.4, 78.4, 5));
  for (let i = 0; i < 3; i++) { r.adv(1000); r.fire(r.pos(17.41, 78.4, 187)); }   // ~1.1 km in 1 s, worse accuracy
  assert.equal(r.fixes.length, 1, 'first 3 glitches are rejected');
  r.adv(1000); r.fire(r.pos(17.41, 78.4, 187));
  assert.equal(r.fixes.length, 2, 'then it is accepted honestly (the player may really only have network location)');
  // A BETTER fix far away is always accepted
  const r2 = rig(); r2.tr.start(); r2.fire(r2.pos(17.4, 78.4, 187)); r2.adv(1000); r2.fire(r2.pos(17.41, 78.4, 4));
  assert.equal(r2.fixes.length, 2);
});

test('permission denied stops the watcher; retry restarts once', () => {
  const r = rig(); r.tr.start(); r.err(1);
  assert.equal(r.tr.getState().state, 'denied'); assert.equal(r.counts().watchers, 0);
  r.tr.retry(); assert.equal(r.counts().watchers, 1);
});

test('unavailable, timeout, unsupported, insecure', () => {
  const r = rig(); r.tr.start(); r.err(2); assert.equal(r.tr.getState().state, 'unavailable');
  r.err(3); assert.notEqual(r.tr.getState().state, 'denied');
  const u = createGeoTracker({ geolocation: null, onStatus: () => {} }); const seen = [];
  const u2 = createGeoTracker({ geolocation: null, onStatus: (s) => seen.push(s.state) }); u2.start(); assert.deepEqual(seen, ['unsupported']);
  const seen2 = []; const i = createGeoTracker({ geolocation: {}, secure: () => false, onStatus: (s) => seen2.push(s.state) }); i.start(); assert.deepEqual(seen2, ['insecure']);
});

test('stale -> lost, single rate-limited recovery (no restart loop)', () => {
  const r = rig(); r.tr.start(); r.fire(r.pos(17.4, 78.4, 5));
  r.adv(11000); assert.equal(r.tr.getState().state, 'stale');
  r.adv(15000); assert.equal(r.tr.getState().state, 'lost');
  const afterFirst = r.counts().cleared; assert.equal(afterFirst, 1, 'one recovery restart');
  r.adv(2000); r.adv(2000); r.adv(2000);
  assert.equal(r.counts().cleared, 1, 'cooldown prevents restart storm');
  assert.equal(r.counts().watchers, 1);
  r.adv(30000); assert.equal(r.counts().cleared, 2, 'next recovery only after cooldown');
  r.fire(r.pos(17.4, 78.4, 5, r.now())); assert.equal(r.tr.getState().state, 'ok', 'recovers when a fix returns');
});

test('speed is measured from real fixes, never invented', () => {
  const r = rig(); r.tr.start(); r.fire(r.pos(17.4, 78.4, 3));
  r.adv(2000); r.fire(r.pos(17.4, 78.40009, 3));      // ~9.6 m in 2 s
  assert.ok(r.fixes[1].spd > 1.5 && r.fixes[1].spd < 6);
  const s = rig(); s.tr.start(); s.fire(s.pos(17.4, 78.4, 3)); s.adv(2000); s.fire(s.pos(17.4, 78.4, 3));
  assert.equal(s.fixes[1].spd, 0);
});

test('location sync: throttled, trailing, ordered, deduplicated', async () => {
  let t = 0; const timers = []; const writes = [];
  const sync = createLocationSync({ write: async (f) => { writes.push(f.fixAt); }, throttleMs: 3000, now: () => t,
    setT: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }, clearT: () => {} });
  const tick = async (ms) => { t += ms; for (const x of timers.splice(0).filter(Boolean)) { if (x.at <= t) await x.fn(); else timers.push(x); } };
  sync.push({ fixAt: 1 }); await tick(0); assert.deepEqual(writes, [1]);
  t = 1000; sync.push({ fixAt: 2 }); t = 2000; sync.push({ fixAt: 3 }); sync.push({ fixAt: 2 }); // older ignored
  assert.deepEqual(writes, [1], 'throttled');
  await tick(1000); assert.deepEqual(writes, [1, 3], 'trailing write carries the NEWEST fix');
  sync.push({ fixAt: 3 }); await tick(5000); assert.deepEqual(writes, [1, 3], 'duplicate never rewritten');
});

test('location sync reports errors and retries', async () => {
  let t = 0, fail = true; const timers = []; const states = [];
  const sync = createLocationSync({ write: async () => { if (fail) throw { code: 'PERMISSION_DENIED' }; }, throttleMs: 3000, now: () => t,
    setT: (fn, ms) => { timers.push({ fn, at: t + ms }); }, clearT: () => {}, onState: (s) => states.push(s.state) });
  sync.push({ fixAt: 1 }); await new Promise((r) => setImmediate(r));
  assert.equal(sync.getState().state, 'error'); fail = false; t = 3000; await timers.shift().fn();
  assert.equal(sync.getState().state, 'ok');
});
