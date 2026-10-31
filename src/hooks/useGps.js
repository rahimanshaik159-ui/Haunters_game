import { useEffect, useRef, useState, useCallback } from 'react';
import { ref, update, onValue } from 'firebase/database';
import { db } from '../services/firebase';
import { cfg } from '../config';
import { createGeoTracker, createLocationSync } from '../services/geoTracker.js';

// One GPS tracker per mounted Play screen. The watcher is created once and only torn down on unmount
// (it is NOT restarted by role/state changes). `onFix` always sees the latest closure via a ref.
export function useGps({ gameId, uid, onFix }) {
  const [pos, setPos] = useState(null);
  const posR = useRef(null);
  const onFixR = useRef(onFix); onFixR.current = onFix;
  const trackerR = useRef(null);
  const [gps, setGps] = useState({ state: 'acquiring', acc: null, lastFixAt: null, detail: '', rejected: 0, restarts: 0 });
  const [sync, setSync] = useState({ state: 'idle', lastSyncAt: null });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const G = cfg.game;
    const syncer = createLocationSync({
      throttleMs: G.posThrottleMs,
      onState: setSync,
      write: (v) => update(ref(db, `games/${gameId}/players/${uid}`), { lat: v.lat, lng: v.lng, acc: v.acc, ts: Date.now(), fixAt: v.fixAt }),
    });
    const tracker = createGeoTracker({
      opts: { ...cfg.gps, timeoutMs: G.geoTimeoutMs, maximumAgeMs: G.geoMaximumAgeMs, goodAccM: G.killMaxAcc, fairAccM: G.maxAcc },
      onStatus: setGps,
      onFix: (v) => { posR.current = v; setPos(v); onFixR.current?.(v); syncer.push(v); },
    });
    trackerR.current = tracker;
    tracker.start();
    return () => { tracker.stop(); syncer.dispose(); trackerR.current = null; };
  }, [gameId, uid]);

  useEffect(() => onValue(ref(db, '.info/connected'), (s) => setOnline(s.val() === true), () => {}), []);
  const retry = useCallback(() => trackerR.current?.retry(), []);
  return { pos, posR, gps, sync, online, retry };
}
