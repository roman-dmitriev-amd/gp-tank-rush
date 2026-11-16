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

1. **Free continue**: with no ad, "CONTINUE" is free and has no limit (`REWARDED_CONTINUES_PER_RUN = null`), so a run can't really be lost from level 2 on. Fine for testing; before release without ads, set a number (for example 1-3) or wait for AdMob.
2. **SOUND EFFECTS and ENGINE SOUND**: kept next to the new SOUND switch. Say if you want only the one switch.
3. **`GAME_SUBTITLE`**: kept as a second constant because the start screen draws it on its own plate. If the new name has no subtitle, it needs a small change there.
4. **Android back button**: not handled yet (Capacitor step): open the pause menu, or close it.
5. **A user-level skill `playables-rules`** exists in `C:\Users\roman\.claude\skills` (outside this project, so I left it). It also loads in this project; remove or ignore it.
6. **Port**: 8080 was in use on this computer when I tested, so the preview server and the docs use 8090.
