// Offline simulation of firebase/database.rules.json using the `targaryen` rules simulator.
// targaryen is NOT a project dependency. To run these tests:  npm i --no-save targaryen@3  &&  npm test
// (They are skipped automatically if targaryen is not installed.)
// NOTE: targaryen is a community simulator, not Google's engine. Re-check in the Firebase console Rules Playground / Emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let targaryen = null;
try { targaryen = require(process.env.TARGARYEN_PATH || 'targaryen'); } catch { /* not installed */ }
const rules = JSON.parse(readFileSync(new URL('../firebase/database.rules.json', import.meta.url)));
const NOW = 1_700_000_000_000;
const skip = !targaryen && 'targaryen not installed (npm i --no-save targaryen@3)';

const P = (role, alive = true) => ({ name: role, role, alive, health: 100, lat: 17.4, lng: 78.4, acc: 5, ts: NOW, fixAt: NOW });
const pickup = (o = {}) => ({ id: 'c1-1-a', team: 'civilian', type: 'ghostClock', lat: 17.4, lng: 78.4, state: 'active', spawnedAt: NOW - 1000, expiresAt: NOW + 59000, ...o });
const base = (extra = {}) => ({
  games: { G: { meta: { host: 'host', status: 'playing', startedAt: NOW - 5000, duration: 30 },
    players: { host: P('civilian'), civ1: P('civilian'), civ2: P('civilian'), hau1: P('haunter'), dead: P('civilian', false) }, ...extra } },
});
const db = (extra, uid) => targaryen.database(rules, base(extra), NOW).as(uid ? { uid } : null).with({ now: NOW });
const W = (d, path, val) => d.write('/games/G/' + path, val, { now: NOW });
const U = (d, path, val) => d.update('/games/G/' + path, val, { now: NOW });
const ok = (r, msg) => assert.equal(r.allowed, true, msg + (r.info ? '\n' + r.info : ''));
const no = (r, msg) => assert.equal(r.allowed, false, msg);

test('spawn rules', { skip }, () => {
  ok(W(db({}, 'civ1'), 'powerups/pickups/c1', pickup()), 'any in-room player may fill an empty slot (host-loss fallback)');
  no(W(db({}, 'stranger'), 'powerups/pickups/c1', pickup()), 'non-member');
  no(W(db({}, null), 'powerups/pickups/c1', pickup()), 'unauthenticated');
  no(W(db({}, 'civ1'), 'powerups/pickups/c1', pickup({ team: 'haunter', type: 'bloodRush' })), 'slot prefix must match team');
  no(W(db({}, 'civ1'), 'powerups/pickups/h1', pickup({ team: 'haunter', type: 'ghostClock' })), 'type must belong to team');
  no(W(db({}, 'civ1'), 'powerups/pickups/c1', pickup({ type: 'bogus' })), 'unknown type');
  no(W(db({}, 'civ1'), 'powerups/pickups/c1', pickup({ lat: 999 })), 'invalid lat');
  no(W(db({}, 'civ1'), 'powerups/pickups/zz', pickup()), 'invalid slot id');
  no(W(db({}, 'civ1'), 'powerups/pickups/c1', { ...pickup(), hack: 1 }), 'extra field');
  const waiting = base(); waiting.games.G.meta.status = 'waiting';
  no(targaryen.database(rules, waiting, NOW).as({ uid: 'civ1' }).write('/games/G/powerups/pickups/c1', pickup(), { now: NOW }), 'only while playing');
});

test('no duplicate / hijack of healthy or cooling-down slots; respawn after expiry/delay', { skip }, () => {
  const healthy = { powerups: { pickups: { c1: pickup() } } };
  no(W(db(healthy, 'civ1'), 'powerups/pickups/c1', pickup({ id: 'c1-2-b' })), 'cannot overwrite a healthy pickup');
  const expired = { powerups: { pickups: { c1: pickup({ expiresAt: NOW - 100 }) } } };
  ok(W(db(expired, 'civ1'), 'powerups/pickups/c1', pickup({ id: 'c1-2-b' })), 'expired pickup can be replaced');
  const cooling = { powerups: { pickups: { c1: pickup({ state: 'claimed', claimedBy: 'civ2', claimedAt: NOW - 1000, respawnAt: NOW + 19000, delivered: true }) } } };
  no(W(db(cooling, 'civ1'), 'powerups/pickups/c1', pickup({ id: 'c1-2-b' })), 'no early respawn');
  const ready = { powerups: { pickups: { c1: pickup({ state: 'claimed', claimedBy: 'civ2', claimedAt: NOW - 25000, respawnAt: NOW - 5000, delivered: true }) } } };
  ok(W(db(ready, 'civ1'), 'powerups/pickups/c1', pickup({ id: 'c1-3-c' })), 'respawn after delay');
});

test('claim rules: role, alive, expiry, tamper, double-claim', { skip }, () => {
  const live = { powerups: { pickups: { c1: pickup() } } };
  const claimed = (o = {}) => ({ ...pickup(), state: 'claimed', claimedBy: 'civ1', claimedAt: NOW, respawnAt: NOW + 20000, ...o });
  ok(W(db(live, 'civ1'), 'powerups/pickups/c1', claimed()), 'civilian claims civilian pickup');
  no(W(db(live, 'hau1'), 'powerups/pickups/c1', claimed({ claimedBy: 'hau1' })), 'Haunter cannot take Civilian pickup');
  no(W(db(live, 'dead'), 'powerups/pickups/c1', claimed({ claimedBy: 'dead' })), 'eliminated player');
  no(W(db(live, 'civ2'), 'powerups/pickups/c1', claimed()), 'cannot claim in someone else’s name');
  no(W(db(live, 'civ1'), 'powerups/pickups/c1', claimed({ type: 'empBlast' })), 'cannot change the ability');
  no(W(db(live, 'civ1'), 'powerups/pickups/c1', claimed({ respawnAt: NOW + 9e9 })), 'cannot lock a pickup forever');
  const hl = { powerups: { pickups: { h1: pickup({ team: 'haunter', type: 'bloodRush', id: 'h1-1-a' }) } } };
  ok(W(db(hl, 'hau1'), 'powerups/pickups/h1', claimed({ team: 'haunter', type: 'bloodRush', id: 'h1-1-a', claimedBy: 'hau1' })), 'Haunter claims Haunter pickup');
  no(W(db(hl, 'civ1'), 'powerups/pickups/h1', claimed({ team: 'haunter', type: 'bloodRush', id: 'h1-1-a' })), 'Civilian cannot take Haunter pickup');
  const taken = { powerups: { pickups: { c1: claimed({ claimedBy: 'civ2' }) } } };
  no(W(db(taken, 'civ1'), 'powerups/pickups/c1', claimed()), 'already claimed -> second claimer rejected');
  const old = { powerups: { pickups: { c1: pickup({ expiresAt: NOW - 5000 }) } } };
  no(W(db(old, 'civ1'), 'powerups/pickups/c1', claimed({ expiresAt: NOW - 5000 })), 'expired pickup');
});

test('delivery + inventory: exactly once, max 6 slots, cannot be forged', { skip }, () => {
  const c = { ...pickup(), state: 'claimed', claimedBy: 'civ1', claimedAt: NOW, respawnAt: NOW + 20000 };
  const d = db({ powerups: { pickups: { c1: c } } }, 'civ1');
  const item = { type: 'ghostClock', pid: c.id, src: 'c1', at: NOW };
  ok(U(d, 'powerups', { 'inventory/civ1/s0': item, 'pickups/c1/delivered': true }), 'atomic deliver');
  no(U(db({ powerups: { pickups: { c1: c } } }, 'civ2'), 'powerups', { 'inventory/civ2/s0': { ...item }, 'pickups/c1/delivered': true }), 'someone else cannot deliver my pickup');
  no(W(d, 'powerups/inventory/civ1/s6', item), 'only 6 slots exist');
  no(W(d, 'powerups/inventory/civ1/s0', { ...item, type: 'empBlast' }), 'type must match the claimed pickup');
  no(W(d, 'powerups/inventory/civ1/s0', { ...item, pid: 'forged' }), 'pid must match');
  no(W(db({}, 'civ1'), 'powerups/inventory/civ1/s0', item), 'cannot forge an item with no claimed pickup');
  no(W(d, 'powerups/inventory/civ2/s0', item), 'cannot write another player’s inventory');
  const delivered = { ...c, delivered: true };
  no(W(db({ powerups: { pickups: { c1: delivered } } }, 'civ1'), 'powerups/inventory/civ1/s1', item), 'cannot re-grant the same pickup after delivery');
  no(U(db({ powerups: { pickups: { c1: delivered } } }, 'civ1'), 'powerups', { 'pickups/c1/delivered': true }), 'delivered flag only once');
  const hp = { ...c, team: 'haunter', type: 'bloodRush', id: 'h1-1', claimedBy: 'hau1' };
  no(U(db({ powerups: { pickups: { h1: hp } } }, 'hau1'), 'powerups', { 'inventory/hau1/s0': { type: 'ghostClock', pid: 'h1-1', src: 'h1', at: NOW }, 'pickups/h1/delivered': true }), 'type mismatch across teams');
  const full = db({ powerups: { inventory: { civ1: { s0: item } } } }, 'civ1');
  no(W(full, 'powerups/inventory/civ1/s0', { ...item, pid: 'x' }), 'cannot overwrite an occupied slot');
});

test('activation: needs the item, role, cooldown, no stacking, bounded duration; consumes item atomically', { skip }, () => {
  const inv = { powerups: { inventory: { civ1: { s2: { type: 'ghostClock', pid: 'a', src: 'c1', at: NOW } }, hau1: { s0: { type: 'sonarPulse', pid: 'b', src: 'h1', at: NOW } } } } };
  const eff = (o = {}) => ({ type: 'ghostClock', team: 'civilian', at: NOW, endsAt: NOW + 8000, ...o });
  const act = (d, u, type, e, slot = 's2') => U(d, 'powerups', { [`inventory/${u}/${slot}`]: null, [`effects/${u}/${type}`]: e, [`cooldowns/${u}/${type}`]: NOW + 25000 });
  ok(act(db(inv, 'civ1'), 'civ1', 'ghostClock', eff()), 'valid activation');
  ok(act(db(inv, 'hau1'), 'hau1', 'sonarPulse', eff({ type: 'sonarPulse', team: 'haunter', endsAt: NOW + 5000, lat: 17.4, lng: 78.4, r: 60 }), 's0'), 'haunter ability');
  no(act(db({}, 'civ1'), 'civ1', 'ghostClock', eff()), 'no item -> no effect');
  no(act(db(inv, 'civ1'), 'civ1', 'adrenaline', eff({ type: 'adrenaline' })), 'holding a different ability');
  no(act(db(inv, 'civ1'), 'civ1', 'ghostClock', eff({ team: 'haunter' })), 'team must equal role');
  no(act(db(inv, 'civ1'), 'civ1', 'ghostClock', eff({ endsAt: NOW + 600000 })), 'duration bounded');
  no(act(db(inv, 'hau1'), 'civ1', 'ghostClock', eff()), 'cannot activate for someone else');
  const cd = { powerups: { ...inv.powerups, cooldowns: { civ1: { ghostClock: NOW + 10000 } } } };
  no(act(db(cd, 'civ1'), 'civ1', 'ghostClock', eff()), 'cooldown enforced');
  const act2 = { powerups: { ...inv.powerups, effects: { civ1: { ghostClock: eff() } } } };
  no(act(db(act2, 'civ1'), 'civ1', 'ghostClock', eff({ at: NOW + 1 })), 'no re-activation while active');
  no(act(db({ ...inv, games: undefined }, 'dead'), 'dead', 'ghostClock', eff()), 'eliminated player');
  no(W(db(inv, 'civ1'), 'powerups/cooldowns/civ1/ghostClock', null), 'cannot erase own cooldown');
  const dataCd = { powerups: { ...inv.powerups, cooldowns: { civ1: { ghostClock: NOW + 10000 } } } };
  no(W(db(dataCd, 'civ1'), 'powerups/cooldowns/civ1/ghostClock', NOW - 1), 'cannot shorten own cooldown');
});

test('Energy Shield: owner clears; any Haunter may break it (KILL absorption); nothing else', { skip }, () => {
  const sh = { powerups: { effects: { civ1: { energyShield: { type: 'energyShield', team: 'civilian', at: NOW, endsAt: NOW + 60000 }, ghostClock: { type: 'ghostClock', team: 'civilian', at: NOW, endsAt: NOW + 8000 } } } } };
  ok(W(db(sh, 'hau1'), 'powerups/effects/civ1/energyShield', null), 'Haunter breaks shield after absorbing a hit');
  no(W(db(sh, 'hau1'), 'powerups/effects/civ1/ghostClock', null), 'Haunter cannot strip other effects');
  no(W(db(sh, 'civ2'), 'powerups/effects/civ1/energyShield', null), 'another civilian cannot');
  ok(W(db(sh, 'civ1'), 'powerups/effects/civ1/energyShield', null), 'owner may clear own');
  no(W(db(sh, 'hau1'), 'powerups/effects/hau1/ghostClock', { type: 'ghostClock', team: 'civilian', at: NOW, endsAt: NOW + 1000 }), 'role mismatch');
});

test('cleanup is host-only and only deletes', { skip }, () => {
  const x = { powerups: { pickups: { c1: pickup() } } };
  ok(W(db(x, 'host'), 'powerups', null), 'host cleans up'); no(W(db(x, 'civ1'), 'powerups', null), 'non-host');
  no(W(db(x, 'host'), 'powerups', { pickups: { c1: pickup({ type: 'empBlast' }) } }), 'host cannot bulk-write');
});

test('existing rules unchanged: lobby/users/meta/players behave as before', { skip }, () => {
  const d = db({}, 'civ1');
  ok(W(d, 'players/civ1', { ...P('civilian'), lat: 1 }), 'player writes own record');
  ok(W(d, 'players/civ1/lat', 1.5), 'player writes own location');
  no(W(d, 'players/civ2/lat', 1.5), 'cannot write another player');
  ok(W(db({}, 'host'), 'meta/status', 'ended'), 'host updates meta');
  no(W(d, 'meta/status', 'ended'), 'non-host cannot update meta');
  ok(targaryen.database(rules, base(), NOW).as({ uid: 'civ1' }).read('/games/G', { now: NOW }), 'members read the game');
  no(targaryen.database(rules, base(), NOW).as({ uid: 'stranger' }).read('/games/G', { now: NOW }), 'outsiders cannot read game');
});
