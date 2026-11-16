# Tank Rush: Base Defense (Google Play version)

A touch-first tank game (defend your base against enemy waves) that will ship as an Android app on Google Play, wrapped with Capacitor 8 with all files bundled inside the app. It is a standalone, offline web game: plain HTML/CSS/JavaScript, no libraries, no build step, everything drawn on one canvas. It started as a copy of a web-portal version; nothing of that platform is left.

Portrait: the playfield (13x21 tiles) on top, a control zone below (move control, HUD, FIRE). Landscape: the same map shown turned a quarter clockwise with the HUD and controls beside it. The layout is chosen from the window size only and can switch mid-level without a reset.

## Files

The game is everything in `www/` (this folder becomes Capacitor's `webDir`). Docs stay in the project root.

- `www/index.html` – canvas, safe-area helper, phone CSS (no zoom, scroll, selection), loads the scripts in order (plain `<script>` tags; a new file must be added there)
- `www/config.js` – `DEBUG`, `GAME_TITLE` / `GAME_SUBTITLE`, `UI_TEXT`, `SAVE`, and every tunable number

Data and shared drawing (loaded first):

- `www/themes.js`, `materials.js`, `ui.js`, `enemies.js`, `levels.js`, `levelgen.js`, `powerups.js`, `shop.js`, `tutorial.js` – themes, tiles, menu parts, enemy types, levels, the level generator, power-ups, the shop and the level 1 hints
- `www/pause.js` – settings, pause button and menu, system pause
- `www/save.js` – localStorage save, records, saved run, checkpoint, the start-up "Continue / New game" screen
- `www/audio.js` – Web Audio sound effects and engine sound (made in code, some from `sounds/`)
- `www/ads.js` – `isRewardedReady()` and `showRewardedAd()`, the only place for an ad SDK (no SDK yet: both answer false)

The game itself (loaded in this order):

- `www/layout.js` – canvas, fixed places on the map, portrait / landscape layout, safe areas, resize, overlay and two-column panel frames
- `www/map.js` – the tile map, current level (hand-made, generated, endless), the DEBUG level check
- `www/state.js` – tanks and counters, `GAME_STATE`, starting / finishing / losing levels and runs
- `www/input.js` – keyboard, joystick / D-pad, fire button, pointer events
- `www/tanks.js` – moving and colliding (all tanks), the player
- `www/enemyai.js` – enemy spawning, driving, shooting
- `www/pickups.js` – coins, the power-up on the field, timed effects
- `www/bullets.js` – bullets and what they hit
- `www/explosions.js` – sparks, blasts, wall rubble, muzzle flash, rings, floating numbers, scorch marks (update and drawing)
- `www/feedback.js` – screen shake, vibration, recoil, the spawn warning star (numbers in `FEEDBACK`, `config.js`)
- `www/render.js` – `draw()`, `cachedPicture()`, shadows, tiles, tanks, everything on the playfield
- `www/hud.js` – the HUD and upgrade badges
- `www/screens.js` – level summary, "LEVEL X" and world intros
- `www/gameover.js` – game over and "CAMPAIGN COMPLETE" screens, the rewarded continue
- `www/controls.js` – drawing the control panel, joystick, D-pad and fire button
- `www/debug.js` – debug keys and tags, layout self-test
- `www/game.js` – `update()`, the game loop, pause on `visibilitychange`, `init()` (loaded last)

Other:

- `www/sounds/` – WAV files; `www/CREDITS.md` – where every non-code asset came from
- `STYLE.md` – the visual style, plus a long reference on how each system works (layout, levels, generator, economy, audio, saving, the continue). **Read it only when doing art/UI work or when you need the details of one of those systems.**
- `CHANGES.md` – what changed in the move to Google Play, and what to test or decide
- `.claude/launch.json` – the local preview server (port 8090, serves `www/`)

## Conventions

- All tunable numbers (speeds, prices, timers, gold, volumes) go in `config.js`. Texts on screen go in `UI_TEXT`.
- `DEBUG` (top of `config.js`) is `false` by default and for every release. Debug keys, tags, logs, warnings, the level check and the layout self-test all check `DEBUG`: with it off, nothing is logged. Any new debug key or log must check it too.
- The game's name is `GAME_TITLE` (+ `GAME_SUBTITLE`) in `config.js`; the page title is set from them at start-up. Don't write the name anywhere else in code.
- Saving: one JSON string in `localStorage` under `SAVE.key` (`tankrush_save_v1`), always in try/catch; a missing or broken save starts the game fresh. The data has its own `version` (`SAVE_VERSION` in `save.js`); when the format changes, raise it and keep reading older versions. Save only on events (`writeSave()`), never per frame.
- Ads: game code never talks to an ad SDK, only to `ads.js`: `isRewardedReady()` (is an ad loaded) and `showRewardedAd()` → `Promise<boolean>`, `true` ONLY when the reward was earned. With no native AdMob (the browser, and for now everywhere) both answer false.
- Continue: only through a rewarded ad. The game over screen's "WATCH AD TO CONTINUE" button is the one caller; with no ad ready it is switched off and reads "AD NOT AVAILABLE". There is no free continue, and a lost run is not kept in the save. The logic is in `gameover.js`, the limit is `REWARDED_CONTINUES_PER_RUN` in `config.js` (default 1, `null` = no limit). The game is paused and muted while an ad shows (`Sound.setAdPlaying`).
- Files: one responsibility per file, plain `<script>` tags in `index.html`, no build step. Keep files under about 50 KB; split by responsibility when one grows past that.
- Size: there is no bundle or file-count limit any more, but keep the app small (target under about 30 MB, Google Play's hard limit is 200 MB). `www/` is about 1.3 MB.
- No Android permissions are needed by the game (ads will add the internet permission through the AdMob plugin).
- Pause: when the page is hidden (`visibilitychange`) the game stops completely, mutes, saves, and opens the pause menu if a level is running. It never resumes by itself.
- Sound: starts only after the first tap. Settings has SOUND (overall), SOUND EFFECTS and ENGINE SOUND, all saved. There is no music yet.
- Offline: no external URLs of any kind (scripts, fonts, images, links). Fonts are system fonts (`sans-serif`).
- Safe areas: `index.html` exposes `env(safe-area-inset-*)` through the `#safe-area` element; `resize()` in `game.js` reads it and `computeLayout()` keeps the playfield, HUD and controls out of it.
- Materials, enemies, levels and themes are data (`materials.js`, `enemies.js`, `levels.js`, `themes.js`); a new one should only need a data entry (and a draw function for a tile). Draw code asks `currentTheme()` for colors.
- Visual changes must not change gameplay, hitboxes or sizes. Cached pictures (`cachedPicture()`), no per-frame gradients or blur, no `Math.random` in decoration.
- Touch, mouse and keyboard all work everywhere; buttons are at least 48 px.
- Keep the code simple and commented. No libraries. Don't add features that weren't asked for.
- Add every new asset that isn't hand-written code to `www/CREDITS.md`.

## Running it

From the project root (needs Python; any static server works):

```
py -m http.server 8090 --bind 0.0.0.0 --directory www
```

Then open `http://localhost:8090` on the computer, or `http://<the computer's Wi-Fi IP>:8090` on a phone in the same network (`ipconfig` shows the IP; allow Python through the Windows firewall when asked). Reload the phone to get new code; if it shows old code, clear the browser's cache for the site. Opening `index.html` as a file doesn't load the sound files: use the server.

Saves are per origin, so the phone and the computer have separate saves. To test with debug tools, set `DEBUG = true` in `www/config.js` (keys and tools are listed under "Debug mode" in `STYLE.md`), and set it back to `false` afterwards.

## Next steps

1. Capacitor 8: `npm init`, add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`; `npx cap init` with `webDir: "www"`; `npx cap add android`. App name, id, icon and splash screen live in the Capacitor/Android project.
2. On a real device, check the safe areas (Android 15+ draws edge-to-edge), pause when the app goes to the background, sound after the first tap, and the Android back button (not handled yet).
3. Signing: create an upload keystore (keep it out of git), build a release `.aab` in Android Studio, enrol in Play App Signing.
4. AdMob: `@capacitor-community/admob` v8 with UMP consent and Google's test ad IDs, used in `ads.js` only (the TODO block at its top has the steps). Until then nobody can continue after a game over.
5. Planned in the game itself: background music (with its own MUSIC setting), more visual polish (see "Still to do" in `STYLE.md`).
