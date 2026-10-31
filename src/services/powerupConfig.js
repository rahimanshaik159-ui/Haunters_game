// Power-up configuration. Every number here is intentionally configurable.
// Kept free of import.meta/DOM so it can be unit-tested in Node.

export const POWERUP_DEFAULTS = {
  // --- map pickups (independently configurable per team) ---
  civilianSlots: 3,          // active Civilian pickups on the map
  haunterSlots: 3,           // active Haunter pickups on the map
  inventoryCapacity: 6,      // inventory slots per player (hard-capped at 6 by the data model + rules)
  collectRadius: 5,          // metres
  collectMaxAcc: 15,         // metres; reported GPS accuracy must be at least this good to collect
  collectConfirmTicks: 2,    // consecutive 1 s ticks with DISTINCT fresh fixes inside the radius
  respawnDelayMs: 20000,     // after a pickup is collected
  pickupExpiryMs: 60000,     // uncollected pickups are relocated after this
  minPickupSpacing: 20,      // metres between active pickups (best effort)
  spawnZoneFraction: 0.8,    // spawn inside this fraction of the CURRENT safe-zone radius
  nonHostGraceMs: 4000,      // non-host clients only step in when the host is this late (host-loss fallback)
  // --- ability tuning ---
  trailWindowMs: 20000,      // client-side RAM buffer only; never written to Firebase
  trailMaxPoints: 15,
  sprintMinSpeed: 1.5,       // m/s of REAL measured movement needed for the sprint zone-damage grace
  sprintProximityRadius: 20, // metres, early-warning radius while boosted (base is cfg.game.proximity)
  decoyDriftMps: 1.2,
  decoyStartOffset: 12,
  shieldMaxMs: 60000,        // an unused shield expires (no permanent invulnerability)
  maxClockSkewMs: 5000,
};

// kind: how the effect is anchored. "self" = follows caster, "area" = fixed circle at activation, "decoy" = drifting marker
export const ABILITIES = {
  // ---------------- Civilian ----------------
  ghostClock:    { team: 'civilian', name: 'Ghost Clock',    icon: '👻', durationMs: 8000,  cooldownMs: 25000, kind: 'self',
    desc: 'Invisible to Haunter Vision, Sonar Pulse and Blood Trail.' },
  adrenaline:    { team: 'civilian', name: 'Adrenaline Rush', icon: '⚡', durationMs: 10000, cooldownMs: 30000, kind: 'self',
    desc: 'Sprint window: no zone damage while you really move, and a 20 m Haunter warning radius.' },
  energyShield:  { team: 'civilian', name: 'Energy Shield',  icon: '🛡️', durationMs: 60000, cooldownMs: 30000, kind: 'self',
    desc: 'Absorbs one Haunter elimination hit, then breaks. Expires if unused.' },
  hologramDecoy: { team: 'civilian', name: 'Hologram Decoy', icon: '🔮', durationMs: 10000, cooldownMs: 25000, kind: 'decoy',
    desc: 'A drifting fake signal that Haunters see on the map.' },
  empBlast:      { team: 'civilian', name: 'EMP Blast',      icon: '💥', durationMs: 6000,  cooldownMs: 30000, kind: 'area', radius: 30,
    desc: 'Jams Haunter detection abilities inside 30 m.' },
  safeBubble:    { team: 'civilian', name: 'Safe Bubble',    icon: '🫧', durationMs: 8000,  cooldownMs: 25000, kind: 'area', radius: 12,
    desc: 'Civilians inside resist Sonar, Blood Trail and Fear Wave.' },
  // ---------------- Haunter ----------------
  haunterVision: { team: 'haunter', name: 'Haunter Vision',  icon: '👁️', durationMs: 8000,  cooldownMs: 25000, kind: 'self', radius: 50,
    desc: 'Reveals Civilians within 50 m of you.' },
  bloodRush:     { team: 'haunter', name: 'Blood Rush',      icon: '🩸', durationMs: 10000, cooldownMs: 30000, kind: 'self',
    desc: 'Sprint window: no zone damage while you really move, and a 20 m Civilian alert radius.' },
  sonarPulse:    { team: 'haunter', name: 'Sonar Pulse',     icon: '📡', durationMs: 5000,  cooldownMs: 20000, kind: 'area', radius: 60,
    desc: 'Pulse that reveals Civilians within 60 m.' },
  fearWave:      { team: 'haunter', name: 'Fear Wave',       icon: '😱', durationMs: 5000,  cooldownMs: 25000, kind: 'area', radius: 20,
    desc: 'Civilians within 20 m are frightened: abilities locked, sprint grace lost.' },
  shadowClone:   { team: 'haunter', name: 'Shadow Clone',    icon: '🕷️', durationMs: 10000, cooldownMs: 25000, kind: 'decoy',
    desc: 'A drifting fake Haunter signal that Civilians see on the map.' },
  bloodTrail:    { team: 'haunter', name: 'Blood Trail',     icon: '🩸', durationMs: 10000, cooldownMs: 25000, kind: 'self', radius: 50,
    desc: 'Highlights the last ~20 s of movement of Civilians within 50 m.' },
};

export const TYPES_BY_TEAM = {
  civilian: Object.keys(ABILITIES).filter((k) => ABILITIES[k].team === 'civilian'),
  haunter: Object.keys(ABILITIES).filter((k) => ABILITIES[k].team === 'haunter'),
};
export const DETECTION = ['haunterVision', 'sonarPulse', 'bloodTrail'];   // abilities EMP can jam
export const POSITIONAL = ['hologramDecoy', 'shadowClone', 'empBlast', 'safeBubble', 'sonarPulse', 'fearWave', 'haunterVision', 'bloodTrail'];
