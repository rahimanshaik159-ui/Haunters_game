import { Fragment } from 'react';
import { Marker, Circle, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { ABILITIES } from '../services/powerupConfig.js';

const icons = new Map();
const icon = (cls, html, size = 34) => {
  const k = cls + html;
  if (!icons.has(k)) icons.set(k, L.divIcon({ className: 'pu-div', html: `<div class="${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }));
  return icons.get(k);
};
const AREA = {
  empBlast: { color: '#facc15', fillOpacity: 0.12 }, safeBubble: { color: '#22d3ee', fillOpacity: 0.16 },
  fearWave: { color: '#a855f7', fillOpacity: 0.16 }, sonarPulse: { color: '#22c55e', fillOpacity: 0.08 },
};

// Rendered inside the existing <MapContainer>. Pure view: all data comes from synced state via usePowerUps.
export default function PowerUpMapLayers({ pu }) {
  const { myPickups, sNow, decoys, areas, vision, sonar, trails, role } = pu;
  const blips = [...vision, ...sonar].reduce((m, [uid, p]) => m.set(uid, p), new Map());
  return (
    <>
      {myPickups.map((p) => (
        <Fragment key={p.id}>
          <Circle center={[p.lat, p.lng]} radius={pu.cfg.collectRadius} pathOptions={{ color: role === 'civilian' ? '#22d3ee' : '#ff2d4a', weight: 1, dashArray: '3 4', fillOpacity: 0.08 }} />
          <Marker position={[p.lat, p.lng]} icon={icon(`pu-pickup ${role === 'civilian' ? 'pu-c' : 'pu-h'}`, ABILITIES[p.type].icon)} zIndexOffset={400}>
            <Tooltip direction="top">{ABILITIES[p.type].name} · {Math.max(0, Math.ceil((p.expiresAt - sNow) / 1000))}s left</Tooltip>
          </Marker>
        </Fragment>
      ))}
      {areas.map((e) => {
        const s = AREA[e.type];
        const prog = e.type === 'sonarPulse' ? Math.min(1, (sNow - e.at + 1000) / (e.endsAt - e.at)) : 1;
        return (
          <Fragment key={e.uid + e.type + e.at}>
            <Circle center={[e.lat, e.lng]} radius={e.r} pathOptions={{ color: s.color, weight: 2, dashArray: '6 6', fillColor: s.color, fillOpacity: s.fillOpacity }} />
            {e.type === 'sonarPulse' && <Circle center={[e.lat, e.lng]} radius={Math.max(1, e.r * prog)} pathOptions={{ color: s.color, weight: 4, fill: false, opacity: 0.8 }} />}
            <Marker position={[e.lat, e.lng]} icon={icon('pu-areaicon', ABILITIES[e.type].icon, 28)} interactive={false} />
          </Fragment>
        );
      })}
      {[...blips.entries()].map(([uid, p]) => <Marker key={'b' + uid} position={[p.lat, p.lng]} icon={icon('pu-blip cy', '', 30)} interactive={false} zIndexOffset={300} />)}
      {decoys.map((d) => <Marker key={d.uid + d.type} position={[d.lat, d.lng]} icon={icon(`pu-blip ${d.team === 'civilian' ? 'cy' : 'red'}`, '', 30)} interactive={false} zIndexOffset={300} />)}
      {trails.map(([uid, pts]) => pts.length > 1 && (
        <Fragment key={'t' + uid}>
          <Polyline positions={pts.map((q) => [q.lat, q.lng])} pathOptions={{ color: '#b91c1c', weight: 4, opacity: 0.85, dashArray: '2 6' }} />
          <CircleMarker center={[pts[pts.length - 1].lat, pts[pts.length - 1].lng]} radius={5} pathOptions={{ color: '#b91c1c' }} />
        </Fragment>
      ))}
    </>
  );
}
