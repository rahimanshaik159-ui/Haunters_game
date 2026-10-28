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
Power-ups/abilities, XP levels/achievements/daily challenges, match history, blog pages, QR code, reporting/blocking, Google sign-in, avatars upload, reconnect UX, offline service worker, structured data, per-page SEO meta, cookie policy content, sound/vibration.
## Testing
Only `npm run build` was run (passes). Nothing else was tested — see manual checklist: register two accounts in two browsers → create game → join by ID → start → check roles/zone/proximity with GPS spoofing in devtools.
