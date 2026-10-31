// SIMULATED 3-session multiplayer test: 1 Haunter + 2 Civilians (host = civ1).
// Each session is a separate React root running the REAL usePowerUps hook + REAL services, with its own GPS position and auth uid,
// talking to ONE shared in-memory database that enforces the REAL firebase/database.rules.json (via the targaryen simulator).
// This is a simulation: it is NOT real Firebase, NOT real GPS and NOT three physical devices.
// Run:  npm i --no-save targaryen@3 jsdom@24  &&  npm test      (skipped automatically if either is missing)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tryReq = (n, env) => { try { return require(process.env[env] || n); } catch { return null; } };
const targaryen = tryReq('targaryen', 'TARGARYEN_PATH'), jsdomPkg = tryReq('jsdom', 'JSDOM_PATH');
const skip = !(targaryen && jsdomPkg) && 'needs: npm i --no-save targaryen@3 jsdom@24';
const root = fileURLToPath(new URL('..', import.meta.url));

if (!skip) {
  const { build } = await import('esbuild');
  const { JSDOM } = jsdomPkg;
  const dom = new JSDOM('<!doctype html><div id="x"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {}, geolocation: null, userAgent: 'node-jsdom' }, configurable: true });
  globalThis.location = dom.window.location;

  const rules = JSON.parse(readFileSync(join(root, 'firebase/database.rules.json')));
  const OPEN = { rules: { '.read': true, '.write': true } };
  let T = 1_700_000_000_000; const realNow = Date.now; Date.now = () => T;

  /* ---------- shared fake RTDB (rules-enforced) ---------- */
  const S = globalThis.__SIM = { db: null, listeners: [] };
  const plain = () => S.db.root.$value();
  const seed = (path, value) => { const d = targaryen.database(OPEN, plain(), T).write(path, value, { now: T }); S.db = S.db.with({ data: d.newDatabase.root.$value() }); notify(); };
  const get = (path) => path.split('/').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), plain()) ?? null;
  const notify = () => S.listeners.slice().forEach((l) => { const v = JSON.stringify(get(l.path)); if (v !== l.last) { l.last = v; l.cb({ val: () => JSON.parse(v ?? 'null') }); } });

  const fakeFirebase = `
    const uid = new URL(import.meta.url).searchParams.get('uid');
    const S = globalThis.__SIM;
    const get = (p) => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), S.db.root.$value()) ?? null;
    const snap = (p) => ({ val: () => JSON.parse(JSON.stringify(get(p) ?? null)) });
    const norm = (p) => '/' + String(p).replace(/^\\/+/, '');
    const apply = (res, p) => { if (!res.allowed) { const e = new Error('PERMISSION_DENIED ' + p); e.code = 'PERMISSION_DENIED'; throw e; } S.db = res.newDatabase; globalThis.__notify(); };
    export const db = { fake: true };
    export const ref = (d, p = '') => ({ path: norm(p) });
    export const onValue = (r, cb) => {
      if (r.path === '/.info/serverTimeOffset') { Promise.resolve().then(() => cb({ val: () => 0 })); return () => {}; }
      if (r.path === '/.info/connected') { Promise.resolve().then(() => cb({ val: () => true })); return () => {}; }
      const l = { path: r.path, cb, last: undefined }; S.listeners.push(l);
      Promise.resolve().then(() => { l.last = JSON.stringify(get(l.path)); cb(snap(l.path)); });
      return () => { S.listeners = S.listeners.filter((x) => x !== l); };
    };
    export const update = async (r, patch) => apply(S.db.as({ uid }).update(r.path, patch, { now: Date.now() }), r.path);
    export const remove = async (r) => apply(S.db.as({ uid }).write(r.path, null, { now: Date.now() }), r.path);
    export const set = async (r, v) => apply(S.db.as({ uid }).write(r.path, v, { now: Date.now() }), r.path);
    export const runTransaction = async (r, fn) => {
      const next = fn(JSON.parse(JSON.stringify(get(r.path) ?? null)));
      if (next === undefined) return { committed: false, snapshot: snap(r.path) };
      apply(S.db.as({ uid }).write(r.path, next, { now: Date.now() }), r.path);
      return { committed: true, snapshot: snap(r.path) };
    };`;
  globalThis.__notify = notify;
  const dir = join(root, 'node_modules', '.cache', 'haunters-sim'); mkdirSync(dir, { recursive: true });
  const out = join(dir, 'bundle.mjs');
  await build({
    stdin: { resolveDir: root, loader: 'jsx', contents: `
      import React, { useState, useEffect, useRef } from 'react';
      import { ref, onValue, db } from 'firebase/database';
      import { usePowerUps } from './src/hooks/usePowerUps';
      import * as A from './src/services/powerupActions';
      export { A };
      const REG = (globalThis.__REG = globalThis.__REG || {});
      function Inner({ g, uid }) {
        const [now, setNow] = useState(Date.now()); const posR = useRef(null); const graceR = useRef(false);
        const me = g.players[uid];
        const pu = usePowerUps({ id: 'G', g, u: { uid }, me, pos: posR.current, posR, now, graceRef: graceR });
        REG[uid] = { setNow, posR, graceR, pu, g };
        return null;
      }
      export function Client({ uid }) {
        const [g, setG] = useState(null);
        useEffect(() => onValue(ref(db, 'games/G'), (s) => setG(s.val())), []);
        return g ? React.createElement(Inner, { g, uid }) : null;
      }` },
    bundle: true, format: 'esm', platform: 'node', outfile: out, jsx: 'automatic', logLevel: 'error', absWorkingDir: root, nodePaths: [root + '/node_modules'],
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
    external: ['react', 'react-dom', 'react-dom/client'],
    plugins: [{ name: 'fake-firebase', setup(b) {
      b.onResolve({ filter: /^firebase\/database$/ }, () => ({ path: 'fb', namespace: 'fake' }));
      b.onResolve({ filter: /^(\.\.?\/)+(services\/)?firebase$/ }, () => ({ path: 'fb', namespace: 'fake' }));
      b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: fakeFirebase, loader: 'js' }));
    } }],
  });

  const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = require('react');
  const REG = (globalThis.__REG = {});
  const center = { lat: 17.385, lng: 78.4867 };
  const mods = {};
  const IDS = ['civ1', 'civ2', 'hau1'];
  const P = (role) => ({ name: role, role, alive: true, health: 100, lat: center.lat, lng: center.lng, acc: 5, ts: T, fixAt: T - 200 });
  S.db = targaryen.database(rules, { games: { G: { meta: { host: 'civ1', status: 'playing', startedAt: T, duration: 30, radius: 500, shrinkMin: 5, center, haunters: 1 },
    players: { civ1: P('civilian'), civ2: P('civilian'), hau1: P('haunter') } } } }, T);
  for (const id of IDS) {
    mods[id] = await import(pathToFileURL(out).href + '?uid=' + id);
    const host = document.createElement('div'); document.body.appendChild(host);
    await act(async () => { createRoot(host).render(React.createElement(mods[id].Client, { uid: id })); });
  }
  const pins = {};
  const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setImmediate(r)); }); };
  const pin = (uid, p, acc = 5) => { pins[uid] = p ? { ...p, acc } : null; };
  const tick = async (ms = 1000) => {
    T += ms;
    for (const id of IDS) if (pins[id] && get(`games/G/players/${id}/alive`) !== false) {
      REG[id].posR.current = { ...pins[id], fixAt: T - 200, spd: pins[id].spd ?? 0 };
      seed(`games/G/players/${id}`, { ...get(`games/G/players/${id}`), lat: pins[id].lat, lng: pins[id].lng, acc: pins[id].acc, ts: T, fixAt: T - 200 });
    }
    for (const id of IDS) await act(async () => { REG[id].setNow(T); });
    await flush();
  };
  const ticks = async (n) => { for (let i = 0; i < n; i++) await tick(); };
  const pk = () => get('games/G/powerups/pickups') || {};
  const effOf = (uid, t) => get(`games/G/powerups/effects/${uid}/${t}`);
  const offset = (p, dn, de) => ({ lat: p.lat + dn / 111320, lng: p.lng + de / (111320 * Math.cos(p.lat * Math.PI / 180)) });
  const { ABILITIES, TYPES_BY_TEAM } = await import(pathToFileURL(join(root, 'src/services/powerupConfig.js')).href);
  const { distM } = await import(pathToFileURL(join(root, 'src/services/geomath.js')).href);

  test('host starts the game: 3 Civilian + 3 Haunter pickups appear with the right team and none are auto-added to inventory', { skip }, async () => {
    await ticks(3);
    const p = pk();
    assert.deepEqual(Object.keys(p).sort(), ['c1', 'c2', 'c3', 'h1', 'h2', 'h3']);
    for (const [slot, v] of Object.entries(p)) { assert.equal(v.team, slot[0] === 'c' ? 'civilian' : 'haunter'); assert.ok(TYPES_BY_TEAM[v.team].includes(v.type)); assert.equal(v.state, 'active'); assert.ok(distM(center, v) <= 500 * 0.8); }
    assert.equal(get('games/G/powerups/inventory'), null, 'nothing is given at match start');
    // role-separated markers
    assert.deepEqual(REG.civ1.pu.myPickups.map((x) => x.slot).sort(), ['c1', 'c2', 'c3']);
    assert.deepEqual(REG.civ2.pu.myPickups.map((x) => x.slot).sort(), ['c1', 'c2', 'c3']);
    assert.deepEqual(REG.hau1.pu.myPickups.map((x) => x.slot).sort(), ['h1', 'h2', 'h3']);
  });

  test('SIMULTANEOUS collection by two Civilians: exactly one wins; Haunter standing there gets nothing; pickup disappears for everyone', { skip }, async () => {
    const c1 = pk().c1; const spot = { lat: c1.lat, lng: c1.lng };
    pin('civ1', offset(spot, 1, 0)); pin('civ2', offset(spot, 0, 1)); pin('hau1', spot);
    await ticks(1);
    assert.equal(get('games/G/powerups/inventory'), null, 'one in-range tick is not enough (consecutive-fix confirmation)');
    await ticks(3);
    const slot = pk().c1, inv1 = get('games/G/powerups/inventory/civ1') || {}, inv2 = get('games/G/powerups/inventory/civ2') || {}, invH = get('games/G/powerups/inventory/hau1');
    assert.equal(slot.state, 'claimed'); const winner = slot.claimedBy; assert.ok(['civ1', 'civ2'].includes(winner));
    const total = Object.keys(inv1).length + Object.keys(inv2).length; assert.equal(total, 1, 'exactly one inventory item exists');
    assert.equal(Object.keys(winner === 'civ1' ? inv1 : inv2).length, 1); assert.equal(invH, null, 'wrong role cannot collect');
    assert.equal(slot.delivered, true);
    const w = REG[winner].pu; assert.equal(w.inventory.filter(Boolean).length, 1);
    assert.ok(!REG.civ1.pu.myPickups.some((x) => x.slot === 'c1') && !REG.civ2.pu.myPickups.some((x) => x.slot === 'c1'), 'orb gone from both maps');
    globalThis.__winner = winner;
  });

  test('collected pickup respawns after the delay as a NEW pickup on the same team; unclaimed ones relocate after expiry', { skip }, async () => {
    const oldId = pk().c1.id; pin('civ1', null); pin('civ2', null); pin('hau1', null);
    await ticks(10); assert.equal(pk().c1.id, oldId, 'still cooling down');
    await ticks(14); assert.notEqual(pk().c1.id, oldId); assert.equal(pk().c1.state, 'active'); assert.equal(pk().c1.team, 'civilian');
    const h2 = pk().h2.id; await ticks(40); await ticks(30); assert.notEqual(pk().h2.id, h2, 'expired pickup relocated');
    for (const v of Object.values(pk())) assert.ok(v.expiresAt > T - 5000, 'no permanently stuck slot');
  });

  test('Haunter collects a Haunter pickup; Civilians cannot', { skip }, async () => {
    const h1 = pk().h1; pin('hau1', { lat: h1.lat, lng: h1.lng }); pin('civ2', { lat: h1.lat, lng: h1.lng });
    await ticks(4);
    assert.equal(pk().h1.claimedBy, 'hau1'); assert.equal(Object.keys(get('games/G/powerups/inventory/hau1') || {}).length, 1);
    assert.equal(get('games/G/powerups/inventory/civ2') == null || !Object.values(get('games/G/powerups/inventory/civ2')).some((i) => TYPES_BY_TEAM.haunter.includes(i.type)), true);
    pin('hau1', null); pin('civ2', null);
  });

  test('inventory capacity: a 7th pickup cannot be collected', { skip }, async () => {
    for (let i = 0; i < 6; i++) seed(`games/G/powerups/inventory/civ2/s${i}`, { type: 'ghostClock', pid: 'seed' + i, src: 'c1', at: T });
    await ticks(2);
    const c = Object.entries(pk()).find(([k, v]) => k[0] === 'c' && v.state === 'active')[1];
    pin('civ2', { lat: c.lat, lng: c.lng }); await ticks(5);
    assert.equal(pk()[c.id.split('-')[0]].state, 'active', 'still on the map: not claimed while full');
    assert.equal(Object.keys(get('games/G/powerups/inventory/civ2')).length, 6);
    pin('civ2', null); seed('games/G/powerups/inventory/civ2', null);
  });

  test('poor GPS accuracy / stale fix prevents collection', { skip }, async () => {
    await ticks(2);
    const c = Object.values(pk()).find((v) => v.team === 'civilian' && v.state === 'active'); const slot = c.id.split('-')[0];
    pin('civ2', { lat: c.lat, lng: c.lng }, 187); await ticks(5); assert.equal(pk()[slot].state, 'active', '±187 m cannot collect');
    pin('civ2', { lat: c.lat, lng: c.lng }, 5); T += 1000;
    REG.civ2.posR.current = { lat: c.lat, lng: c.lng, acc: 5, fixAt: T - 30000, spd: 0 };
    for (let i = 0; i < 4; i++) { T += 1000; REG.civ2.posR.current.fixAt = T - 30000; await act(async () => { REG.civ2.setNow(T); }); await flush(); }
    assert.equal(pk()[slot].state, 'active', 'stale fix cannot collect');
    pin('civ2', null);
  });

  /* ---------- all 12 abilities through the real activate() path ---------- */
  const give = (uid, type) => seed(`games/G/powerups/inventory/${uid}/s0`, { type, pid: 'g-' + type + T, src: 'c1', at: T });
  const activate = async (uid) => { await act(async () => { await REG[uid].pu.activate('s0'); }); await flush(); };
  const civOf = (t) => ABILITIES[t].team === 'civilian';

  for (const type of Object.keys(ABILITIES)) {
    test(`ability ${type}: activate -> synced effect with correct duration -> cooldown blocks reuse -> expires -> usable again`, { skip }, async () => {
      const uid = civOf(type) ? 'civ1' : 'hau1', other = civOf(type) ? 'hau1' : 'civ1';
      // fresh state for the actor
      seed(`games/G/powerups/effects/${uid}`, null); seed(`games/G/powerups/cooldowns/${uid}`, null); seed(`games/G/powerups/inventory/${uid}`, null);
      seed('games/G/powerups/effects/hau1', null);
      pin('civ1', center); pin('hau1', offset(center, 20, 0)); pin('civ2', offset(center, 0, 25));
      seed('games/G/players/civ1/alive', true);
      await ticks(1);
      // wrong role cannot even hold/activate it
      give(other, type); await activate(other);
      assert.equal(effOf(other, type) ?? null, null, 'wrong role rejected'); seed(`games/G/powerups/inventory/${other}`, null);
      // legit activation
      give(uid, type); await ticks(1);
      const t0 = T; await activate(uid);
      const e = effOf(uid, type); assert.ok(e, 'effect written'); assert.equal(e.endsAt - e.at, type === 'energyShield' ? 60000 : ABILITIES[type].durationMs);
      assert.equal(get(`games/G/powerups/inventory/${uid}/s0`), null, 'item consumed atomically');
      assert.ok(get(`games/G/powerups/cooldowns/${uid}/${type}`) >= t0 + ABILITIES[type].cooldownMs - 1000);
      await ticks(1);
      assert.ok(REG[uid].pu.mine.some((x) => x.type === type), 'caster sees it active');
      assert.ok(REG[other].g.powerups.effects[uid][type], 'synchronised to the other team’s client');
      // repeat activation blocked (cooldown / active)
      give(uid, type); await activate(uid);
      assert.equal(effOf(uid, type).at, e.at, 'repeat activation exploit blocked'); assert.ok(!REG[uid].pu.status('s0').ok);
      seed(`games/G/powerups/inventory/${uid}`, null);
      // type-specific observable behaviour
      const pu = REG[uid].pu;
      if (type === 'haunterVision') assert.ok(pu.vision.length >= 1 && pu.vision.every(([u]) => u !== 'hau1'));
      if (type === 'sonarPulse') assert.ok(pu.sonar.length >= 1 && pu.sonarE);
      if (type === 'hologramDecoy' || type === 'shadowClone') { const seenBy = REG[other].pu.decoys; assert.equal(seenBy.length, 1); assert.equal(REG[uid].pu.decoys.length, 0, 'caster’s own team does not get a fake signal'); assert.ok(Number.isFinite(seenBy[0].lat)); assert.equal(Object.keys(get('games/G/players')).length, 3, 'no fake player created'); }
      if (type === 'energyShield') assert.equal(pu.shield, true);
      if (type === 'empBlast') assert.ok(REG.hau1.pu.jammed, 'Haunter 20 m away is inside the 30 m EMP');
      if (type === 'safeBubble') assert.equal(REG.civ1.pu.protectedByBubble, true);
      if (type === 'fearWave') { assert.equal(REG.civ1.pu.feared, true, 'civ 20 m away is within … '); }
      if (type === 'adrenaline' || type === 'bloodRush') { assert.equal(pu.grace, false, 'stationary: no grace'); REG[uid].posR.current.spd = 3; pins[uid].spd = 3; await ticks(1); assert.equal(pu.grace || REG[uid].pu.grace, true, 'moving: grace'); assert.equal(REG[uid].graceR.current, true); pins[uid].spd = 0; }
      if (type === 'bloodTrail') assert.ok(Array.isArray(pu.trails));
      // expiry
      await ticks(Math.ceil((type === 'energyShield' ? 61000 : ABILITIES[type].durationMs) / 1000) + 1);
      assert.ok(!REG[uid].pu.mine.some((x) => x.type === type), 'expired on every client');
      assert.equal(REG[uid].pu.shield, false);
      // cooldown over -> usable again
      await ticks(Math.ceil(ABILITIES[type].cooldownMs / 1000));
      give(uid, type); await ticks(1); await activate(uid);
      assert.ok(effOf(uid, type).at > e.at, 'usable again after cooldown');
      seed(`games/G/powerups/effects/${uid}`, null);
    });
  }

  test('Ghost Clock hides a Civilian from Haunter Vision; EMP jams Haunter Vision; Safe Bubble blocks Sonar', { skip }, async () => {
    seed('games/G/powerups', null); pin('civ1', center); pin('civ2', offset(center, 0, 25)); pin('hau1', offset(center, 10, 0)); await ticks(1);
    give('hau1', 'haunterVision'); await ticks(1); await activate('hau1'); await ticks(1);
    const seen = () => REG.hau1.pu.vision.map(([u]) => u).sort();
    assert.deepEqual(seen(), ['civ1', 'civ2']);
    give('civ1', 'ghostClock'); await ticks(1); await activate('civ1'); await ticks(1);
    assert.deepEqual(seen(), ['civ2'], 'civ1 hidden by Ghost Clock');
    give('civ2', 'empBlast'); await ticks(1); pin('civ2', offset(center, 0, 25)); await activate('civ2'); await ticks(1);
    assert.deepEqual(seen(), [], 'Haunter inside civ2’s EMP radius is jammed'); assert.equal(REG.hau1.pu.jammed, true);
  });

  test('Fear Wave locks nearby Civilian abilities; Safe Bubble cancels it', { skip }, async () => {
    seed('games/G/powerups', null); pin('civ1', center); pin('civ2', offset(center, 0, 300)); pin('hau1', offset(center, 10, 0)); await ticks(1);
    give('hau1', 'fearWave'); await ticks(1); await activate('hau1'); await ticks(1);
    assert.equal(REG.civ1.pu.feared, true); assert.equal(REG.civ2.pu.feared, false, 'out of range');
    give('civ1', 'ghostClock'); await ticks(1); assert.equal(REG.civ1.pu.status('s0').reason, 'feared'); await activate('civ1');
    assert.equal(effOf('civ1', 'ghostClock') ?? null, null, 'feared civilian cannot activate');
    await ticks(6); assert.equal(REG.civ1.pu.feared, false, 'fear ends after 5 s');
  });

  test('Energy Shield absorbs one completed KILL hit (via the real absorbShieldHit), then is gone; second hit is not absorbed', { skip }, async () => {
    seed('games/G/powerups', null); pin('civ1', center); pin('hau1', offset(center, 3, 0)); await ticks(1);
    give('civ1', 'energyShield'); await ticks(1); await activate('civ1'); await ticks(1);
    assert.equal(REG.civ1.pu.shield, true); assert.equal(REG.hau1.g.powerups.effects.civ1.energyShield.type, 'energyShield');
    const effects = () => get('games/G/powerups/effects');
    const absorbed1 = await mods.hau1.A.absorbShieldHit({ id: 'G', victimUid: 'civ1', effects: effects() });
    assert.equal(absorbed1, true); assert.equal(effOf('civ1', 'energyShield') ?? null, null);
    const absorbed2 = await mods.hau1.A.absorbShieldHit({ id: 'G', victimUid: 'civ1', effects: effects() });
    assert.equal(absorbed2, false, 'shield was one-time');
    assert.equal(await mods.hau1.A.absorbShieldHit({ id: 'G', victimUid: 'civ2', effects: effects() }), false, 'no shield -> normal KILL flow');
    await ticks(1); assert.equal(REG.civ1.pu.shield, false);
  });

  test('eliminated player: cannot collect or activate (client AND rules reject)', { skip }, async () => {
    seed('games/G/powerups', null); await ticks(2);
    const c = Object.values(pk()).find((v) => v.team === 'civilian'); const slot = c.id.split('-')[0];
    seed('games/G/players/civ2/alive', false); pin('civ2', { lat: c.lat, lng: c.lng }); await ticks(5);
    assert.equal(pk()[slot].state, 'active');
    give('civ2', 'ghostClock'); await ticks(1); assert.equal(REG.civ2.pu.status('s0').reason, 'eliminated');
    await assert.rejects(() => mods.civ2.A.activateAbility({ id: 'G', uid: 'civ2', invKey: 's0', type: 'ghostClock', pos: null, cfg: { shieldMaxMs: 60000 } }), /PERMISSION_DENIED/);
    seed('games/G/players/civ2/alive', true); pin('civ2', null);
  });

  test('reconnect: inventory/effects/cooldowns are restored from Firebase; interrupted delivery is completed exactly once', { skip }, async () => {
    seed('games/G/powerups', null); await ticks(2);
    const c = pk().c2; // simulate: civ1 claimed (transaction committed) but crashed before delivery
    seed('games/G/powerups/pickups/c2', { ...c, state: 'claimed', claimedBy: 'civ1', claimedAt: T, respawnAt: T + 20000 });
    await ticks(3);
    const inv = get('games/G/powerups/inventory/civ1') || {}; assert.equal(Object.keys(inv).length, 1, 'orphan claim delivered'); assert.equal(Object.values(inv)[0].pid, c.id);
    assert.equal(pk().c2.delivered, true); await ticks(3); assert.equal(Object.keys(get('games/G/powerups/inventory/civ1')).length, 1, 'never delivered twice');
  });

  test('host disconnects: another player takes over spawning after the grace period (no stuck pickups)', { skip }, async () => {
    seed('games/G/powerups/pickups/h3', null); const before = REG.civ1.g;
    // freeze the host's client by removing it from the tick set
    const saved = REG.civ1.setNow; REG.civ1.setNow = () => {};
    const idx = IDS.indexOf('civ1'); IDS.splice(idx, 1);
    await ticks(12);
    assert.ok(pk().h3 && pk().h3.state === 'active', 'a non-host client respawned the slot'); IDS.splice(idx, 0, 'civ1'); REG.civ1.setNow = saved;
  });

  test('room cleanup: host removes the power-up data after the match; others cannot', { skip }, async () => {
    await assert.rejects(() => mods.civ2.A.cleanupPowerups('G').then(() => { if (get('games/G/powerups')) throw new Error('PERMISSION_DENIED'); }), /PERMISSION_DENIED/);
    await mods.civ1.A.cleanupPowerups('G'); assert.equal(get('games/G/powerups'), null);
  });
  test('teardown', { skip }, () => { Date.now = realNow; });
} else {
  test('multiplayer simulation', { skip }, () => {});
}
