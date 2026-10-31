// GPS tracker: exactly ONE watchPosition per tracker, strict validation, honest status reporting.
// It never alters coordinates or accuracy; it only decides whether a reported fix is acceptable.
import { distM, validLatLng } from './geomath.js';

export const GPS_DEFAULTS = {
  timeoutMs: 20000,          // per-position timeout handed to the browser
  maximumAgeMs: 0,           // never accept a cached browser fix
  maxFixAgeMs: 15000,        // reject fixes whose own timestamp is older than this on arrival
  futureToleranceMs: 2000,   // tolerate tiny clock skew; reject fixes from the "future" beyond this
  staleAfterMs: 10000,       // no new accepted fix for this long -> "stale"
  lostAfterMs: 25000,        // ... -> "lost" (one rate-limited watcher recovery is attempted)
  watchdogMs: 2000,
  restartCooldownMs: 30000,  // minimum gap between watcher recoveries
  maxAutoRestarts: 3,        // then wait for the player to press Retry
  jumpMaxSpeedMps: 30,       // a LESS accurate fix implying a faster move than this is a glitch
  maxConsecutiveJumpRejects: 3,
  goodAccM: 10,              // mirrors cfg.game.killMaxAcc
  fairAccM: 30,              // mirrors cfg.game.maxAcc
};

export const isSecure = (w = globalThis) => !!w.isSecureContext || ['localhost', '127.0.0.1'].includes(w.location?.hostname);

export function createGeoTracker({
  geolocation = globalThis.navigator?.geolocation,
  secure = () => isSecure(),
  opts = {}, onFix = () => {}, onStatus = () => {},
  now = Date.now, setIv = setInterval, clearIv = clearInterval,
  doc = globalThis.document,
} = {}) {
  const o = { ...GPS_DEFAULTS, ...opts };
  let watchId = null, iv = null, running = false;
  let last = null, speed = 0, jumpRejects = 0, restarts = 0, lastRestartAt = -Infinity;
  let st = { state: 'idle', acc: null, lastFixAt: null, detail: '', rejected: 0, restarts: 0 };
  let rejected = 0;

  const emit = (patch) => {
    const next = { ...st, ...patch, rejected, restarts };
    const changed = Object.keys(next).some((k) => next[k] !== st[k]);
    st = next;
    if (changed) onStatus(st);
  };
  const tier = (acc) => (acc <= o.goodAccM ? 'good' : acc <= o.fairAccM ? 'fair' : 'poor');

  const accept = (p, source) => {
    const c = p && p.coords, t = Number(p && p.timestamp), n = now();
    const ok = c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Number.isFinite(c.accuracy) && c.accuracy >= 0 &&
      Number.isFinite(t) && validLatLng({ lat: c.latitude, lng: c.longitude });
    if (!ok) { rejected++; emit({ detail: 'invalid-fix' }); return false; }
    const age = n - t;
    if (age > o.maxFixAgeMs) { rejected++; emit({ detail: 'cached-fix-rejected' }); return false; }
    if (age < -o.futureToleranceMs) { rejected++; emit({ state: last ? st.state : 'acquiring', detail: 'clock-skew' }); return false; }
    if (last && t <= last.fixAt) return false; // duplicate / out-of-order: the newest fix always wins
    const fix = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, fixAt: t, spd: 0 };
    if (last) {
      const dt = (t - last.fixAt) / 1000, d = distM(last, fix);
      // Glitch guard: only a WORSE fix that implies an impossible jump is held back, and only briefly.
      if (fix.acc > last.acc && d > last.acc + fix.acc && d / Math.max(dt, 0.5) > o.jumpMaxSpeedMps && jumpRejects < o.maxConsecutiveJumpRejects) {
        jumpRejects++; rejected++; emit({ detail: 'jump-rejected' }); return false;
      }
      jumpRejects = 0;
      let inst = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : (dt >= 1 && d > (last.acc + fix.acc) / 4 ? d / dt : 0);
      speed = 0.5 * speed + 0.5 * inst; // light smoothing of a REAL measured speed
    } else { jumpRejects = 0; speed = Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : 0; }
    fix.spd = speed;
    last = fix;
    emit({ state: tier(fix.acc) === 'poor' ? 'poor' : 'ok', quality: tier(fix.acc), acc: fix.acc, lastFixAt: fix.fixAt, detail: source });
    onFix(fix);
    return true;
  };

  const onErr = (e) => {
    if (!running) return;
    if (e && e.code === 1) { stopWatch(); emit({ state: 'denied', detail: 'permission-denied' }); }
    else if (e && e.code === 2) emit({ state: last ? 'lost' : 'unavailable', detail: 'position-unavailable' });
    else if (e && e.code === 3) emit({ state: last ? st.state : 'acquiring', detail: 'timeout' });
    else emit({ detail: 'unknown-error' });
  };

  const geoOpts = () => ({ enableHighAccuracy: true, maximumAge: o.maximumAgeMs, timeout: o.timeoutMs });
  const startWatch = () => { if (watchId == null) watchId = geolocation.watchPosition((p) => accept(p, 'watch'), onErr, geoOpts()); };
  const stopWatch = () => { if (watchId != null) { geolocation.clearWatch(watchId); watchId = null; } };

  const recover = (why) => {
    const n = now();
    if (st.state === 'denied' || n - lastRestartAt < o.restartCooldownMs || restarts >= o.maxAutoRestarts) return;
    lastRestartAt = n; restarts++; stopWatch(); startWatch(); emit({ detail: 'recovering:' + why });
  };

  const watchdog = () => {
    if (!running || !last || st.state === 'denied') return;
    const age = now() - last.fixAt;
    if (age > o.lostAfterMs) { if (st.state !== 'lost') emit({ state: 'lost', detail: 'no-fix' }); recover('lost'); }
    else if (age > o.staleAfterMs) { if (st.state !== 'stale' && st.state !== 'lost') emit({ state: 'stale', detail: 'no-fresh-fix' }); }
  };
  const onVis = () => { if (doc && doc.visibilityState === 'visible' && last && now() - last.fixAt > o.staleAfterMs) recover('resume'); };

  return {
    start() {
      if (running) return;                               // never a second watcher
      if (!geolocation) return emit({ state: 'unsupported', detail: 'no-geolocation' });
      if (!secure()) return emit({ state: 'insecure', detail: 'needs-https' });
      running = true; restarts = 0; lastRestartAt = -Infinity;
      emit({ state: 'acquiring', detail: 'start' });
      startWatch();
      // One-shot warm-up request alongside the watcher (not a second watcher); goes through the same validation.
      geolocation.getCurrentPosition((p) => accept(p, 'warmup'), () => {}, geoOpts());
      iv = setIv(watchdog, o.watchdogMs);
      doc?.addEventListener?.('visibilitychange', onVis);
    },
    stop() {
      running = false; stopWatch();
      if (iv != null) { clearIv(iv); iv = null; }
      doc?.removeEventListener?.('visibilitychange', onVis);
    },
    // Player-triggered retry (e.g. after changing permission / enabling location services).
    retry() {
      const wasRunning = running; this.stop(); restarts = 0; lastRestartAt = -Infinity;
      this.start(); return wasRunning;
    },
    getLast: () => last,
    getState: () => st,
    _watchCount: () => (watchId == null ? 0 : 1),
  };
}

// Throttled, ordered, de-duplicated Firebase location writer. `write(fix)` must return a Promise.
export function createLocationSync({ write, throttleMs = 3000, now = Date.now, setT = setTimeout, clearT = clearTimeout, onState = () => {} }) {
  let latest = null, lastWriteAt = -Infinity, lastFixAt = -Infinity, timer = null, inflight = false, disposed = false;
  const state = { state: 'idle', lastSyncAt: null };
  const set = (patch) => { Object.assign(state, patch); onState({ ...state }); };
  const flush = async () => {
    timer = null;
    if (disposed || inflight || !latest || latest.fixAt <= lastFixAt) return;
    const fix = latest; inflight = true; lastWriteAt = now();
    try { await write(fix); lastFixAt = Math.max(lastFixAt, fix.fixAt); set({ state: 'ok', lastSyncAt: now() }); }
    catch (e) { set({ state: 'error', error: e && e.code ? String(e.code) : 'write-failed' }); }
    finally {
      inflight = false;
      if (!disposed && latest && latest.fixAt > lastFixAt && !timer) timer = setT(flush, Math.max(0, throttleMs - (now() - lastWriteAt)));
    }
  };
  return {
    push(fix) {
      if (disposed || (latest && fix.fixAt <= latest.fixAt)) return;   // old locations never replace newer ones
      latest = fix;
      if (timer || inflight) return;
      const wait = Math.max(0, throttleMs - (now() - lastWriteAt));
      if (wait === 0) flush(); else timer = setT(flush, wait);          // trailing write: the newest fix is never dropped
    },
    dispose() { disposed = true; if (timer) clearT(timer); timer = null; },
    getState: () => ({ ...state }),
  };
}
