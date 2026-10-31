import { ABILITIES, TYPES_BY_TEAM } from '../services/powerupConfig.js';
import { cfg } from '../config';

const C = cfg.powerups;
const Team = ({ team, title, cls }) => (
  <div className={`pu-team ${cls}`}>
    <h3>{title}</h3>
    <ul>
      {TYPES_BY_TEAM[team].map((k) => {
        const a = ABILITIES[k];
        return (
          <li key={k}><span aria-hidden="true">{a.icon}</span>
            <div><b>{a.name}</b><p>{a.desc}</p>
              <em>{k === 'energyShield' ? `Until hit · expires after ${C.shieldMaxMs / 1000}s` : `${a.durationMs / 1000}s`}{a.radius ? ` · ${a.radius} m radius` : ''} · cooldown {a.cooldownMs / 1000}s</em></div></li>
        );
      })}
    </ul>
  </div>
);

export default function PowerUpsGuide() {
  return (
    <section className="pu-how" id="power-ups" aria-labelledby="pu-how-title">
      <h2 id="pu-how-title">⚡ Power-Ups</h2>
      <p className="lead">Power-ups are one-use abilities you pick up from the real-world map. Each team has its own six, and they bend the rules of the hunt without breaking them.</p>
      <div className="pu-how-steps">
        <div><b>1 · Find them</b><p>Glowing orbs appear on the map inside the safe zone: <b style={{ color: 'var(--cy)' }}>cyan for Civilians</b>, <b style={{ color: 'var(--red)' }}>red for Haunters</b>. You only see your own team’s orbs. Up to {C.civilianSlots} Civilian and {C.haunterSlots} Haunter orbs are active at once.</p></div>
        <div><b>2 · Collect them</b><p>Walk to within {C.collectRadius} m of an orb with a fresh GPS fix better than ±{C.collectMaxAcc} m and stay there for a couple of seconds. If two teammates arrive together, only the first one gets it.</p></div>
        <div><b>3 · Carry up to six</b><p>Your inventory has {C.inventoryCapacity} slots. Every pickup fills one slot and gives one use. When all slots are full you can’t collect more, so use one first.</p></div>
        <div><b>4 · Activate</b><p>Tap a slot to read what it does, then press <b>Activate</b>. The slot shows the remaining duration while active, then a cooldown before that ability can be used again.</p></div>
        <div><b>5 · They respawn</b><p>A collected orb comes back at a new spot after {C.respawnDelayMs / 1000} s. Orbs nobody grabs move after {C.pickupExpiryMs / 1000} s. They always stay inside the shrinking zone.</p></div>
      </div>
      <div className="pu-teams">
        <Team team="civilian" title="Civilian powers" cls="civ" />
        <Team team="haunter" title="Haunter powers" cls="hau" />
      </div>
      <ul className="pu-rules">
        <li><b>Your GPS is never altered.</b> Speed boosts can’t make you physically faster. While Adrenaline Rush or Blood Rush is active you take no safe-zone damage <i>while you are genuinely moving</i> (about {C.sprintMinSpeed} m/s or more) and your nearby-enemy warning radius grows to {C.sprintProximityRadius} m.</li>
        <li><b>The KILL rules do not change.</b> No ability extends the 5 m range, shortens the 3-second hold or relaxes the GPS accuracy and freshness checks.</li>
        <li><b>Energy Shield</b> absorbs one completed Haunter elimination hit, then breaks. It never blocks safe-zone damage and expires if unused.</li>
        <li><b>Ghost Clock</b> hides you from Haunter Vision, Sonar Pulse and Blood Trail, but not from the normal proximity rules. <b>Safe Bubble</b> protects Civilians inside it from Sonar Pulse, Blood Trail and Fear Wave, but not from Haunter Vision or the KILL.</li>
        <li><b>EMP Blast</b> switches off Haunter detection abilities for Haunters inside the radius. <b>Fear Wave</b> locks the abilities of frightened Civilians while they stay inside it.</li>
        <li>Decoys are map signals only. They are not players and can never be eliminated.</li>
        <li>You can only collect and use power-ups while you are alive and the match is running. Do not spoof GPS or look at your phone while crossing roads.</li>
      </ul>
    </section>
  );
}
