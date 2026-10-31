// Firebase Realtime Database side of the power-up system (client-only; no Cloud Functions).
// Data lives under games/{gameId}/powerups/{pickups,inventory,effects,cooldowns}.
import { ref, runTransaction, update, remove, onValue } from 'firebase/database';
import { db } from './firebase';
import { INV_KEYS, claimTransform, spawnTransform, planSpawn, freeInvKey, buildEffect, shieldActive } from './powerups.js';
import { ABILITIES } from './powerupConfig.js';

/* ---- server clock: used for pickup/effect/cooldown times so phones with skewed clocks agree ---- */
let offset = 0, clockStarted = false;
export const serverNow = () => Date.now() + offset;
export function startServerClock() {
  if (clockStarted || !db) return;
  clockStarted = true;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { const v = Number(s.val()); if (Number.isFinite(v)) offset = v; }, () => {});
}

const root = (id) => `games/${id}/powerups`;
export const isPermissionError = (e) => String(e?.code || e?.message || '').toUpperCase().includes('PERMISSION');

// Respawn / spawn one slot. The transaction re-validates, so concurrent maintainers can never duplicate a pickup.
export async function maintainSlot({ id, slot, pickups, center, zoneR, cfg }) {
  const now = serverNow();
  const plan = { slot, pickups, center, zoneR, now, cfg };
  plan.pickup = planSpawn(plan);
  const r = await runTransaction(ref(db, `${root(id)}/pickups/${slot}`), (cur) => spawnTransform(cur, plan), { applyLocally: false });
  return r.committed;
}

// Atomically claim a pickup. `okNow` re-checks live GPS at commit time.
export async function claimPickup({ id, slot, uid, role, cfg, okNow }) {
  const r = await runTransaction(ref(db, `${root(id)}/pickups/${slot}`),
    (cur) => claimTransform(cur, { uid, role, now: serverNow(), cfg, okNow }), { applyLocally: false });
  const v = r.snapshot.val();
  return r.committed && v && v.claimedBy === uid ? v : null;
}

// Move a claimed pickup into the first free inventory slot. One atomic multi-path write
// (inventory item + delivered flag) => exactly-once delivery, even if retried.
export async function deliverPickup({ id, slot, uid, pickup, inventory, cap }) {
  const key = freeInvKey(inventory, cap);
  if (!key) return { ok: false, reason: 'inventory-full' };
  await update(ref(db, root(id)), {
    [`inventory/${uid}/${key}`]: { type: pickup.type, pid: pickup.id, src: slot, at: serverNow() },
    [`pickups/${slot}/delivered`]: true,
  });
  return { ok: true, key };
}

// Activate: consume the inventory item, start the effect and the cooldown in ONE atomic write.
export async function activateAbility({ id, uid, invKey, type, pos, cfg }) {
  const now = serverNow();
  const effect = buildEffect(type, { now, pos, cfg });
  const a = ABILITIES[type];
  await update(ref(db, root(id)), {
    [`inventory/${uid}/${invKey}`]: null,
    [`effects/${uid}/${type}`]: effect,
    [`cooldowns/${uid}/${type}`]: now + a.cooldownMs,
  });
  return effect;
}

// Remove my own finished effects (hygiene only; expiry is time-based and needs no cleanup to be correct).
export const clearOwnEffect = (id, uid, type) => remove(ref(db, `${root(id)}/effects/${uid}/${type}`)).catch(() => {});

// KILL integration: a valid, completed elimination hit is absorbed by an active Energy Shield.
// Returns true if the hit was absorbed (the caller must then NOT eliminate). KILL range/hold/GPS checks are untouched.
export async function absorbShieldHit({ id, victimUid, effects }) {
  if (!shieldActive(effects, victimUid, serverNow())) return false;
  try { await remove(ref(db, `${root(id)}/effects/${victimUid}/energyShield`)); return true; }
  catch { return false; } // if the write is denied, fall back to normal KILL behaviour rather than breaking the match
}

// Host-only tidy up once a match is over/cancelled.
export const cleanupPowerups = (id) => remove(ref(db, root(id))).catch(() => {});

export { INV_KEYS };
