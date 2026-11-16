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

# Round 3: quality pass (from QUALITY_PLAN.md)

## Summary

Four parts, each tested in the browser and committed on branch `claude/tank-rush-android-d11322`:

0. **Feel and speed**: shot, hit, pickup and explosion feedback; the load-time error fixed; the map's floor and walls drawn once instead of every frame; at most 2 real pixels per CSS pixel.
1. **Front door and flow**: a title screen, chiptune music made in code with a MUSIC setting, fades between screens, a level summary that counts up.
2. **Difficulty**: enemies that seek and aim more with each level, more of them at once, a new gunner tank from level 11, a HOLD TO FIRE setting, and a level select that only exists with `DEBUG = true`. Level 1 is unchanged.
3. **Final check**: the full run below. `DEBUG` is `false`.

Of the 25 proposals in `QUALITY_PLAN.md`, 13 are done (1, 2, 4-13, 22), one partly (3: no frame-time meter) and one deliberately not (15: tank treads). Open: 14, 16-21, 23-25.

What I could not check, and you should: how the music sounds and how loud it is, whether the new difficulty is fun, and everything that needs a real phone (the list at the end).


## Part 0: quality pass 1 finished

- **Feedback effects** (plan items 1, 2, 5, 6, 7): muzzle flash, recoil, bullets as a streak with a tail, screen shake of the playfield only, a saved VIBRATION setting, a blinking star on the spawn point before an enemy appears, a ring when the player comes back, sparks on every hit, floating gold and score numbers, a ring on a power-up, and wall tiles that break into dust and pieces in their own colors. The numbers are in `FEEDBACK` (`config.js`); the code is in `www/feedback.js` (new) and `www/explosions.js`.
- **Load error fixed**: "portraitHudLayout is not defined". The `ResizeObserver` in `layout.js` fired while later scripts were still loading. The resize listeners are now switched on by `init()` (`watchResize()`), when everything is loaded.
- **Static map** (item 4): the floor (ground, sand, ice) and the walls with their shadows are kept as two playfield-sized pictures and painted again only when a tile, the theme or the playfield's size or place changes (`refreshStaticMap()` in `render.js`, `mapSignature()` in `map.js`). Water, scorch marks, the vignette and everything that moves are still drawn each frame. `VISUALS.cacheStaticMap = false` switches back to the old tile-by-tile drawing.
- **Pixel ratio cap** (item 3): the canvas, the tile size and the cached pictures use at most 2 real pixels per CSS pixel (`VISUALS.maxPixelRatio`, `pixelRatio()` in `layout.js`).

Tested in the browser:

- No console errors on load, portrait (412x915) and landscape (1024 wide).
- The cached map against the old drawing, whole canvas compared pixel by pixel on levels 1, 3 (also with cracked bricks, a scorch mark and the broken base), 7, 10, 13, 17 and 20: the largest difference is 2 out of 255 on one color channel (rounding where shadows are mixed), which can't be seen.
- Drawing a frame of level 10 on this computer: 1.8 ms before, 0.5 ms with the static map.
- The pixel ratio cap could not be seen at work here (this screen's ratio is 1.5, under the cap).

## Part 1: title screen, music, fades, counting summary

- **Title screen** (`www/title.js`, new): shown on every launch with `GAME_TITLE` / `GAME_SUBTITLE`, the best score and PLAY. With a saved run it has "CONTINUE FROM LEVEL X" and "NEW GAME" instead (this was the old continue screen, moved out of `save.js`). The texts are in `UI_TEXT.title`. The first tap there starts audio, so the "LEVEL 1" fanfare is heard now.
- **Music** (`www/music.js`, new; plan item 8): two chiptune loops written as note data and made in code: "menu" (D major, calm; title screen, shop, campaign complete) and "battle" (a D minor march, 16 bars; during a level). Each is rendered once into a sound buffer in the background after the first tap and then played as one looping buffer. Silent before the first tap, while paused (pause menu, ad, app hidden: it goes on from the same place) and during the intros, the summary and game over, where the jingles play. Volume, speeds, the mix and which screen plays what are in `MUSIC` (`config.js`).
- **MUSIC: ON/OFF** in Settings, under SOUND. Saved as an optional field (`settings.music`); older saves load with music on. SOUND off silences music too.
- **Fades** (item 10): on every change of screen the old screen fades out over the new one (0.25 s; 0.12 s for the pause menu and its pages), `TRANSITION` in `config.js`, code in `screens.js`. The new screen works from the first moment.
- **Counting level summary** (item 11): the rows appear one by one with a tick, then the two gold totals count up with a coin sound. A tap anywhere or Enter shows everything at once; CONTINUE works when it is all there. `SUMMARY` in `config.js`.
- **Tank treads (item 15): not done**, see "Decisions I made".

Tested in the browser (the preview window was in the background, so frames were stepped from the console; clicks were real):

- Title: PLAY starts the "LEVEL 1" intro; with a saved run the two buttons show and CONTINUE opens the shop. Portrait 412x915 and landscape.
- Music: after the first click both loops were rendered; "battle" plays in a level and there is signal on the music bus; it stops with the pause menu, with MUSIC off and with SOUND off, and comes back each time; the shop switches to "menu".
- Summary: rows fade in in order, the totals count ("+90" on the way to "+154"), a tap skips, CONTINUE works after. Portrait and landscape (844x390).
- Settings with 7 switches: portrait fits; landscape 844x390 fits in two columns (4 + 3), every button 48 px.
- No console errors.
- **Not checked: how the music sounds.** I can't listen to it. The notes are written by rule (chords, a melody on chord notes), so it should be in tune, but whether it is pleasant, and how loud it is against the effects, needs your ear.

## Part 2: difficulty (plan items 12, 13, 22)

All numbers are in `DIFFICULTY` and `CONTROLS` (`config.js`) and in `enemies.js`. Level 1 has none of the new rules.

- **Seeking** (item 12): each time an enemy picks a new direction there is a chance it heads for the base or the player (half and half) instead of picking at random: 3% per level after the first, at most 45%. Fast tanks do it less (x0.6), heavy tanks more (x1.3). It never drives at water or the map's edge.
- **Aimed shots** (item 12): from level 3 an enemy that finds the player or the base straight ahead (up to 10 tiles) shoots after a short reaction time instead of waiting for its random time. Once per sighting, so it is not a machine gun. Fast tanks don't aim.
- **More enemies, sooner** (item 13): 3 on the field at once up to level 6, 4 from level 7, 5 from level 15; the time between spawns falls from 1.5 s to 0.9 s.
- **Gunner** (item 13): a new violet enemy from level 11 (worlds 3 and 4, and endless): 2 hits, fires two shots in a row, 250 points, 18 gold. A rule turns some of a level's basic tanks into gunners (`DIFFICULTY.gunners`), so `levels.js` is unchanged. Data and colors only, drawn by the same tank painter.
- **The old scaling stays**: enemy speed (+1.5% per level, at most +25%) and fire rate.
- **Controls** (item 22): a new **HOLD TO FIRE** setting (off by default, saved): while FIRE or Space is held the tank keeps firing, at least 0.28 s apart. The joystick's and the cross's dead zones are numbers in `CONTROLS`. Each shot the player fires gives a 10 ms vibration tick (VIBRATION setting).
- **DEBUG level select**: with `DEBUG = true` the title screen has "LEVEL -", "LEVEL +" and "DEBUG: START LEVEL n" (up to 20 levels into endless). With `DEBUG = false` the buttons don't exist.
- **Economy**: prices are unchanged. Gunners pay 18 gold where a basic tank paid 8, so levels 11-20 give 20 to 50 gold more each.

### What got harder, level by level

"Seeking chance" is for a basic tank. Endless levels (21 and up) use the level 20 row with 5 gunners.

| Level | Enemies at once | Seconds between spawns | Seeking chance | Aimed shot after | Gunners | New on this level |
|---|---|---|---|---|---|---|
| 1 | 3 | 1.5 | 0% | - | 0 | nothing: as before |
| 2 | 3 | 1.5 | 3% | - | 0 | more seeking |
| 3 | 3 | 1.5 | 6% | 1 s | 0 | more seeking, aimed shots start |
| 4 | 3 | 1.35 | 9% | 1 s | 0 | faster spawns, more seeking |
| 5 | 3 | 1.35 | 12% | 1 s | 0 | more seeking |
| 6 | 3 | 1.35 | 15% | 1 s | 0 | more seeking |
| 7 | 4 | 1.35 | 18% | 1 s | 0 | 4 at once, more seeking |
| 8 | 4 | 1.2 | 21% | 0.7 s | 0 | faster spawns, more seeking, quicker aimed shots |
| 9 | 4 | 1.2 | 24% | 0.7 s | 0 | more seeking |
| 10 | 4 | 1.2 | 27% | 0.7 s | 0 | more seeking |
| 11 | 4 | 1.2 | 30% | 0.7 s | 2 | more seeking, first gunners |
| 12 | 4 | 1.05 | 33% | 0.7 s | 2 | faster spawns, more seeking |
| 13 | 4 | 1.05 | 36% | 0.7 s | 3 | more seeking, 3 gunners |
| 14 | 4 | 1.05 | 39% | 0.5 s | 3 | more seeking, quicker aimed shots |
| 15 | 5 | 1.05 | 42% | 0.5 s | 3 | 5 at once, more seeking |
| 16 | 5 | 0.9 | 45% | 0.5 s | 4 | faster spawns, more seeking, 4 gunners |
| 17 | 5 | 0.9 | 45% | 0.5 s | 4 | - |
| 18 | 5 | 0.9 | 45% | 0.5 s | 4 | - |
| 19 | 5 | 0.9 | 45% | 0.5 s | 4 | - |
| 20 | 5 | 0.9 | 45% | 0.5 s | 3 | 3 gunners |

### How much harder it is

I can't play-test, so I measured one thing: with the player standing still, how many seconds until the enemies destroy the base (10 runs each, old rules against new):

| Level | Old | New |
|---|---|---|
| 1 | 61 s | 53 s (no rule changed; this is the spread between runs) |
| 5 | 58 s | 55 s |
| 8 | 49 s | 43 s |
| 10 | 36 s | 25 s |
| 13 | 33 s | 24 s |
| 16 | 26 s | 16 s |
| 20 | 85 s | 50 s |

So the first world is about as before, the middle of the game presses the base about a quarter harder, and the last world about 40% harder. Whether that is fun with a real player is for you to judge: every number is one line in `DIFFICULTY`.

Tested in the browser: 90 simulated seconds each on levels 1, 7, 12, 16, 20 and 23 (endless) with no errors, the right number of enemies at once, gunners appearing and firing bursts; the shop's "next level" panel with four tank types in portrait (360x800) and landscape (800x360); the settings page with 8 switches fits at 360x800 without scrolling; HOLD TO FIRE gives 5 shots in 3 seconds; the level select starts level 13 with its world banner.

## Part 3: final check

One run in the browser with `DEBUG = true` (for the level select), portrait 412x915 unless said. The preview window was in the background, where the browser stops the game's own frame loop, so I stepped the frames from the console; taps on PLAY and the pause button were real clicks, other buttons were pressed through the game's own tap functions.

- Title screen: PLAY (real click) starts the "LEVEL 1" intro, then level 1 plays and the battle music is on.
- Pause button (real click): menu opens, game time stands still, music stops. RESUME: the game and the music go on.
- Settings: SOUND, MUSIC and VIBRATION switched off, page reloaded: all three still off. Switched back on.
- Game over on level 2 (base destroyed): "AD NOT AVAILABLE / No continue right now" is switched off, pressing it does nothing, "START OVER" is the gold button and starts level 1 with 3 lives. The lost run is not in the save.
- Rotating during level 1 (412x915 to 915x412 and back): same enemies, same broken bricks, same player position, still playing, the playfield turned.
- Level select: levels 6 (jungle), 11 (desert), 16 (snow) and 20 for 40 simulated seconds each: the right world, 3 / 4 / 5 / 5 enemies at once.
- Endless: level 21 ("Endless 21") starts and plays, with gunners.
- No errors or warnings in the console in the whole run; the layout self-test passes all 15 sizes; the level check warns about nothing.
- `DEBUG` set back to `false`; without it the title screen has only PLAY.

## Decisions I made

- **"Work directly in this folder (no worktree)"**: the session was already running in the worktree folder `.claude/worktrees/tank-rush-android-d11322` on branch `claude/tank-rush-android-d11322`, so I kept working there and pushed that branch. `main` in the project's root folder is untouched; merge the branch (or its pull request) to get the work there.
- **Spawn warning**: the first enemy of a level now appears 0.8 s after the level starts (it used to appear at once), so it gets its warning star too. All other spawn timing is as before.
- **VIBRATION** needs Android's VIBRATE permission in the Capacitor project later (given at install, no prompt). It is an optional save field: `SAVE_VERSION` stays 1 and older saves load with vibration on.
- **Static map check**: instead of marking every place that changes a tile, the map's 273 tiles are summed into one number each frame and compared. It costs almost nothing and can't miss a change.
- **Title screen**: I reused the old "Continue / New game" screen as the title screen instead of adding a second screen in front of it, so there is one tap, not two, between launch and play.
- **Music placement**: no music during the "LEVEL X" intro, the level summary and game over, because the fanfare and jingles play there and two tunes at once sound wrong. The battle tune starts over at each level; after a pause it goes on where it stopped.
- **Music is rendered, not played live**: about 1.2 MB of memory per loop at 22 kHz mono, in exchange for almost no work while playing.
- **Tank treads (item 15) not done**: the tread lines are part of each tank picture. Moving them means painting the track area again, which changes the sprite, and you asked for that not to happen. Dust or track marks would be a different effect, so I left the item open in QUALITY_PLAN.md.
- **Summary button**: CONTINUE now also waits for the count to finish (about 2 s), unless a tap skips it. The 1 s button delay is unchanged.
- **Gunners by rule, not in `levels.js`**: your hand-made enemy lists stay as they are; `withGunners()` in `map.js` swaps some basic tanks. Set `DIFFICULTY.gunners` to `[[1, 0]]` to have none.
- **Gunner color**: violet, because grey, red and dark steel are taken, blue is the player's shield and green would vanish on grass.
- **"Joystick dead-zone and size setting"**: I made the dead zones config numbers and added no size setting. The joystick's size comes from the layout (it is as big as its part allows), and a ninth switch would not fit the settings page on small phones without scrolling.
- **HOLD TO FIRE is off by default**, because it makes the game easier.
- **Aimed shots only once per sighting** and **fast tanks neither aim nor seek much**, to keep some of the old random feel and leave the player room to dodge.
- **Records while testing**: my test runs wrote best scores into the browser's save for `localhost:8090`; I cleared that save at the end. Your phone's save is separate and untouched.

## TEST ON PHONE

1. **Music**: does each tune sound right (title screen and shop; during a level)? Is it quiet enough under the shots? `MUSIC.volume` and `MUSIC.mix` in `config.js`. If you don't like a tune, the notes are in `TUNES` in `music.js`.
2. **First tap**: nothing sounds before PLAY; after it the fanfare and then the music start.
3. **Pause and background**: lock the phone or switch apps during a level: silence at once; back in the game the pause menu shows and the music goes on only after RESUME, from where it stopped.
4. **Vibration**: needs the VIBRATE permission once the Capacitor project exists. Check the tick on each shot, the buzz on losing a life and the base, and that VIBRATION: OFF stops all of it.
5. **Screen shake**: strong enough to feel, never enough to disturb aiming (`FEEDBACK.shake`).
6. **Speed**: on your slowest phone, levels 10 and 20 with many explosions. If it stutters, tell me the phone; the next step would be a frame-time meter (plan item 3).
7. **Sharpness**: on a phone with a very dense screen the picture is now drawn at ratio 2. If it looks soft, raise `VISUALS.maxPixelRatio`.
8. **Difficulty**: level 1 (easy?), then 7, 11 and 16 from a normal run with shop upgrades. Too hard or too easy: the tables in `DIFFICULTY`.
9. **HOLD TO FIRE**: switch it on in Settings and hold FIRE.
10. **Rotate** the phone in the middle of a level, on the title screen and on the level summary while it counts.
11. **Settings page** in both orientations: 8 switches and BACK, all reachable.
12. **Saved run**: close the app in the shop and open it again: the title screen offers "CONTINUE FROM LEVEL X".

