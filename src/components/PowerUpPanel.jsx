import { ABILITIES } from '../services/powerupConfig.js';
import { distM, } from '../services/geomath.js';
import { bearing, dir } from '../services/gameplay';
import { REASONS } from '../hooks/usePowerUps';

const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));

export default function PowerUpPanel({ pu, pos }) {
  const { inventory, role, sNow, cooldowns, mine, selected, setSelected, busy } = pu;
  const filled = inventory.filter(Boolean).length;
  const nearest = pos && pu.myPickups.length ? pu.myPickups.map((p) => ({ p, d: distM(pos, p) })).sort((a, b) => a.d - b.d)[0] : null;
  const sel = inventory.find((i) => i && i.key === selected) || null;
  const selChk = sel ? pu.status(sel.key) : null;
  const slotInfo = (item) => {
    if (!item) return { cls: 'empty' };
    const a = ABILITIES[item.type];
    const eff = mine.find((e) => e.type === item.type);
    if (eff) return { cls: 'active', text: `${secs(eff.endsAt - sNow)}s`, pct: Math.min(1, (eff.endsAt - sNow) / (eff.endsAt - eff.at)) };
    const cd = cooldowns[item.type];
    if (Number.isFinite(cd) && cd > sNow) return { cls: 'cooldown', text: `${secs(cd - sNow)}s`, pct: Math.min(1, (cd - sNow) / a.cooldownMs) };
    return { cls: pu.status(item.key).ok ? 'ready' : 'locked' };
  };
  return (
    <section className={`pu-panel card pu-${role}`} aria-label="Power-ups inventory">
      <div className="pu-head"><b>⚡ POWER-UPS</b><span>{filled}/{pu.cfg.inventoryCapacity} carried</span></div>
      {pu.problem && <p className="warn">{pu.problem}</p>}
      {pu.notice && <p className="pu-notice" role="status">{pu.notice}</p>}
      <div className="pu-chips" aria-live="polite">
        {mine.map((e) => <span key={e.type} className="pu-chip on"><span aria-hidden="true">{ABILITIES[e.type].icon}</span>{ABILITIES[e.type].name} · {secs(e.endsAt - sNow)}s<i style={{ transform: `scaleX(${Math.min(1, (e.endsAt - sNow) / (e.endsAt - e.at))})` }} /></span>)}
        {pu.grace && <span className="pu-chip on">🏃 Sprint grace: no zone damage while moving</span>}
        {pu.feared && <span className="pu-chip bad">😱 Frightened! Abilities locked</span>}
        {pu.jammed && <span className="pu-chip bad">⚡ EMP: detection jammed</span>}
        {pu.protectedByBubble && <span className="pu-chip on">🫧 Inside a Safe Bubble</span>}
        {pu.pinged && <span className="pu-chip bad">📡 Sonar pulse nearby</span>}
      </div>
      <div className="pu-slots" role="list">
        {inventory.map((item, i) => {
          const info = slotInfo(item), a = item && ABILITIES[item.type], key = 's' + i;
          return (
            <button key={key} role="listitem" type="button" className={`pu-slot ${info.cls}${selected === key ? ' sel' : ''}`} disabled={!item}
              onClick={() => setSelected(selected === key ? null : key)} aria-pressed={selected === key}
              aria-label={item ? `${a.name}. ${info.cls}${info.text ? ' ' + info.text : ''}` : `Empty slot ${i + 1}`} title={item ? `${a.name}: ${a.desc}` : 'Empty slot'}>
              <span className="pu-ico" aria-hidden="true">{item ? a.icon : '·'}</span>
              <span className="pu-name">{item ? a.name : 'Empty'}</span>
              {info.text && <span className="pu-time">{info.text}</span>}
              {info.pct != null && <i className="pu-fill" style={{ transform: `scaleY(${info.pct})` }} />}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="pu-detail">
          <div><b>{ABILITIES[sel.type].icon} {ABILITIES[sel.type].name}</b><p>{ABILITIES[sel.type].desc}</p>
            <small>Lasts {ABILITIES[sel.type].durationMs / 1000}s · cooldown {ABILITIES[sel.type].cooldownMs / 1000}s{ABILITIES[sel.type].radius ? ` · radius ${ABILITIES[sel.type].radius} m` : ''}</small>
            {!selChk.ok && <small className="pu-why">{REASONS[selChk.reason] || 'Not available right now.'}{selChk.remainingMs ? ` (${secs(selChk.remainingMs)}s)` : ''}</small>}</div>
          <button type="button" className="btn g" disabled={!selChk.ok || busy} onClick={() => pu.activate(sel.key)}>{busy ? 'Activating…' : 'Activate'}</button>
        </div>
      )}
      {!filled && <p className="pu-hint">No power-ups yet. Walk to a glowing {role === 'civilian' ? 'cyan' : 'red'} orb on the map (within {pu.cfg.collectRadius} m) to collect one.</p>}
      {nearest && <p className="pu-hint">Nearest {role} pickup: ~{Math.round(nearest.d)} m {dir(bearing(pos, nearest.p))} · {ABILITIES[nearest.p.type].name}</p>}
    </section>
  );
}
