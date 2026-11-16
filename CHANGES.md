# Changes: from the YouTube Playables copy to the Google Play version

## What changed

- **Project layout**: all game files moved into `www/` (`index.html`, the scripts, `sounds/`, `CREDITS.md`). `CLAUDE.md`, `STYLE.md` and this file stay in the root.
- **Deleted**: `AUDIT.md`, `build.py`, `dist/`.
- **SDK removed**: the SDK `<script>` tag and every `ytgame` call are gone (`firstFrameReady`, `gameReady`, `onPause` / `onResume`, audio on/off, `saveData` / `loadData`, rewarded ads, `sendScore`). The game starts by itself. No external URL is left.
- **Saving**: localStorage only, key `tankrush_save_v1` (`SAVE.key`), all in try/catch. The save is read at once on start-up, so the load timeout, the "late save" merge and the waiting saves were removed. The data format is the same plus `settings.sound`. Saves from the Playables version are not carried over (different storage).
- **Pause**: on `visibilitychange` (hidden) the game stops completely, mutes and saves; during a level the pause menu opens, so the player presses RESUME when they come back. No auto-resume.
- **Sound**: new overall **SOUND: ON/OFF** in Settings, saved. SOUND EFFECTS and ENGINE SOUND are still there under it. There is no music in the game, so no Music setting. Audio still starts only after the first tap.
- **Continue on game over**: new `www/ads.js` with `showRewardedAd()` (resolves `true` at once, no ad). The button is now "CONTINUE" with "Retry level X, keep your upgrades" under it, no ad badge. The checkpoint logic, the limit setting, the waiting state, the timeout and the failure messages are unchanged, only reworded ("LOADING...", "NO CONTINUE THIS TIME", "NOT AVAILABLE NOW"). The simulated debug ad (`DEBUG_AD`) and the reward id were removed.
- **Scores**: nothing is sent anywhere any more. Best score and highest level are still saved and shown.
- **Logging**: the game never used the SDK's health logging. All `console.warn` calls for saving, audio and ads now run only with `DEBUG` on; with it off the game logs nothing.
- **Language**: the game never read the SDK language; everything is English, so `navigator.language` wasn't needed.
- **Title**: `GAME_TITLE` (and `GAME_SUBTITLE`) in `config.js` now also set the page title at start-up. The `<title>` in `index.html` is only what shows before the scripts run.
- **Android readiness** (`index.html`): the viewport already blocked zoom and used `viewport-fit=cover` with the safe-area helper; added `position: fixed` and `overscroll-behavior: none` (no bounce, no pull-to-refresh), `theme-color`, and no phone-number detection. Text selection, the long-press menu and double-tap zoom were already off.
- **`.claude/`**: `launch.json` now serves `www/` with Python's own server on port 8090 (it pointed at the old `yt-playables` folder and a temp script). There were no Playables commands or skills inside the project.
- **Docs**: `CLAUDE.md` rewritten and short. The detailed reference (layout, levels, generator, economy, audio, saving, the continue, debug keys) moved to the end of `STYLE.md`, updated.

## Tested in the browser

- Starts from `www/` with no errors, no network requests outside the folder.
- Hiding the page during a level: loop stopped, pause menu open, saved; showing it again: menu still open, game still paused.
- SOUND off: everything muted and saved; on again: sound back.
- Settings page with the new button, portrait (375x812) and landscape (844x390): fits.
- Game over on level 2: "CONTINUE" restarts the level from its checkpoint with 3 lives.
- A broken save starts fresh; a saved run shows "CONTINUE FROM LEVEL 3" with its settings.

## Please test

- On your phone over Wi-Fi: play a level, both orientations, the shop, settings.
- Lock the phone or switch apps mid-level: it should be silent, and show the pause menu when you return.
- Sound: nothing before the first tap; SOUND OFF silences everything, also after a restart.
- Close the browser mid-run and reopen: "Continue from level X" should show.
- Lose on level 2 or later: "CONTINUE" should restart the level with your upgrades.
- Not checked on a real device: the notch / status bar / gesture bar insets. In a normal phone browser they are mostly 0; the real test is inside the Capacitor app (Android 15+ draws edge-to-edge).

## Decide

1. ~~Free continue~~: settled in round 2 below (ad only, 1 per run).
2. **SOUND EFFECTS and ENGINE SOUND**: kept next to the new SOUND switch. Say if you want only the one switch.
3. **`GAME_SUBTITLE`**: kept as a second constant because the start screen draws it on its own plate. If the new name has no subtitle, it needs a small change there.
4. **Android back button**: not handled yet (Capacitor step): open the pause menu, or close it.
5. **A user-level skill `playables-rules`** exists in `C:\Users\roman\.claude\skills` (outside this project, so I left it). It also loads in this project; remove or ignore it.
6. **Port**: 8080 was in use on this computer when I tested, so the preview server and the docs use 8090.

# Round 2: Playables limits removed, continue only through a rewarded ad

## Audit: what was there only because of Playables

| Found | Status |
| --- | --- |
| `build.py`, `dist/`, `AUDIT.md` (the bundle build, its size check and the certification audit) | Already deleted in round 1. No size check, file-count check or build step is left in scripts or docs. |
| Almost all game code in one file, `game.js` (218 KB, 5,300 lines) | **Removed**: split into 16 files, see below. |
| Inlined assets (base64, data URLs) | None found. Sounds are separate WAV files, all art is drawn in code. |
| A free continue (the Playables ad was replaced by a stub that always gave the reward) | **Removed**, see below. |
| Load-time notes for slow networks (sound files measured on 3G) in `STYLE.md` | Reworded: the files are inside the app now. |
| Sounds made in code, with files replacing only 5 effects and the engine; no music | Kept as it is: it works, and it is also the fallback until the files are decoded. Nothing stops adding more files or music now (planned). |
| `SAVE.maxBytes` (500 KB) | Kept: a safety check for localStorage, not a platform limit. |
| System fonts, no external URLs | Kept: Google Play needs everything bundled and offline too. |

Nothing else was cut or simplified for size that I could find in the code or the docs.

## Code structure

`game.js` is now 16 files, loaded by plain `<script>` tags in this order: `layout.js`, `map.js`, `state.js`, `input.js`, `tanks.js`, `enemyai.js`, `pickups.js`, `bullets.js`, `explosions.js`, `render.js`, `hud.js`, `screens.js`, `gameover.js`, `controls.js`, `debug.js`, `game.js` (`CLAUDE.md` says what is in each). The biggest is `layout.js` (30 KB); no file in `www/` is over 50 KB (`materials.js` is 46 KB, one topic, left whole).

The code was moved, not rewritten: every line of the old `game.js` is in exactly one new file, in the same relative order, so nothing behaves differently. Comments in the other files and in `STYLE.md` that said "in `game.js`" now name the right file. No build step, no libraries; all numbers are still in `config.js`.

## Continue only through a rewarded ad

- `www/ads.js`: `isRewardedReady()` and `showRewardedAd()` → `Promise<boolean>`, true ONLY when the reward was earned. With no native AdMob both answer false. A TODO block at the top lists the plan: `@capacitor-community/admob` v8, UMP consent first, Google's test ad IDs. Nothing was installed.
- Game over screen: the continue button is "WATCH AD TO CONTINUE" (with the small ad badge). While no ad is ready it is switched off and reads "AD NOT AVAILABLE" / "No continue right now": taps and the keyboard skip it, and "START OVER" is the gold button. That is what the browser always shows.
- The free continue is gone, including a hidden one: a lost run used to stay in the save, so closing the game on the game over screen and reopening it gave "Continue from level X" for free. Now a lost run is dropped from the save. After an earned continue the run is saved again, with the continue counted.
- `REWARDED_CONTINUES_PER_RUN` is now 1 (was no limit).
- Audio: while the ad is asked for and shown the game is paused and all sound is muted (`Sound.setAdPlaying`), and it comes back with the answer. This was already there and is unchanged.
- Texts (`UI_TEXT.gameOver`): `watchAd`, `adNotAvailable`, `adNotAvailableSub` are new; "LOADING AD...", "NO REWARD THIS TIME".

## Tested in the browser

- Loads with all 30 scripts and no console errors; level 1 plays (driving, shooting, enemies spawning).
- Game over on level 2, portrait and landscape: "AD NOT AVAILABLE" switched off, "START OVER" works by tap and by Enter. Level 1 still has only "START OVER".
- With a pretend ad swapped in from the console (not in the code): answer false → "NO REWARD THIS TIME", no continue, sound back on; answer true → level restarts with 3 lives, the continue counted and saved; the next game over in that run has no continue button.
- Not tested: a real ad (there is none yet), and a real phone. The landscape screen with the button switched off was checked by its positions and sizes, not by eye.

## Please test / decide

1. Until AdMob is in, nobody can continue after a game over (also in the Android app). That is what was asked for; just be aware when you play-test.
2. Closing the app in the middle of a level still brings you back to the shop before that level (as before). It is not a continue, but it does let a player escape a level that is going badly. Say if you want that changed.
