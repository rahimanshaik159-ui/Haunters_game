import { distM, validLatLng } from './geomath.js';

const RANGE_BOUNDARY_TOLERANCE_M = 1e-6;

export const validKillLocation = (p, now, maxAccuracy, maxAge) => Boolean(
  p &&
  validLatLng(p) &&
  Number.isFinite(p.acc) &&
  p.acc >= 0 &&
  p.acc <= maxAccuracy &&
  Number.isFinite(p.fixAt) &&
  now - p.fixAt >= 0 &&
  now - p.fixAt <= maxAge
);
const hasLocationFields = (p) => Boolean(
  p &&
  validLatLng(p) &&
  Number.isFinite(p.acc) &&
  p.acc >= 0 &&
  Number.isFinite(p.fixAt)
);

export const explainKillEligibility = ({
  attackerId,
  attacker,
  targetId,
  target,
  now,
  range,
  maxAccuracy,
  maxAge,
}) => {
  const distance = attacker && target ? distM(attacker, target) : null;
  const uncertainty = Number.isFinite(distance) && Number.isFinite(attacker?.acc) && Number.isFinite(target?.acc)
    ? distance + attacker.acc + target.acc
    : null;
  const checks = [
    ['player-id', Boolean(attackerId && targetId), 'missing-player-id'],
    ['not-self', attackerId !== targetId, 'self-target'],
    ['attacker-role', attacker?.role === 'haunter', 'attacker-not-haunter'],
    ['attacker-alive', attacker?.alive === true, 'attacker-not-alive'],
    ['target-role', target?.role === 'civilian', 'target-not-civilian'],
    ['target-alive', target?.alive === true, 'target-not-alive'],
    ['location-fields', hasLocationFields(attacker) && hasLocationFields(target), 'invalid-location'],
    ['accuracy', Number.isFinite(attacker?.acc) && Number.isFinite(target?.acc) && attacker.acc <= maxAccuracy && target.acc <= maxAccuracy, 'gps-accuracy-too-low'],
    ['freshness', Number.isFinite(attacker?.fixAt) && Number.isFinite(target?.fixAt) && now - attacker.fixAt >= 0 && now - target.fixAt >= 0 && now - attacker.fixAt <= maxAge && now - target.fixAt <= maxAge, 'location-stale'],
    ['distance', distance !== null && distance <= range + RANGE_BOUNDARY_TOLERANCE_M, 'distance-out-of-range'],
  ];
  const failed = checks.find(([, ok]) => !ok);
  return {
    eligible: !failed,
    reason: failed?.[2] || null,
    checks: Object.fromEntries(checks.map(([name, ok]) => [name, ok])),
    distance,
    uncertainty,
  };
};

export const isKillEligible = (input) => explainKillEligibility(input).eligible;

export const killCandidates = (players, attackerId, attacker, now, options) =>
  Object.entries(players || {}).filter(([targetId, target]) => isKillEligible({
    attackerId,
    attacker,
    targetId,
    target,
    now,
    ...options,
  }));
