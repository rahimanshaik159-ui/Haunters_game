import { useEffect, useRef, useState, useCallback } from 'react';
import { cfg } from '../config';
import { ABILITIES } from '../services/powerupConfig.js';
import * as P from '../services/powerups.js';
import * as A from '../services/powerupActions.js';
import { zoneAt, elapsed } from '../services/gameplay';

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// All power-up client logic for one Play screen. Reads synced state from `g.powerups`, never from local guesses.
export function usePowerUps({ id, g, u, me, pos, posR, now, graceRef }) {
  const C = cfg.powerups, G = cfg.game;
  const role = me.role, uid = u.uid, meta = g.meta, pw = g.powerups || {};
  const playing = meta.status === 'playing' && elapsed(meta, now) < meta.duration * 60;
  const isHost = meta.host === uid;
  const sNow = (void now, A.serverNow()); // re-evaluated on every render; Play re-renders each second
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const gR = useRef(g); gR.current = g;
  const claiming = useRef(false), delivering = useRef(false), maintaining = useRef(new Set()), ticks = useRef(new Map()), trailBuf = useRef(new Map());
  const noticeT = useRef(null);
  const say = useCallback((m) => { setNotice(m); clearTimeout(noticeT.current); noticeT.current = setTimeout(() => setNotice(''), 4000); }, []);
  const fail = useCallback((e) => { if (A.isPermissionError(e)) setProblem('Power-ups are unavailable: the Firebase Realtime Database rules have not been updated yet (see README).'); else setProblem(''); }, []);

  useEffect(() => { A.startServerClock(); return () => clearTimeout(noticeT.current); }, []);

  const inventory = P.inventoryArray(pw.inventory?.[uid]);
  const invFull = P.freeInvKey(pw.inventory?.[uid], C.inventoryCapacity) === null;
  const myPickups = Object.entries(pw.pickups || {}).filter(([, p]) => p && p.team === role && p.state === 'active' && sNow < p.expiresAt).map(([slot, p]) => ({ slot, ...p }));

  // ---- derived effect state for MY screen ----
  const effects = pw.effects || {};
  const myPos = posR.current || pos;
  const feared = role === 'civilian' && P.isFeared(effects, myPos, sNow);
  const jammed = role === 'haunter' && P.inEmp(effects, myPos, sNow);
  const protectedByBubble = role === 'civilian' && P.inSafeBubble(effects, myPos, sNow);
  const pinged = role === 'civilian' && P.isSonarPinged(effects, myPos, sNow);
  const shield = P.shieldActive(effects, uid, sNow);
  const mine = Object.entries(effects[uid] || {}).filter(([t, e]) => ABILITIES[t] && P.isActive(e, sNow)).map(([type, e]) => ({ type, ...e }));
  const speed = myPos?.spd;
  const grace = P.zoneGrace({ effects, uid, role, speed, feared, now: sNow, cfg: C });
  if (graceRef) graceRef.current = grace;
  const alertRadius = P.alertRadius({ effects, uid, role, now: sNow, base: G.proximity, cfg: C });

  // ---- single 1 s tick driven by Play's clock ----
  useEffect(() => {
    const cur = gR.current, m = cur.meta, self = cur.players?.[uid], pws = cur.powerups || {};
    if (!self?.alive || m.status !== 'playing') return;
    const nd = Date.now(), ns = A.serverNow(), p = posR.current;

    // 1) maintenance: host first, any other player only when the host is late (host loss / reconnect fallback)
    const sec = elapsed(m, nd), zoneR = P.spawnRadius(zoneAt(m, sec), zoneAt(m, sec + C.pickupExpiryMs / 1000));
    const center = m.center;
    [...P.slotIds('civilian', C), ...P.slotIds('haunter', C)].forEach((slot) => {
      const due = P.pickupDue(pws.pickups?.[slot], ns);
      if (!due || maintaining.current.has(slot)) return;
      const dueAt = due.dueAt || m.startedAt || 0;
      if (!isHost && ns - dueAt < C.nonHostGraceMs + (hash(uid + slot) % 3000)) return;
      maintaining.current.add(slot);
      A.maintainSlot({ id, slot, pickups: pws.pickups || {}, center, zoneR, cfg: C })
        .catch(fail).finally(() => maintaining.current.delete(slot));
    });

    // 2) collection (needs consecutive DISTINCT fresh fixes inside the radius)
    const inv = pws.inventory?.[uid];
    const seen = new Set();
    Object.entries(pws.pickups || {}).forEach(([slot, pk]) => {
      if (!pk || pk.team !== self.role) return;
      seen.add(pk.id);
      const ev = P.evaluateCollection({ pickup: pk, pos: p, nowDevice: nd, nowServer: ns, role: self.role, alive: self.alive, playing: true,
        invFull: P.freeInvKey(inv, C.inventoryCapacity) === null, cfg: C, maxAgeMs: G.locationMaxAgeMs });
      const t = ticks.current.get(pk.id) || { n: 0, fix: null };
      if (ev.ok && p) { if (t.fix !== p.fixAt) { t.n++; t.fix = p.fixAt; } } else { t.n = 0; t.fix = null; }
      ticks.current.set(pk.id, t);
      if (ev.reason === 'inventory-full') say('Inventory full: use an ability to free a slot.');
      if (ev.ok && t.n >= C.collectConfirmTicks && !claiming.current) {
        claiming.current = true;
        const okNow = (cand) => P.evaluateCollection({ pickup: cand, pos: posR.current, nowDevice: Date.now(), nowServer: A.serverNow(), role: self.role, alive: true, playing: true, invFull: false, cfg: C, maxAgeMs: G.locationMaxAgeMs }).ok;
        A.claimPickup({ id, slot, uid, role: self.role, cfg: C, okNow })
          .then(async (won) => {
            if (!won) return say('Too late: another player collected it first.');
            const r = await A.deliverPickup({ id, slot, uid, pickup: won, inventory: gR.current.powerups?.inventory?.[uid], cap: C.inventoryCapacity });
            if (r.ok) { say(`Collected ${ABILITIES[won.type].name}!`); navigator.vibrate?.(60); } else say('Inventory full.');
          })
          .catch(fail).finally(() => { claiming.current = false; });
      }
    });
    [...ticks.current.keys()].forEach((k) => { if (!seen.has(k)) ticks.current.delete(k); });

    // 3) reconcile: a pickup I claimed whose delivery was interrupted (reload / network) is delivered exactly once
    if (!delivering.current) {
      const orphan = Object.entries(pws.pickups || {}).find(([, pk]) => pk && pk.state === 'claimed' && pk.claimedBy === uid && !pk.delivered);
      if (orphan && !claiming.current) {
        delivering.current = true;
        A.deliverPickup({ id, slot: orphan[0], uid, pickup: orphan[1], inventory: inv, cap: C.inventoryCapacity })
          .catch(fail).finally(() => { delivering.current = false; });
      }
    }

    // 4) Blood Trail RAM buffer: only while a Haunter holds/uses Blood Trail; never persisted
    const holdsTrail = self.role === 'haunter' && (P.inventoryArray(inv).some((i) => i?.type === 'bloodTrail') || P.isActive(pws.effects?.[uid]?.bloodTrail, ns));
    if (holdsTrail) P.recordTrails(trailBuf.current, cur.players, nd, C); else if (trailBuf.current.size) trailBuf.current.clear();

    // 5) tidy my own expired effects (correctness never depends on this)
    Object.entries(pws.effects?.[uid] || {}).forEach(([t, e]) => { if (e && e.endsAt < ns - 15000) A.clearOwnEffect(id, uid, t); });
  }, [now]); // eslint-disable-line

  // Announce when my shield is broken by a Haunter
  const hadShield = useRef(false);
  useEffect(() => { if (hadShield.current && !shield && role === 'civilian') say('🛡️ Your Energy Shield absorbed a hit and broke!'); hadShield.current = shield; }, [shield]); // eslint-disable-line

  const status = (invKey) => {
    const item = inventory.find((i) => i && i.key === invKey);
    if (!item) return { ok: false, reason: 'empty' };
    return P.canActivate({ type: item.type, item, role, alive: me.alive, playing, nowServer: sNow, nowDevice: Date.now(), effects, cooldowns: pw.cooldowns, uid,
      pos: posR.current, feared, jammed, maxAcc: G.maxAcc, maxAgeMs: G.locationMaxAgeMs });
  };

  const activate = async (invKey) => {
    if (busy) return;
    const chk = status(invKey);
    if (!chk.ok) return say(REASONS[chk.reason] || 'Not available right now.');
    const item = inventory.find((i) => i && i.key === invKey);
    setBusy(true);
    try { await A.activateAbility({ id, uid, invKey, type: item.type, pos: posR.current, cfg: C }); say(`${ABILITIES[item.type].name} activated!`); navigator.vibrate?.([40, 30, 40]); setSelected(null); }
    catch (e) { fail(e); say('Could not activate (it may already have been used).'); }
    finally { setBusy(false); }
  };

  const reveal = (type, extra = {}) => P.revealedCivilians({ type, viewerUid: uid, viewerPos: myPos, players: g.players, effects, now: Date.now(), nowServer: sNow, ...extra });
  const myEff = (t) => effects[uid]?.[t];
  const vision = role === 'haunter' && P.isActive(myEff('haunterVision'), sNow) ? reveal('haunterVision', { radius: ABILITIES.haunterVision.radius }) : [];
  const sonarE = role === 'haunter' && P.isActive(myEff('sonarPulse'), sNow) ? myEff('sonarPulse') : null;
  const sonar = sonarE ? reveal('sonarPulse', { origin: sonarE, radius: sonarE.r }) : [];
  const trailE = role === 'haunter' && P.isActive(myEff('bloodTrail'), sNow);
  const trails = trailE ? reveal('bloodTrail', { radius: ABILITIES.bloodTrail.radius }).map(([uid2]) => [uid2, trailBuf.current.get(uid2) || []]) : [];
  const all = P.flattenEffects(effects, sNow);
  const decoys = all.filter((e) => ABILITIES[e.type].kind === 'decoy' && e.team !== role).map((e) => ({ ...e, ...P.decoyPosition(e, sNow) }));
  const areas = all.filter((e) => ABILITIES[e.type].kind === 'area' && P.areaVisibleTo({ effect: e, uid, role, myPos, now: sNow }));

  return { cfg: C, role, playing, sNow, inventory, invFull, myPickups, mine, shield, feared, jammed, protectedByBubble, pinged, grace, alertRadius,
    vision, sonar, sonarE, trails, decoys, areas, notice, problem, busy, selected, setSelected, status, activate,
    cooldowns: pw.cooldowns?.[uid] || {}, speed };
}

export const REASONS = {
  cooldown: 'Still on cooldown.', 'already-active': 'Already active.', feared: 'Frightened! Abilities are locked inside the Fear Wave.',
  jammed: 'Jammed by an EMP: detection abilities are offline here.', 'no-gps': 'Needs a GPS fix.', 'stale-gps': 'GPS fix is stale.',
  'poor-accuracy': 'GPS accuracy is too low for this ability.', eliminated: 'You are eliminated.', 'match-not-active': 'Match is not active.',
  'wrong-role': 'Not your team’s ability.', 'not-in-inventory': 'Empty slot.', empty: 'Empty slot.',
};
