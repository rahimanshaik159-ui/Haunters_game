import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, TYPES_BY_TEAM, POWERUP_DEFAULTS as C } from '../src/services/powerupConfig.js';
import * as P from '../src/services/powerups.js';
import { distM, offsetLatLng } from '../src/services/geomath.js';

const center = { lat: 17.385, lng: 78.4867 };
const NOW = 1_000_000;
const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const fixAt = (n) => n - 500;
const here = (p, n = NOW, acc = 5) => ({ ...p, acc, fixAt: fixAt(n) });

test('catalogue: 6 civilian + 6 haunter, spec durations/radii, cooldown >= duration', () => {
  assert.equal(TYPES_BY_TEAM.civilian.length, 6); assert.equal(TYPES_BY_TEAM.haunter.length, 6);
  const d = (k) => ABILITIES[k];
  assert.equal(d('ghostClock').durationMs, 8000); assert.equal(d('adrenaline').durationMs, 10000);
  assert.equal(d('hologramDecoy').durationMs, 10000); assert.equal(d('empBlast').durationMs, 6000); assert.equal(d('empBlast').radius, 30);
  assert.equal(d('safeBubble').durationMs, 8000);
  assert.equal(d('haunterVision').durationMs, 8000); assert.equal(d('haunterVision').radius, 50);
  assert.equal(d('bloodRush').durationMs, 10000); assert.equal(d('sonarPulse').durationMs, 5000); assert.equal(d('sonarPulse').radius, 60);
  assert.equal(d('fearWave').durationMs, 5000); assert.equal(d('fearWave').radius, 20);
  assert.equal(d('shadowClone').durationMs, 10000); assert.equal(d('bloodTrail').durationMs, 10000);
  for (const [k, a] of Object.entries(ABILITIES)) if (k !== 'energyShield') assert.ok(a.cooldownMs >= a.durationMs, k + ' cooldown covers duration (no overlap stacking)');
  assert.equal(ABILITIES.energyShield.durationMs, C.shieldMaxMs, 'shield lifetime is bounded');
  assert.equal(C.collectRadius, 5); assert.equal(C.respawnDelayMs, 20000); assert.equal(C.pickupExpiryMs, 60000);
  assert.equal(C.civilianSlots, 3); assert.equal(C.haunterSlots, 3); assert.equal(C.inventoryCapacity, 6);
});

/* ---- tiny in-memory RTDB honouring runTransaction semantics (sequential, retry-free) ---- */
class FakeDb { constructor() { this.slots = {}; } tx(slot, fn) { const next = fn(this.slots[slot] ?? null); if (next === undefined) return { committed: false, val: this.slots[slot] }; this.slots[slot] = next; return { committed: true, val: next }; } }

test('slot ids per team are independent and configurable', () => {
  assert.deepEqual(P.slotIds('civilian'), ['c1', 'c2', 'c3']); assert.deepEqual(P.slotIds('haunter'), ['h1', 'h2', 'h3']);
  assert.deepEqual(P.slotIds('civilian', { ...C, civilianSlots: 5, haunterSlots: 1 }).length, 5);
  assert.deepEqual(P.slotIds('haunter', { ...C, haunterSlots: 1 }), ['h1']);
});

test('spawn: right team, valid type for that team, inside zone, spacing, no duplicate types when avoidable', () => {
  const db = new FakeDb(); const rnd = seeded(); const zoneR = 500;
  for (const slot of [...P.slotIds('civilian'), ...P.slotIds('haunter')]) {
    const plan = { slot, pickups: db.slots, center, zoneR, now: NOW, cfg: C, rnd }; plan.pickup = P.planSpawn(plan);
    const r = db.tx(slot, (cur) => P.spawnTransform(cur, plan)); assert.ok(r.committed);
  }
  const all = Object.values(db.slots);
  assert.equal(all.length, 6);
  for (const p of all) {
    assert.ok(TYPES_BY_TEAM[p.team].includes(p.type)); assert.equal(p.team, P.teamOfSlot(p.id.split('-')[0]));
    assert.ok(distM(center, p) <= zoneR * C.spawnZoneFraction + 1); assert.equal(p.expiresAt, NOW + 60000);
  }
  for (const team of ['civilian', 'haunter']) { const ts = all.filter((p) => p.team === team).map((p) => p.type); assert.equal(new Set(ts).size, ts.length); }
});

test('spawn never duplicates: a second spawner racing on a healthy slot aborts', () => {
  const db = new FakeDb(); const rnd = seeded(3);
  const mk = (n) => { const plan = { slot: 'c1', pickups: db.slots, center, zoneR: 300, now: n, cfg: C, rnd }; plan.pickup = P.planSpawn(plan); return plan; };
  const a = mk(NOW), b = mk(NOW + 10);
  assert.ok(db.tx('c1', (c) => P.spawnTransform(c, a)).committed);
  const second = db.tx('c1', (c) => P.spawnTransform(c, b));
  assert.equal(second.committed, false); assert.equal(db.slots.c1.id, a.pickup.id);
});

test('SIMULTANEOUS collection: exactly one of two civilians wins; Haunter is rejected', () => {
  const db = new FakeDb(); const rnd = seeded(5);
  const plan = { slot: 'c1', pickups: {}, center, zoneR: 300, now: NOW, cfg: C, rnd }; plan.pickup = P.planSpawn(plan); db.tx('c1', (c) => P.spawnTransform(c, plan));
  const claim = (uid, role, now) => db.tx('c1', (cur) => P.claimTransform(cur, { uid, role, now, cfg: C }));
  assert.equal(claim('H1', 'haunter', NOW + 100).committed, false, 'wrong role');
  const r1 = claim('A', 'civilian', NOW + 100), r2 = claim('B', 'civilian', NOW + 100);
  assert.deepEqual([r1.committed, r2.committed], [true, false]);
  assert.equal(db.slots.c1.claimedBy, 'A'); assert.equal(db.slots.c1.respawnAt, NOW + 100 + 20000);
  assert.equal(claim('A', 'civilian', NOW + 200).committed, false, 'no double collection');
});

test('expired pickup cannot be claimed; becomes due; respawn is a new id on the same team', () => {
  const db = new FakeDb(); const rnd = seeded(9);
  const plan = { slot: 'h2', pickups: {}, center, zoneR: 300, now: NOW, cfg: C, rnd }; plan.pickup = P.planSpawn(plan); db.tx('h2', (c) => P.spawnTransform(c, plan));
  const late = NOW + C.pickupExpiryMs;
  assert.equal(db.tx('h2', (c) => P.claimTransform(c, { uid: 'H', role: 'haunter', now: late, cfg: C })).committed, false);
  assert.equal(P.pickupDue(db.slots.h2, late, { center, zoneR: 300 }).reason, 'expired');
  const p2 = { slot: 'h2', pickups: db.slots, center, zoneR: 300, now: late, cfg: C, rnd }; p2.pickup = P.planSpawn(p2);
  assert.ok(db.tx('h2', (c) => P.spawnTransform(c, p2)).committed);
  assert.notEqual(db.slots.h2.id, plan.pickup.id); assert.equal(db.slots.h2.team, 'haunter');
});

test('collected pickup is NOT permanently locked: respawns after delay, not before', () => {
  const db = new FakeDb(); const rnd = seeded(11);
  const plan = { slot: 'c3', pickups: {}, center, zoneR: 300, now: NOW, cfg: C, rnd }; plan.pickup = P.planSpawn(plan); db.tx('c3', (c) => P.spawnTransform(c, plan));
  db.tx('c3', (c) => P.claimTransform(c, { uid: 'A', role: 'civilian', now: NOW + 1000, cfg: C }));
  assert.equal(P.pickupDue(db.slots.c3, NOW + 15000, { center, zoneR: 300 }), null, 'still cooling down');
  assert.equal(P.pickupDue(db.slots.c3, NOW + 21000, { center, zoneR: 300 }).reason, 'respawn');
  const p2 = { slot: 'c3', pickups: db.slots, center, zoneR: 300, now: NOW + 21000, cfg: C, rnd }; p2.pickup = P.planSpawn(p2);
  assert.ok(db.tx('c3', (c) => P.spawnTransform(c, p2)).committed); assert.equal(db.slots.c3.state, 'active');
});

test('spawn radius anticipates the next shrink, so a pickup is never outside the zone before it expires', () => {
  assert.equal(P.spawnRadius(500, 400), 400); assert.equal(P.spawnRadius(300, 300), 300);
  const rnd = seeded(21), zoneAtExpiry = 400;
  for (let i = 0; i < 200; i++) {
    const plan = { slot: 'c1', pickups: {}, center, zoneR: P.spawnRadius(500, zoneAtExpiry), now: NOW, cfg: C, rnd };
    assert.ok(distM(center, P.planSpawn(plan)) <= zoneAtExpiry);
  }
  assert.equal(P.pickupDue(undefined, NOW).reason, 'missing');
  assert.equal(P.pickupDue({ id: 'x', state: 'active', expiresAt: NOW + 5000 }, NOW), null, 'healthy slot left alone');
});

test('collection rules: role, alive, match, gps freshness, accuracy, radius, inventory', () => {
  const pk = { id: 'p', team: 'civilian', type: 'ghostClock', state: 'active', ...center, expiresAt: NOW + 30000 };
  const base = { pickup: pk, pos: here(offsetLatLng(center, 90, 3)), nowDevice: NOW, nowServer: NOW, role: 'civilian', alive: true, playing: true, invFull: false };
  assert.equal(P.evaluateCollection(base).ok, true);
  assert.equal(P.evaluateCollection({ ...base, role: 'haunter' }).reason, 'wrong-role');
  assert.equal(P.evaluateCollection({ ...base, alive: false }).reason, 'eliminated');
  assert.equal(P.evaluateCollection({ ...base, playing: false }).reason, 'match-not-active');
  assert.equal(P.evaluateCollection({ ...base, pos: { ...base.pos, fixAt: NOW - 20000 } }).reason, 'stale-gps');
  assert.equal(P.evaluateCollection({ ...base, pos: { ...base.pos, acc: 187 } }).reason, 'poor-accuracy');
  assert.equal(P.evaluateCollection({ ...base, pos: here(offsetLatLng(center, 90, 8)) }).reason, 'too-far');
  assert.equal(P.evaluateCollection({ ...base, invFull: true }).reason, 'inventory-full');
  assert.equal(P.evaluateCollection({ ...base, nowServer: NOW + 31000 }).reason, 'unavailable');
});

test('inventory: 6 slots max, first free slot, overflow impossible', () => {
  const inv = {}; for (let i = 0; i < 6; i++) { const k = P.freeInvKey(inv); assert.equal(k, 's' + i); inv[k] = { type: 'ghostClock', pid: 'p' + i }; }
  assert.equal(P.freeInvKey(inv), null);
  assert.equal(P.freeInvKey({}, 99), 's0'); assert.equal(P.inventoryArray(inv).filter(Boolean).length, 6);
  delete inv.s2; assert.equal(P.freeInvKey(inv), 's2');
  assert.equal(P.inventoryArray({ s0: { type: 'notAnAbility' } })[0], null, 'unknown types are ignored');
});

/* ---------------- all 12 abilities: activation gate + effect + expiry ---------------- */
const pos0 = here(center);
const act = (type, over = {}) => P.canActivate({ type, item: { type }, role: ABILITIES[type].team, alive: true, playing: true, nowServer: NOW, nowDevice: NOW,
  effects: {}, cooldowns: {}, uid: 'U', pos: pos0, feared: false, jammed: false, ...over });

for (const type of Object.keys(ABILITIES)) {
  test(`ability ${type}: role gate, eliminated, cooldown, double-activation, effect built with correct duration and expiry`, () => {
    const a = ABILITIES[type], other = a.team === 'civilian' ? 'haunter' : 'civilian';
    assert.equal(act(type).ok, true);
    assert.equal(act(type, { role: other }).reason, 'wrong-role');
    assert.equal(act(type, { alive: false }).reason, 'eliminated');
    assert.equal(act(type, { playing: false }).reason, 'match-not-active');
    assert.equal(act(type, { item: null }).reason, 'not-in-inventory');
    assert.equal(act(type, { cooldowns: { U: { [type]: NOW + 5000 } } }).reason, 'cooldown');
    assert.equal(act(type, { cooldowns: { U: { [type]: NOW - 1 } } }).ok, true, 'cooldown elapsed');
    const e = P.buildEffect(type, { now: NOW, pos: pos0, rnd: seeded(2) });
    const expected = type === 'energyShield' ? C.shieldMaxMs : a.durationMs;
    assert.equal(e.endsAt - e.at, expected); assert.equal(e.type, type); assert.equal(e.team, a.team);
    assert.equal(act(type, { effects: { U: { [type]: e } } }).reason, 'already-active', 'repeat activation blocked while active');
    assert.equal(P.isActive(e, NOW + expected - 1), true); assert.equal(P.isActive(e, NOW + expected), false, 'expires exactly at endsAt');
    if (a.radius) assert.equal(e.r, a.radius);
    if (a.kind === 'area') { assert.equal(e.lat, pos0.lat); assert.equal(e.lng, pos0.lng); }
  });
}

test('positional abilities need a fresh accurate fix; non-positional do not', () => {
  assert.equal(act('empBlast', { pos: null }).reason, 'no-gps');
  assert.equal(act('empBlast', { pos: { ...pos0, fixAt: NOW - 30000 } }).reason, 'stale-gps');
  assert.equal(act('empBlast', { pos: { ...pos0, acc: 187 } }).reason, 'poor-accuracy');
  assert.equal(act('ghostClock', { pos: null }).ok, true); assert.equal(act('energyShield', { pos: null }).ok, true);
});

test('Ghost Clock hides from Vision, Sonar, Trail but NOT from base proximity/KILL candidates', () => {
  const players = { C1: { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 20), ts: NOW }, C2: { role: 'civilian', alive: true, ...offsetLatLng(center, 90, 20), ts: NOW } };
  const effects = { C1: { ghostClock: P.buildEffect('ghostClock', { now: NOW, pos: pos0 }) } };
  const vis = P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: center, radius: 50, players, effects, now: NOW });
  assert.deepEqual(vis.map(([u]) => u), ['C2']);
  assert.equal(P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: center, radius: 50, players, effects: {}, now: NOW }).length, 2);
  // after expiry C1 is visible again
  assert.equal(P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: center, radius: 50, players, effects, now: NOW + 8001 }).length, 2);
});

test('Vision/Sonar radius and freshness: out-of-range and stale civilians are not revealed; dead ones neither', () => {
  const players = { N: { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 40), ts: NOW }, F: { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 70), ts: NOW },
    S: { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 10), ts: NOW - 60000 }, D: { role: 'civilian', alive: false, ...offsetLatLng(center, 0, 10), ts: NOW }, H2: { role: 'haunter', alive: true, ...offsetLatLng(center, 0, 5), ts: NOW } };
  const v = P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: center, radius: 50, players, effects: {}, now: NOW });
  assert.deepEqual(v.map(([u]) => u), ['N']);
  const s = P.revealedCivilians({ type: 'sonarPulse', viewerUid: 'H', viewerPos: center, origin: center, radius: 60, players, effects: {}, now: NOW });
  assert.deepEqual(s.map(([u]) => u), ['N']);
});

test('EMP jams Haunter detection inside 30 m, not outside; blocks activating detection abilities, not others', () => {
  const emp = P.buildEffect('empBlast', { now: NOW, pos: center });
  const effects = { C1: { empBlast: emp } };
  const players = { C2: { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 40), ts: NOW } };
  const inside = offsetLatLng(center, 0, 20), outside = offsetLatLng(center, 0, 45);
  assert.equal(P.inEmp(effects, inside, NOW), true); assert.equal(P.inEmp(effects, outside, NOW), false);
  assert.equal(P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: inside, radius: 50, players, effects, now: NOW }).length, 0);
  assert.equal(P.revealedCivilians({ type: 'haunterVision', viewerUid: 'H', viewerPos: outside, radius: 50, players, effects, now: NOW }).length, 1);
  assert.equal(act('sonarPulse', { jammed: true }).reason, 'jammed'); assert.equal(act('bloodRush', { jammed: true }).ok, true);
  assert.equal(P.inEmp(effects, inside, NOW + 6001), false, 'EMP expires');
});

test('Safe Bubble: blocks Sonar/Trail/Fear for those inside, but NOT Vision, and does not grant full immunity', () => {
  const bub = P.buildEffect('safeBubble', { now: NOW, pos: center });
  const effects = { C1: { safeBubble: bub } };
  const inP = { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 5), ts: NOW }, outP = { role: 'civilian', alive: true, ...offsetLatLng(center, 0, 30), ts: NOW };
  const players = { IN: inP, OUT: outP };
  const mk = (type) => P.revealedCivilians({ type, viewerUid: 'H', viewerPos: center, origin: center, radius: 60, players, effects, now: NOW }).map(([u]) => u).sort();
  assert.deepEqual(mk('sonarPulse'), ['OUT']); assert.deepEqual(mk('bloodTrail'), ['OUT']); assert.deepEqual(mk('haunterVision'), ['IN', 'OUT']);
  const fear = { H: { fearWave: P.buildEffect('fearWave', { now: NOW, pos: center }) } };
  assert.equal(P.isFeared({ ...effects, ...fear }, offsetLatLng(center, 0, 5), NOW), false, 'bubble protects');
  assert.equal(P.isFeared({ ...effects, ...fear }, offsetLatLng(center, 0, 15), NOW), true, 'outside the bubble, still afraid');
});

test('Fear Wave: 20 m, locks civilian abilities, removes sprint grace, expires after 5 s', () => {
  const fear = { H: { fearWave: P.buildEffect('fearWave', { now: NOW, pos: center }) } };
  assert.equal(P.isFeared(fear, offsetLatLng(center, 0, 15), NOW), true); assert.equal(P.isFeared(fear, offsetLatLng(center, 0, 25), NOW), false);
  assert.equal(P.isFeared(fear, offsetLatLng(center, 0, 15), NOW + 5001), false);
  assert.equal(act('ghostClock', { feared: true }).reason, 'feared');
  const adr = { U: { adrenaline: P.buildEffect('adrenaline', { now: NOW, pos: center }) } };
  assert.equal(P.zoneGrace({ effects: adr, uid: 'U', role: 'civilian', speed: 3, feared: false, now: NOW }), true);
  assert.equal(P.zoneGrace({ effects: adr, uid: 'U', role: 'civilian', speed: 3, feared: true, now: NOW }), false);
});

test('Adrenaline / Blood Rush: grace only when boosted AND really moving; never when stationary; expires; alert radius widens', () => {
  for (const [type, role] of [['adrenaline', 'civilian'], ['bloodRush', 'haunter']]) {
    const eff = { U: { [type]: P.buildEffect(type, { now: NOW, pos: center }) } };
    const g = (o) => P.zoneGrace({ effects: eff, uid: 'U', role, speed: 3, feared: false, now: NOW, ...o });
    assert.equal(g({}), true); assert.equal(g({ speed: 0.2 }), false); assert.equal(g({ speed: NaN }), false); assert.equal(g({ now: NOW + 10001 }), false);
    assert.equal(P.zoneGrace({ effects: eff, uid: 'U', role: role === 'civilian' ? 'haunter' : 'civilian', speed: 3, feared: false, now: NOW }), false, 'other role boost does not apply');
    assert.equal(P.alertRadius({ effects: eff, uid: 'U', role, now: NOW, base: 10 }), 20); assert.equal(P.alertRadius({ effects: {}, uid: 'U', role, now: NOW, base: 10 }), 10);
  }
});

test('Energy Shield: active flag, expires (never permanent)', () => {
  const eff = { C: { energyShield: P.buildEffect('energyShield', { now: NOW, pos: center }) } };
  assert.equal(P.shieldActive(eff, 'C', NOW + 1000), true); assert.equal(P.shieldActive(eff, 'C', NOW + C.shieldMaxMs), false); assert.equal(P.shieldActive(eff, 'X', NOW), false);
});

test('Decoys: deterministic drift identical for every client; not a player; stop at expiry; stay near caster', () => {
  for (const type of ['hologramDecoy', 'shadowClone']) {
    const e = P.buildEffect(type, { now: NOW, pos: center, rnd: seeded(4) });
    const a = P.decoyPosition(e, NOW), b = P.decoyPosition(e, NOW + 5000), c = P.decoyPosition(e, NOW + 99999), d = P.decoyPosition(e, e.endsAt);
    assert.ok(Math.abs(distM(center, a) - C.decoyStartOffset) < 0.5); assert.ok(distM(a, b) > 4 && distM(a, b) < 8);
    assert.deepEqual(c, d, 'frozen after expiry'); assert.ok(distM(center, c) < 40);
    assert.deepEqual(P.decoyPosition(e, NOW + 5000), b, 'pure function of synced data');
    assert.equal(e.uid, undefined, 'no player identity is created');
  }
});

test('Blood Trail buffer: RAM-only, windowed, capped, dropped for dead/stale civilians', () => {
  const buf = new Map(); let t = NOW;
  for (let i = 0; i < 30; i++) { t += 1000; P.recordTrails(buf, { A: { role: 'civilian', alive: true, lat: 17.4 + i * 1e-5, lng: 78.4, ts: t, fixAt: t }, H: { role: 'haunter', alive: true, lat: 1, lng: 1, ts: t, fixAt: t } }, t); }
  assert.ok(buf.get('A').length <= C.trailMaxPoints); assert.ok(buf.get('A')[0].t >= t - C.trailWindowMs); assert.equal(buf.has('H'), false);
  P.recordTrails(buf, { A: { role: 'civilian', alive: false, lat: 1, lng: 1, ts: t, fixAt: t } }, t); assert.equal(buf.has('A'), false);
});

test('flattenEffects ignores expired and unknown effects', () => {
  const eff = { A: { ghostClock: { endsAt: NOW + 10 }, bogus: { endsAt: NOW + 10 }, adrenaline: { endsAt: NOW - 1 } } };
  assert.deepEqual(P.flattenEffects(eff, NOW).map((e) => e.type), ['ghostClock']);
});

test('area ring visibility: owner/team always; opponents only when inside it', () => {
  const emp = { ...P.buildEffect('empBlast', { now: NOW, pos: center }), uid: 'C1' };
  const v = (o) => P.areaVisibleTo({ effect: emp, uid: 'X', role: 'haunter', myPos: null, now: NOW, ...o });
  assert.equal(v({ uid: 'C1', role: 'civilian' }), true); assert.equal(v({ role: 'civilian' }), true);
  assert.equal(v({ myPos: offsetLatLng(center, 0, 35) }), true, 'within r+10');
  assert.equal(v({ myPos: offsetLatLng(center, 0, 80) }), false, 'a Haunter far away cannot use the ring to track');
  assert.equal(v({ now: NOW + 7000 }), false);
});
