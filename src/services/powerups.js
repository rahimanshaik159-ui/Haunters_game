// Pure power-up game logic. No Firebase, no DOM: everything here is unit-tested in tests/.
import { ABILITIES, TYPES_BY_TEAM, DETECTION, POSITIONAL, POWERUP_DEFAULTS } from './powerupConfig.js';
import { distM, offsetLatLng, randomPointInCircle, validLatLng } from './geomath.js';

export const INV_KEYS = ['s0', 's1', 's2', 's3', 's4', 's5'];
const FRESH_PLAYER_MS = 15000; // same freshness the existing proximity alerts use (o.ts within 15 s)

/* ---------------- slots / pickups ---------------- */
export const spawnRadius = (zoneNow, zoneAtExpiry) => Math.min(zoneNow, zoneAtExpiry);
export const slotIds = (team, cfg = POWERUP_DEFAULTS) => {
  const n = Math.max(0, Math.min(9, Math.floor(team === 'civilian' ? cfg.civilianSlots : cfg.haunterSlots)));
  return Array.from({ length: n }, (_, i) => (team === 'civilian' ? 'c' : 'h') + (i + 1));
};
export const teamOfSlot = (slot) => (String(slot).startsWith('c') ? 'civilian' : String(slot).startsWith('h') ? 'haunter' : null);

export const isActive = (eff, now) => !!eff && Number.isFinite(eff.endsAt) && eff.endsAt > now;

// Why a slot needs (re)spawning, or null if it is healthy. Pickups are spawned inside the zone as it will be when they
// expire, so they can never end up outside the safe zone before expiry (no unverifiable early relocation needed).
export function pickupDue(slot, now) {
  if (!slot || !slot.id) return { reason: 'missing', dueAt: 0 };
  if (slot.state === 'claimed') return now >= (slot.respawnAt ?? 0) ? { reason: 'respawn', dueAt: slot.respawnAt ?? 0 } : null;
  if (slot.state !== 'active') return { reason: 'invalid', dueAt: 0 };
  if (now >= slot.expiresAt) return { reason: 'expired', dueAt: slot.expiresAt };
  return null;
}

export function planSpawn({ slot, pickups = {}, center, zoneR, now, cfg = POWERUP_DEFAULTS, rnd = Math.random }) {
  const team = teamOfSlot(slot);
  const types = TYPES_BY_TEAM[team];
  const others = Object.entries(pickups).filter(([k, p]) => k !== slot && p && p.state === 'active' && validLatLng(p));
  const usedTypes = new Set(others.filter(([, p]) => p.team === team).map(([, p]) => p.type));
  const free = types.filter((t) => !usedTypes.has(t));
  const pool = free.length ? free : types;
  const type = pool[Math.floor(rnd() * pool.length)];
  const spawnR = Math.max(10, zoneR * cfg.spawnZoneFraction);
  let pt = null;
  for (let i = 0; i < 25; i++) {
    const c = randomPointInCircle(center, spawnR, rnd);
    if (others.every(([, p]) => distM(c, p) >= cfg.minPickupSpacing)) { pt = c; break; }
    pt = c; // best effort: keep the last candidate if spacing can't be met (tiny zones)
  }
  return {
    id: `${slot}-${now}-${Math.floor(rnd() * 1e6).toString(36)}`,
    team, type, lat: pt.lat, lng: pt.lng, state: 'active', spawnedAt: now, expiresAt: now + cfg.pickupExpiryMs,
  };
}

// Transaction update-functions (pure). Returning undefined aborts the transaction.
export function spawnTransform(cur, plan) {
  const due = pickupDue(cur, plan.now, { center: plan.center, zoneR: plan.zoneR, cfg: plan.cfg });
  if (!due) return undefined;            // someone else already respawned it -> never duplicate
  if (teamOfSlot(plan.slot) !== plan.pickup.team) return undefined;
  return plan.pickup;
}
export function claimTransform(cur, { uid, role, now, cfg = POWERUP_DEFAULTS, okNow = () => true }) {
  if (!cur || cur.state !== 'active') return undefined;
  if (cur.team !== role) return undefined;          // role gate
  if (now >= cur.expiresAt) return undefined;       // expired
  if (!okNow(cur)) return undefined;                // caller re-checks GPS right at commit time
  return { ...cur, state: 'claimed', claimedBy: uid, claimedAt: now, respawnAt: now + cfg.respawnDelayMs };
}

/* ---------------- inventory ---------------- */
export const inventoryArray = (inv) => INV_KEYS.map((k) => (inv && inv[k] && ABILITIES[inv[k].type] ? { key: k, ...inv[k] } : null));
export const freeInvKey = (inv, cap = POWERUP_DEFAULTS.inventoryCapacity) =>
  INV_KEYS.slice(0, Math.min(cap, 6)).find((k) => !(inv && inv[k])) || null;

// Decide whether a pickup can be collected right now. Pure: caller supplies fresh position data.
export function evaluateCollection({ pickup, pos, nowDevice, nowServer, role, alive, playing, invFull, cfg = POWERUP_DEFAULTS, maxAgeMs = 10000 }) {
  if (!playing) return { ok: false, reason: 'match-not-active' };
  if (!alive) return { ok: false, reason: 'eliminated' };
  if (!pickup || pickup.state !== 'active' || nowServer >= pickup.expiresAt) return { ok: false, reason: 'unavailable' };
  if (pickup.team !== role) return { ok: false, reason: 'wrong-role' };
  if (!pos || !validLatLng(pos) || !Number.isFinite(pos.fixAt)) return { ok: false, reason: 'no-gps' };
  const age = nowDevice - pos.fixAt;
  if (age < 0 || age > maxAgeMs) return { ok: false, reason: 'stale-gps' };
  if (!(pos.acc <= cfg.collectMaxAcc)) return { ok: false, reason: 'poor-accuracy' };
  const d = distM(pos, pickup);
  if (d > cfg.collectRadius) return { ok: false, reason: 'too-far', distance: d };
  if (invFull) return { ok: false, reason: 'inventory-full', distance: d };
  return { ok: true, distance: d };
}

/* ---------------- effects ---------------- */
export const flattenEffects = (effects, now) => {
  const out = [];
  Object.entries(effects || {}).forEach(([uid, byType]) =>
    Object.entries(byType || {}).forEach(([type, e]) => { if (e && ABILITIES[type] && isActive(e, now)) out.push({ ...e, uid, type }); }));
  return out;
};
const circleHit = (e, pos) => e.r && validLatLng(e) && validLatLng(pos) && distM(e, pos) <= e.r;
const hasEffect = (effects, uid, type, now) => isActive(effects?.[uid]?.[type], now);

export const shieldActive = (effects, uid, now) => hasEffect(effects, uid, 'energyShield', now);
export const ghostHidden = (effects, uid, now) => hasEffect(effects, uid, 'ghostClock', now);
export const inSafeBubble = (effects, pos, now) =>
  flattenEffects(effects, now).some((e) => e.type === 'safeBubble' && circleHit(e, pos));
export const inEmp = (effects, pos, now) =>
  flattenEffects(effects, now).some((e) => e.type === 'empBlast' && circleHit(e, pos));
// A civilian is frightened by any active Fear Wave covering them, unless protected by a Safe Bubble.
export const isFeared = (effects, pos, now) =>
  !inSafeBubble(effects, pos, now) && flattenEffects(effects, now).some((e) => e.type === 'fearWave' && circleHit(e, pos));
export const isSonarPinged = (effects, pos, now) =>
  !inSafeBubble(effects, pos, now) && flattenEffects(effects, now).some((e) => e.type === 'sonarPulse' && circleHit(e, pos));

export const sprintBoosted = (effects, uid, role, now) => hasEffect(effects, uid, role === 'haunter' ? 'bloodRush' : 'adrenaline', now);
// Zone-damage grace: only while boosted AND genuinely moving (measured from real GPS) AND not frightened.
export const zoneGrace = ({ effects, uid, role, speed, feared, now, cfg = POWERUP_DEFAULTS }) =>
  sprintBoosted(effects, uid, role, now) && !feared && Number.isFinite(speed) && speed >= cfg.sprintMinSpeed;
export const alertRadius = ({ effects, uid, role, now, base, cfg = POWERUP_DEFAULTS }) =>
  sprintBoosted(effects, uid, role, now) ? Math.max(base, cfg.sprintProximityRadius) : base;

export const decoyPosition = (e, now) => {
  const t = Math.max(0, Math.min(now, e.endsAt) - e.at) / 1000;
  return offsetLatLng(e, e.bearing, (e.spd || 0) * t);
};

const freshPlayer = (p, now) => !!p && validLatLng(p) && Number.isFinite(p.ts) && now - p.ts >= -FRESH_PLAYER_MS && now - p.ts < FRESH_PLAYER_MS;

// Civilians a Haunter's detection ability may reveal, after Ghost Clock / Safe Bubble / EMP are applied.
export function revealedCivilians({ type, viewerUid, viewerPos, origin, radius, players, effects, now, nowServer = now }) {
  if (!validLatLng(viewerPos)) return [];
  if (inEmp(effects, viewerPos, nowServer)) return [];           // jammed
  const center = origin || viewerPos;
  return Object.entries(players || {}).filter(([uid, p]) =>
    uid !== viewerUid && p && p.role === 'civilian' && p.alive && freshPlayer(p, now) &&
    distM(center, p) <= radius &&
    !ghostHidden(effects, uid, nowServer) &&
    !(type !== 'haunterVision' && inSafeBubble(effects, p, nowServer)));
}

/* ---------------- activation ---------------- */
export function canActivate({ type, item, role, alive, playing, nowServer, effects, cooldowns, uid, pos, nowDevice, feared, jammed, maxAcc = 30, maxAgeMs = 10000 }) {
  const a = ABILITIES[type];
  if (!a || !item || item.type !== type) return { ok: false, reason: 'not-in-inventory' };
  if (!playing) return { ok: false, reason: 'match-not-active' };
  if (!alive) return { ok: false, reason: 'eliminated' };
  if (a.team !== role) return { ok: false, reason: 'wrong-role' };
  if (hasEffect(effects, uid, type, nowServer)) return { ok: false, reason: 'already-active' };
  const ready = cooldowns?.[uid]?.[type];
  if (Number.isFinite(ready) && nowServer < ready) return { ok: false, reason: 'cooldown', remainingMs: ready - nowServer };
  if (role === 'civilian' && feared) return { ok: false, reason: 'feared' };
  if (jammed && DETECTION.includes(type)) return { ok: false, reason: 'jammed' };
  if (POSITIONAL.includes(type)) {
    if (!pos || !validLatLng(pos) || !Number.isFinite(pos.fixAt)) return { ok: false, reason: 'no-gps' };
    const age = nowDevice - pos.fixAt;
    if (age < 0 || age > maxAgeMs) return { ok: false, reason: 'stale-gps' };
    if (!(pos.acc <= maxAcc)) return { ok: false, reason: 'poor-accuracy' };
  }
  return { ok: true };
}

export function buildEffect(type, { now, pos, rnd = Math.random, cfg = POWERUP_DEFAULTS }) {
  const a = ABILITIES[type];
  const dur = type === 'energyShield' ? cfg.shieldMaxMs : a.durationMs;
  const e = { type, team: a.team, at: now, endsAt: now + dur };
  if (a.kind === 'area' || (a.kind === 'self' && a.radius)) { e.r = a.radius; }
  if (POSITIONAL.includes(type) && validLatLng(pos)) {
    if (a.kind === 'decoy') {
      const bearing = rnd() * 360;
      const start = offsetLatLng(pos, bearing, cfg.decoyStartOffset);
      Object.assign(e, { lat: start.lat, lng: start.lng, bearing, spd: cfg.decoyDriftMps });
    } else if (a.kind === 'area') {
      Object.assign(e, { lat: pos.lat, lng: pos.lng });
    }
  }
  return e;
}

/* ---------------- Blood Trail RAM buffer (never persisted) ---------------- */
export function recordTrails(buf, players, now, cfg = POWERUP_DEFAULTS) {
  const live = new Set();
  Object.entries(players || {}).forEach(([uid, p]) => {
    if (!p || p.role !== 'civilian' || !p.alive || !freshPlayer(p, now)) return;
    live.add(uid);
    const arr = buf.get(uid) || [];
    const last = arr[arr.length - 1];
    if (!last || last.fixAt !== p.fixAt) arr.push({ lat: p.lat, lng: p.lng, fixAt: p.fixAt, t: now });
    const cut = now - cfg.trailWindowMs;
    while (arr.length && (arr[0].t < cut || arr.length > cfg.trailMaxPoints)) arr.shift();
    buf.set(uid, arr);
  });
  [...buf.keys()].forEach((k) => { if (!live.has(k)) buf.delete(k); });
}

// Who sees an area effect's ring on their map. Own rings always; Haunters see Haunter areas; Civilians see Civilian areas;
// the opposing team only sees a ring when they are inside (or right next to) it, so rings never act as a free tracker.
export function areaVisibleTo({ effect, uid, role, myPos, now }) {
  if (!effect || !Number.isFinite(effect.lat) || !isActive(effect, now)) return false;
  if (effect.uid === uid) return true;
  if (effect.team === role) return true;
  return !!myPos && validLatLng(myPos) && distM(effect, myPos) <= (effect.r || 0) + (effect.type === 'empBlast' ? 10 : 0);
}
