# HAUNTERS — Hunt or Survive
React + Vite + Firebase (client SDK only) + Leaflet/OpenStreetMap. No Cloud Functions, no Google Maps.

## Run locally
```
npm install
cp .env.example .env     # fill in Firebase web config
npm run dev
```
## Firebase setup
1. Create a project at console.firebase.google.com; add a Web app and copy its config into `.env`.
2. Authentication → enable Email/Password.
3. Realtime Database → create; paste `firebase/database.rules.json` into Rules; copy the DB URL into `.env`.
4. Firestore → create; paste `firebase/firestore.rules`.
5. Storage (optional, avatars not yet wired in UI) → paste `firebase/storage.rules`.
6. Authentication → Settings → Authorized domains: add your GitHub Pages / custom domain.

## Maps
Default tiles: public `tile.openstreetmap.org` (set `VITE_TILE_URL` to switch provider). Follow the OSM tile usage policy; the public server is not for heavy production use. Search uses public Nominatim (button/Enter only, 1 request per action); routing uses the public OSRM demo server — neither is guaranteed. If routing fails, a compass-bearing estimate is shown.

## Deploy to GitHub Pages
Set `VITE_SITE_URL` and `VITE_BASE=/repo-name/` (or `/` with a custom domain) in `.env`, run `npm run build`, publish `dist/` (e.g. `gh-pages` branch or a GitHub Actions Pages workflow). The build copies `index.html` to `404.html` for SPA routing.

## Domain in sitemap/robots
Replace every `https://YOUR-DOMAIN.example` in `public/sitemap.xml` and `public/robots.txt` with your real origin (e.g. `sed -i 's#https://YOUR-DOMAIN.example#https://yourdomain.com#g' public/*.xml public/robots.txt`).

## AdSense
Set `VITE_ADSENSE_ENABLED=true`, publisher ID and slot in `.env`. The script loads only then. Add a consent banner (required in some regions) first. Legal pages are templates; they don't guarantee approval.

## Known limitations (honest list)
- Client-only: roles, timers, damage and eliminations are decided by clients. Any player with devtools can cheat or read other players' coordinates; rules can't enforce game logic. Haunter/civilian "hiding" is UI-only.
- GPS is 5–30 m accurate; eliminations need accuracy ≤30 m and 3 consecutive ticks within 10 m.
- Private-room password is a SHA-256 hash stored in the room (deterrent, not strong security).
- Free tiers/public services have limits; check current Firebase, OSM, Nominatim, OSRM policies.
- WebView: geolocation needs permission handling in the host app, and background tracking is unreliable.
## Not implemented yet
XP levels/achievements/daily challenges, match history, blog pages, QR code, reporting/blocking, Google sign-in, avatars upload, reconnect UX, offline service worker, structured data, per-page SEO meta, cookie policy content, sound/vibration.
## Testing
See the **Testing** section under *Power-Ups & GPS update* below, and `docs/MANUAL_TEST_CHECKLIST.md`.

---

# Power-Ups & GPS update

## 1. Publish the updated Realtime Database rules (required for power-ups)
Power-ups store state under `games/{gameId}/powerups`. **Copy `firebase/database.rules.json` into Firebase Console → Realtime Database → Rules and Publish.**
Until you do, the game plays exactly as before, but the power-up panel shows a "rules have not been updated" notice and no pickups appear. The existing `lobby`, `users`, `meta` and `players` rules are unchanged; only a `powerups` block was added. The rules cannot be deployed from this repository by itself (no CLI/CI step was added). No Cloud Functions or paid services are used.

## 2. GPS reliability (what changed)
`src/services/geoTracker.js` + `src/hooks/useGps.js` replace the inline watcher in `Room.jsx`:
- One `watchPosition` (high accuracy, `maximumAge: 0`) plus a one-shot warm-up request; never a second watcher; always cleared on unmount; not restarted by role/state changes.
- Each fix is validated (finite, in range, accuracy >= 0). Rejected: fixes older than 15 s, fixes from the "future" (> 2 s), duplicates and out-of-order fixes. A *less accurate* fix that implies an impossible jump (> 30 m/s) is held back for at most 3 consecutive fixes, then accepted honestly.
- Coordinates and accuracy are **never** modified. The accuracy shown is the browser's own number.
- Firebase writes: throttled (`posThrottleMs`, 3 s), de-duplicated, ordered, with a *trailing* write so the newest fix is never dropped, and retry on error.
- Watchdog: no fresh fix for 10 s -> "stale"; 25 s -> "lost" plus at most one watcher recovery per 30 s (max 3, then a **Retry GPS** button). Also re-checks when the app returns to the foreground.
- A GPS status panel shows: acquiring, connected, real accuracy (Good <= 10 m, Fair <= 30 m, Poor), last fix age, stale / lost / denied / unavailable / insecure states, and Firebase sync status. It never blocks the map.
- All thresholds live in `GPS_DEFAULTS` (`geoTracker.js`) and `cfg.game`.

**What software cannot fix.** A reading like "±187 m" is a Wi-Fi / mobile-network location returned by Android, not satellite GPS. It happens indoors, with *Precise location* off (Android 12+ lets users grant only "Approximate"), with Google Location Accuracy / High-accuracy mode off, with battery-saver, or when the WebView app lacks the runtime permission. The website can only report it truthfully and tell the player how to improve it. See `docs/ANDROID_WEBVIEW_CHECKLIST.md`.

**KILL is unchanged:** 5 m range (distance + both accuracies), 3 s hold, accuracy <= 10 m, fix age <= 10 s, re-validation during the hold and again inside the Firebase transaction. (Note: `confirmTicks` in `cfg.game` was already unused before this update; continuous re-validation is what actually protects the hold.)

## 3. Power-ups
Six per team (see the in-app *How to Play -> Power-Ups* section; numbers are generated from `src/services/powerupConfig.js`).

| Civilian | Haunter |
|---|---|
| Ghost Clock 8 s | Haunter Vision 8 s / 50 m |
| Adrenaline Rush 10 s | Blood Rush 10 s |
| Energy Shield (one hit, max 60 s) | Sonar Pulse 5 s / 60 m |
| Hologram Decoy 10 s | Fear Wave 5 s / 20 m |
| EMP Blast 6 s / 30 m | Shadow Clone 10 s |
| Safe Bubble 8 s / 12 m | Blood Trail 10 s / 50 m |

Gameplay choices you should know about:
- **Speed abilities cannot make anyone physically faster** and never touch GPS. While *Adrenaline Rush* / *Blood Rush* is active you take no safe-zone damage **only while your real measured speed is >= 1.5 m/s**, and your nearby-enemy alert radius grows from 10 m to 20 m. Fear Wave removes the grace.
- **Energy Shield** absorbs one *completed, fully validated* Haunter elimination hit (it is checked after the normal KILL range/hold/GPS validation, so nothing about KILL is relaxed). It does not block safe-zone damage.
- Decoys are map signals computed from synced data (origin, bearing, time). They are not players and are not KILL targets.
- Blood Trail uses only a short in-memory buffer (~20 s) on the Haunter's device, filled from positions the client already receives, and only while a Haunter holds/uses Blood Trail. Nothing extra is stored in Firebase.

Map pickups: 3 Civilian + 3 Haunter slots (configurable), collection radius 5 m, needs a fresh fix with accuracy <= 15 m and two consecutive distinct fixes in range, atomic claim by Firebase transaction, delivery into one of 6 inventory slots, respawn 20 s after collection, relocation 60 s after spawn if nobody takes it. All values: `POWERUP_DEFAULTS` in `src/services/powerupConfig.js`. Any player's client can respawn a slot if the host is late (host-loss fallback); a transaction guarantees no duplicates.

### Data model (`games/{id}/powerups`)
`pickups/{c1..c3,h1..h3}` (one object per slot) · `inventory/{uid}/{s0..s5}` · `effects/{uid}/{abilityType}` · `cooldowns/{uid}/{abilityType}`. Times use the Firebase server clock offset. The host deletes the node after a match.

## 4. Anti-cheat limits (honest)
This is a client-side game. The rules enforce structure: slot IDs, valid types per team, role gate on claims, one claim per pickup, inventory limited to 6 slots, an inventory item must come from a pickup you claimed, activation consumes an item you hold, cooldowns and bounded durations. They **cannot** enforce: GPS truthfulness or proximity to an orb, where a spawning client places an orb, or effect radii/visibility (clients decide who sees what). Existing limitations still apply: players can edit their own player record (including role/alive), and every player in a room can read every other player's coordinates, so "reveal" abilities are UI-level, not secrecy. Do not describe power-ups as cheat-proof.

## 5. Testing
```
npm install
npm run build
npm test          # unit tests (GPS tracker, power-up logic, UI render)
```
Optional, stronger local checks (not project dependencies):
```
npm i --no-save targaryen@3 jsdom@24
npm test          # additionally runs the rules simulation and the 3-session multiplayer simulation
```
These are **simulations** (a rules simulator, a fake in-memory database, scripted GPS positions). They do not replace testing on real phones with real Firebase; use `docs/MANUAL_TEST_CHECKLIST.md`.
