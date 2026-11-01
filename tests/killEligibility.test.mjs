import test from 'node:test';
import assert from 'node:assert/strict';
import { distM, offsetLatLng } from '../src/services/geomath.js';
import { isKillEligible, killCandidates } from '../src/services/killEligibility.js';

const NOW = 1_000_000;
const center = { lat: 17.385, lng: 78.4867 };
const fix = (point, acc = 0, at = NOW - 500) => ({ ...point, acc, fixAt: at });
const attacker = (point = center, acc = 0) => fix(point, acc);
const civilian = (point, acc = 0, extra = {}) => ({ ...fix(point, acc), role: 'civilian', alive: true, ...extra });
const options = { now: NOW, range: 10, maxAccuracy: 5, maxAge: 3_000 };

test('a valid Civilian at 2 m, 4 m, 8 m, 9.9 m and 10 m is eligible', () => {
  for (const metres of [2, 4, 8, 9.9, 10]) {
    const target = civilian(offsetLatLng(center, 0, metres));
    assert.equal(isKillEligible({
      attackerId: 'hau1', attacker: { ...attacker(), role: 'haunter', alive: true },
      targetId: 'civ1', target, ...options,
    }), true, `${metres} m should be eligible`);
  }
});

test('the 10 m boundary tolerance only absorbs geodesic floating-point error', () => {
  const target = civilian(offsetLatLng(center, 0, 10.000002));
  assert.equal(isKillEligible({
    attackerId: 'hau1', attacker: { ...attacker(), role: 'haunter', alive: true },
    targetId: 'civ1', target, ...options,
  }), false);
});

test('reported 5.74 m encounter with ±3 m accuracy is eligible', () => {
  const hau = { ...attacker(center, 3), role: 'haunter', alive: true };
  const civ = civilian(offsetLatLng(center, 0, 5.74), 3);
  assert.equal(isKillEligible({
    attackerId: 'hau1', attacker: hau, targetId: 'civ1', target: civ, ...options,
  }), true);
});

test('kill quality rejects accuracy above 5 m and fixes older than 3 seconds', () => {
  const hau = { ...attacker(center, 4), role: 'haunter', alive: true };
  const civ = civilian(offsetLatLng(center, 0, 3), 3);
  assert.equal(isKillEligible({ attackerId: 'hau1', attacker: hau, targetId: 'civ1', target: civ, ...options }), true);
  assert.equal(isKillEligible({ attackerId: 'hau1', attacker: { ...hau, acc: 6 }, targetId: 'civ1', target: civ, ...options }), false);
  assert.equal(isKillEligible({ attackerId: 'hau1', attacker: hau, targetId: 'civ1', target: { ...civ, fixAt: NOW - 3001 }, ...options }), false);
});

test('the same coordinate pair produces symmetric distance and eligibility', () => {
  const hau = { ...attacker(center, 3), role: 'haunter', alive: true };
  const civ = civilian(offsetLatLng(center, 0, 3), 3);
  const forward = distM(hau, civ);
  const reverse = distM(civ, hau);
  assert.ok(Math.abs(forward - reverse) < 1e-9);
  assert.equal(isKillEligible({ attackerId: 'hau1', attacker: hau, targetId: 'civ1', target: civ, ...options }), true);
});

test('KILL rejects stale, inaccurate, wrong-role, eliminated and out-of-range targets', () => {
  const base = { attackerId: 'hau1', attacker: { ...attacker(), role: 'haunter', alive: true }, targetId: 'civ1', ...options };
  assert.equal(isKillEligible({ ...base, target: civilian(offsetLatLng(center, 0, 10.1)) }), false);
  assert.equal(isKillEligible({ ...base, target: civilian(center, 0, { fixAt: NOW - 10_001 }) }), false);
  assert.equal(isKillEligible({ ...base, target: civilian(center, 11) }), false);
  assert.equal(isKillEligible({ ...base, target: { ...civilian(center), role: 'haunter' } }), false);
  assert.equal(isKillEligible({ ...base, target: civilian(center, 0, { alive: false }) }), false);
  assert.equal(isKillEligible({ ...base, attacker: { ...attacker(), role: 'civilian', alive: true } }), false);
  assert.equal(isKillEligible({ ...base, attackerId: 'civ1', targetId: 'civ1', target: civilian(center) }), false);
});

test('candidate list uses the same validated predicate as the KILL button', () => {
  const players = {
    hau1: { ...attacker(), role: 'haunter', alive: true },
    civ1: civilian(offsetLatLng(center, 0, 4), 3),
    civ2: civilian(offsetLatLng(center, 0, 11)),
  };
  assert.deepEqual(killCandidates(players, 'hau1', players.hau1, NOW, options).map(([id]) => id), ['civ1']);
  assert.ok(distM(players.hau1, players.civ1) <= 4.01);
});
