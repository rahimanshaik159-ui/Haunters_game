import { memo, useRef } from 'react';
import { cfg } from '../config';

const ago = (ms) => (ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : `${Math.round(ms / 60000)} min ago`);

const LABEL = {
  acquiring: ['Acquiring GPS…', 'wait'], ok: ['GPS connected', 'ok'], poor: ['GPS connected · poor accuracy', 'bad'],
  stale: ['Location stale', 'bad'], lost: ['GPS signal lost', 'bad'], denied: ['Location permission denied', 'bad'],
  unavailable: ['GPS unavailable', 'bad'], unsupported: ['Location not supported', 'bad'], insecure: ['Location needs HTTPS', 'bad'],
};

// Honest GPS panel: shows only what the browser really reported. Never blocks the map.
function GpsStatus({ gps, sync, online, now, onRetry }) {
  const mounted = useRef(Date.now());
  const [label, tone] = LABEL[gps.state] || LABEL.acquiring;
  const age = gps.lastFixAt ? Math.max(0, now - gps.lastFixAt) : null;
  const stale = age != null && age > cfg.gps.staleAfterMs && gps.state !== 'lost';
  const quality = gps.acc == null ? null : gps.acc <= cfg.game.killMaxAcc ? 'Good' : gps.acc <= cfg.game.maxAcc ? 'Fair' : 'Poor';
  const slow = gps.state === 'acquiring' && now - mounted.current > 30000;
  const canRetry = ['denied', 'lost', 'unavailable', 'stale'].includes(gps.state) || stale || slow;
  let syncText = 'Waiting to sync';
  if (!online) syncText = 'Offline: will sync when reconnected';
  else if (sync.state === 'ok') syncText = `Synced ${ago(Math.max(0, now - sync.lastSyncAt))}`;
  else if (sync.state === 'error') syncText = `Sync problem (${sync.error || 'error'}), retrying`;
  const syncTone = !online || sync.state === 'error' ? 'bad' : sync.state === 'ok' ? 'ok' : 'wait';
  return (
    <section className="gps-panel card" aria-label="GPS status" aria-live="polite">
      <div className="gps-row">
        <span className={`gps-pill ${stale ? 'bad' : tone}`}><i aria-hidden="true" />{stale ? 'Location stale' : label}</span>
        {gps.acc != null && <span className={`gps-acc q-${quality?.toLowerCase()}`}>±{Math.round(gps.acc)} m · {quality}</span>}
        <span className="gps-meta">Last fix: {age == null ? 'none yet' : ago(age)}</span>
        <span className={`gps-pill small ${syncTone}`}><i aria-hidden="true" />{syncText}</span>
      </div>
      {gps.state === 'poor' && <p className="gps-help">Reported accuracy is ±{Math.round(gps.acc)} m, which is typical of a Wi-Fi/mobile-network location rather than satellite GPS. Move outdoors with open sky, and on Android turn on Location, “Precise location” and High accuracy mode.</p>}
      {gps.state === 'denied' && <p className="gps-help">Location permission was denied. Allow <b>Precise</b> location for this site (Chrome: lock icon → Permissions) or for the HAUNTERS app (Android Settings → Apps → Location), then press Retry.</p>}
      {(gps.state === 'unavailable' || gps.state === 'unsupported') && <p className="gps-help">No location could be determined. Turn on device Location services and try again.</p>}
      {gps.state === 'insecure' && <p className="gps-help">Browsers only share location over HTTPS. Open the game from its https:// address.</p>}
      {(gps.state === 'lost' || stale) && <p className="gps-help">No new GPS fix for {age != null ? ago(age).replace(' ago', '') : 'a while'}. Your last known position is shown but is no longer used for eliminations or pickups until a fresh fix arrives.</p>}
      {slow && <p className="gps-help">Still searching for a fix. GPS can take a minute outdoors; indoors it may not work at all.</p>}
      {gps.detail === 'clock-skew' && <p className="gps-help">Your device clock and GPS time disagree. Enable automatic date &amp; time in system settings.</p>}
      {canRetry && <button type="button" className="btn sm ghost" onClick={onRetry}>Retry GPS</button>}
    </section>
  );
}
export default memo(GpsStatus);
