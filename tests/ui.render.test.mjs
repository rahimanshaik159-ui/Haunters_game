// Server-side render smoke tests of the new UI, bundled with the project's own esbuild (no new dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'node_modules', '.cache', 'haunters-ui-test'); mkdirSync(dir, { recursive: true });
const out = join(dir, 'bundle.mjs');
await build({
  stdin: { resolveDir: root, loader: 'jsx', contents: `
    export {default as GpsStatus} from './src/components/GpsStatus.jsx';
    export {default as PowerUpPanel} from './src/components/PowerUpPanel.jsx';
    export {default as PowerUpsGuide} from './src/components/PowerUpsGuide.jsx';
    export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';` },
  bundle: true, format: 'esm', platform: 'node', outfile: out, jsx: 'automatic', logLevel: 'error',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  external: ['react', 'react-dom', 'react-dom/server', 'firebase/*'], banner: { js: "import {createRequire} from 'module';const require=createRequire(import.meta.url);" },
  nodePaths: [root + '/node_modules'], absWorkingDir: root,
});
globalThis.location = globalThis.location || { origin: 'http://localhost', hostname: 'localhost' };
const U = await import(pathToFileURL(out).href);
const h = (C, props) => U.renderToStaticMarkup(U.createElement(C, props));
const NOW = Date.now();

test('How to Play lists all 12 abilities, pickup/inventory/respawn/restriction explanations', () => {
  const html = h(U.PowerUpsGuide, {});
  for (const n of ['Ghost Clock', 'Adrenaline Rush', 'Energy Shield', 'Hologram Decoy', 'EMP Blast', 'Safe Bubble', 'Haunter Vision', 'Blood Rush', 'Sonar Pulse', 'Fear Wave', 'Shadow Clone', 'Blood Trail'])
    assert.ok(html.includes(n), n);
  for (const t of ['Find them', 'Collect them', 'Carry up to six', 'Activate', 'They respawn', 'Civilian powers', 'Haunter powers', 'KILL rules do not change', '5 m']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('8s') && html.includes('10s') && html.includes('6s') && html.includes('5s'), 'durations shown');
});

const basePU = (o = {}) => ({ cfg: { inventoryCapacity: 6, collectRadius: 5 }, role: 'civilian', sNow: NOW, inventory: Array(6).fill(null), cooldowns: {}, mine: [], selected: null, setSelected() {}, busy: false,
  myPickups: [], problem: '', notice: '', grace: false, feared: false, jammed: false, protectedByBubble: false, pinged: false, status: () => ({ ok: true }), activate() {}, ...o });
const item = (i, type) => ({ key: 's' + i, type, pid: 'p' + i, src: 'c1', at: NOW });

test('inventory renders 6 slots, empty/ready/cooldown/active/locked states, details and activate button', () => {
  let html = h(U.PowerUpPanel, { pu: basePU(), pos: null });
  assert.equal((html.match(/class="pu-slot /g) || []).length, 6); assert.ok(html.includes('0/6 carried')); assert.ok(html.includes('No power-ups yet'));
  const inv = Array(6).fill(null); inv[0] = item(0, 'ghostClock'); inv[1] = item(1, 'empBlast'); inv[2] = item(2, 'safeBubble');
  html = h(U.PowerUpPanel, { pu: basePU({ inventory: inv, selected: 's0',
    cooldowns: { empBlast: NOW + 12000 }, mine: [{ type: 'safeBubble', at: NOW - 2000, endsAt: NOW + 6000 }], status: (k) => (k === 's0' ? { ok: true } : { ok: false, reason: 'cooldown' }) }), pos: null });
  assert.ok(html.includes('3/6 carried')); assert.ok(html.includes('pu-slot ready')); assert.ok(html.includes('pu-slot cooldown')); assert.ok(html.includes('pu-slot active'));
  assert.ok(html.includes('12s') && html.includes('6s'), 'cooldown + remaining duration shown');
  assert.ok(html.includes('Invisible to Haunter Vision'), 'description of selected');
  assert.ok(/<button[^>]*class="btn g"[^>]*>Activate<\/button>/.test(html), 'activate enabled');
  html = h(U.PowerUpPanel, { pu: basePU({ inventory: inv, selected: 's1', cooldowns: { empBlast: NOW + 12000 }, status: () => ({ ok: false, reason: 'cooldown', remainingMs: 12000 }) }), pos: null });
  assert.ok(/<button[^>]*disabled[^>]*class="btn g"|<button[^>]*class="btn g"[^>]*disabled/.test(html), 'activate disabled during cooldown'); assert.ok(html.includes('Still on cooldown'));
});

test('status chips for feared / jammed / pinged / bubble / sprint grace; haunter theme; pickup hint', () => {
  const html = h(U.PowerUpPanel, { pu: basePU({ role: 'haunter', feared: true, jammed: true, pinged: true, protectedByBubble: true, grace: true, problem: 'rules!',
    myPickups: [{ slot: 'h1', id: 'x', type: 'sonarPulse', lat: 17.4001, lng: 78.4, expiresAt: NOW + 30000, team: 'haunter', state: 'active' }] }), pos: { lat: 17.4, lng: 78.4 } });
  for (const t of ['Frightened', 'EMP', 'Sonar pulse nearby', 'Safe Bubble', 'Sprint grace', 'rules!', 'pu-haunter', 'Nearest haunter pickup', 'Sonar Pulse']) assert.ok(html.includes(t), t);
});

test('GPS panel renders every state honestly (no fake numbers) and offers Retry when useful', () => {
  const sync = { state: 'ok', lastSyncAt: NOW - 2000 };
  const r = (gps, o = {}) => h(U.GpsStatus, { gps: { detail: '', ...gps }, sync, online: true, now: NOW, onRetry() {}, ...o });
  assert.ok(r({ state: 'acquiring', acc: null, lastFixAt: null }).includes('Acquiring GPS'));
  let html = r({ state: 'ok', quality: 'good', acc: 6.4, lastFixAt: NOW - 1000 }); assert.ok(html.includes('GPS connected') && html.includes('±6 m') && html.includes('Good') && html.includes('Synced'));
  html = r({ state: 'poor', acc: 187, lastFixAt: NOW - 1000 }); assert.ok(html.includes('±187 m') && html.includes('Poor') && html.includes('poor accuracy') && html.includes('Precise location'));
  html = r({ state: 'ok', acc: 5, lastFixAt: NOW - 14000 }); assert.ok(html.includes('Location stale') && html.includes('Retry GPS'));
  html = r({ state: 'lost', acc: 5, lastFixAt: NOW - 40000 }); assert.ok(html.includes('GPS signal lost') && html.includes('Retry GPS'));
  html = r({ state: 'denied', acc: null, lastFixAt: null }); assert.ok(html.includes('permission denied') && html.includes('Retry GPS'));
  assert.ok(r({ state: 'unavailable' }).includes('GPS unavailable')); assert.ok(r({ state: 'insecure' }).includes('HTTPS'));
  html = r({ state: 'ok', acc: 5, lastFixAt: NOW }, { online: false }); assert.ok(html.includes('Offline'));
  html = r({ state: 'ok', acc: 5, lastFixAt: NOW }, { sync: { state: 'error', error: 'PERMISSION_DENIED' } }); assert.ok(html.includes('Sync problem'));
  assert.ok(!r({ state: 'acquiring', acc: null, lastFixAt: null }).includes('±'), 'no accuracy shown before a real fix');
});
