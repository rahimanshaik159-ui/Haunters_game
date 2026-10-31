# Manual test checklist (real devices, real Firebase)

Prerequisite: publish `firebase/database.rules.json` in the Firebase console. Use 3 independent sessions (e.g. phone A Chrome, phone B Chrome, one WebView app, or 3 browser profiles) with 3 different accounts: **1 Haunter + 2 Civilians**.

## GPS (Vivo Y200e 5G; Chrome and the WebView app)
- [ ] Open a match outdoors: panel shows "Acquiring GPS..." then "GPS connected" with a real +-m value; map is usable while acquiring.
- [ ] Indoors / Precise location off: panel shows Poor accuracy + guidance; accuracy number matches Chrome's own location accuracy.
- [ ] Deny location: "Location permission denied" + help text; allow in settings, press Retry GPS -> recovers.
- [ ] Turn Location services off mid-game -> "GPS unavailable / signal lost"; turn on -> recovers (Retry if needed).
- [ ] Lock the screen 30 s, return -> "stale/lost" then recovers.
- [ ] Other players' positions update about every 3 s; "Synced ... ago" advances; airplane mode shows "Offline".
- [ ] KILL: 5 m range, 3 s hold, refused when accuracy > 10 m or fix stale (unchanged behaviour).
## Pickups
- [ ] After Start Game, cyan orbs appear for Civilians, red for Haunters (3 each), none in inventory.
- [ ] Civilians never see red orbs and vice-versa; wrong team cannot collect.
- [ ] Walk within 5 m (accuracy <= 15 m): collected after ~2 s; orb vanishes on all phones; "Collected ..." toast.
- [ ] Two Civilians arrive together: exactly one gets it, the other sees "Too late".
- [ ] Collected orb reappears elsewhere ~20 s later; an ignored orb moves after ~60 s.
- [ ] 6 items carried: a 7th is refused ("Inventory full").
## Abilities (test each of the 12 once)
- [ ] Activate -> countdown shows, slot becomes cooldown, item consumed; effect visible on the right phones; expires on time.
- [ ] Double-tap Activate: only one use consumed.
- [ ] Ghost Clock vs Vision/Sonar/Trail; EMP jams Haunter Vision/Sonar/Trail inside 30 m; Safe Bubble vs Sonar/Trail/Fear; Fear Wave locks Civilian abilities in 20 m; Shield absorbs exactly one completed KILL; decoys appear only for the opposite team and are not players.
- [ ] Adrenaline/Blood Rush: standing still outside the zone still takes damage; walking briskly does not (grace).
## Match flow
- [ ] Host start, roles, elimination -> Spectator view works, "Return to Game" works, match end cleans up (host).
- [ ] Reload a phone mid-match: inventory, cooldowns and active effects return.
