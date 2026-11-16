# Playables certification audit: Tank Rush: Base Defense

Date: 2026-11-04. Audited at commit `acb6669`; the three convention warnings were fixed afterwards (see "Project conventions"). Build: `py build.py`, then `dist/` was audited: now 22 files, 1168.3 KiB in all, 485.7 KiB before `gameReady()` (plus the SDK), largest file `sounds/engine_loop.wav` 344.6 KiB, "All checks passed".
Format: `STATUS | ID | evidence | fix size`. Line numbers are from the audited commit.

## Scan of the built JS (`dist/*.js`, `dist/index.html`)
No libraries are bundled: every hit is the game's own code.
- navigator.language / Intl / toLocale: none
- visibilitychange / document.hidden / pagehide / blur / focus listeners: none
- Worker, eval(, new Function, WebAssembly, string timers: none (the only `setTimeout` is the simulated ad, which runs only with DEBUG, game.js:108)
- fetch: only relative `sounds/` files (audio.js:272, `SOUND_FILES.folder` config.js:384); no XHR, WebSocket or sendBeacon
- External URLs: only the SDK `<script>` (index.html:15)
- localStorage: only outside Playables (save.js:73, save.js:85); no sessionStorage, IndexedDB or cookies
- clipboard, vibrate, fullscreen, screen.* and orientation APIs: none

## INT: integration (SDK)
PASS | INT-1.1 | the SDK `<script>` comes before every game script (index.html:15) | -
PASS | INT-2.1 | `firstFrameReady()` runs after the loading screen is drawn (game.js:5417-5422) | -
PASS | INT-2.2 | `gameReady()` is sent once (game.js:1039-1042) | -
PASS | INT-2.3 | sent after the "LEVEL 1" intro or when the continue screen shows, never on the loading screen (game.js:1033, game.js:5427) | -
PASS | INT-3.2 | `{ value }` is a whole number ≥ 0 (game.js:123) | -
PASS | INT-3.3 | `updateRecords()` runs first, and `submitScore()` holds the score until the save has loaded (save.js:164-166, save.js:378-381) | -
PASS | INT-4.1 | `saveData` on shop open, level end, game over, a settings change and onPause (save.js:66) | -
PASS | INT-4.2 | inside Playables only `ytgame.game.saveData`/`loadData`; localStorage only without the SDK (save.js:47-49) | -
PASS | INT-4.3 | nothing is saved before `progress.loaded`; a waiting save is written after the load (save.js:369-370) | -
PASS | INT-4.4 | every `version` ≥ 1 loads, and each field is checked on its own (save.js:96-100) | -
PASS | INT-4.5 | saves are kept across versions (`SAVE_VERSION` 1; fields added later fall back to defaults) | -
PASS | INT-4.6 | auto-saves at the shop, level end and game over | -
MANUAL | INT-5.1 | Web Audio follows the system's audio output. Test: an iPhone with the silent switch on, in the YouTube app | -
PASS | INT-5.3 | Web Audio follows the device volume; nothing sets the system volume | -
PASS | INT-5.2 | `isAudioEnabled()` + `onAudioEnabledChange` (audio.js:73-89) | -
PASS | INT-5.4 | sound only after a tap; no sound on the first intro (audio.js:139-164) | -
PASS | INT-5.5 | `isEnabled()` = YouTube audio and no ad playing; the in-game settings can only turn sound off (audio.js:104-106, audio.js:750) | -
PASS | INT-5.7 | no overall mute: only SOUND EFFECTS and ENGINE SOUND | -
PASS | INT-5.8 | separate sound-effects and engine settings (pause.js) | -
PASS | INT-6.1 | onPause stops the loop and input, suspends audio and stops downloads; resizes wait for the resume (pause.js:81-93, audio.js:792-808, game.js:293) | -
PASS | INT-6.2 | only `ytgame.system.onPause`/`onResume` (game.js:5197-5201); the scan found no visibility, blur or focus use | -
PASS | INT-6.3 | onPause calls `writeSave()` (game.js:5199) | -

## DES: design
PASS | DES-1.1 | resize and ResizeObserver (game.js:569-570); portrait, side and overlay layouts; the DEBUG self-test passes all 15 sizes | -
PASS | DES-1.2 | the canvas fills the viewport (100dvw/100dvh, index.html:24-25) | -
PASS | DES-1.3 | the playfield is centered with themed margin art (`drawMargins()`) | -
PASS | DES-1.4 | no orientation or posture lock (scan) | -
PASS | DES-1.5 | a resize only lets go of the input (`releaseForNewLayout()`) | -
PASS | DES-2.1 | pointer events cover touch (game.js:1607-1769) | -
PASS | DES-2.2 | the same pointer events cover the mouse, plus the wheel for scrolling | -
PASS | DES-2.3 | input is handled at once; end screens ignore taps for 1 s (`BUTTON_DELAY`, game.js:63) so a tap from play doesn't press a button by mistake | -
MANUAL | DES-2.4 | Test: every screen (loading, continue, shop, pause, settings, summary, game over, campaign complete) with touch and mouse, in portrait and landscape | -
PASS | DES-2.5 | arrow keys, Space, Enter, Escape (game.js:1264-1330) | -
PASS | DES-2.6 | Escape opens and closes the pause menu and settings (game.js:1276, pause.js:383) | -
PASS | DES-2.7 | Escape is never `preventDefault`-ed (pause.js:388, game.js:1276-1279) | -
N/A | DES-2.9 | no haptics | -
PASS | DES-3.1 | the canvas uses devicePixelRatio and cached pictures are redrawn per ratio (game.js:307, game.js:3208) | -
MANUAL | DES-4.2 | Developer Portal: no branding or logos in the thumbnail, title or description | -
PASS | DES-5.1 | game over screen and "CAMPAIGN COMPLETE"; endless mode after that | -
PASS | DES-6.1 | no sharing | -
PASS | DES-6.2 | no links | -
PASS | DES-6.3 | no agreements | -
PASS | DES-6.4 | the pause button is a gear, not a close, mute or menu icon (pause.js `gearPath()`) | -
PASS | DES-6.5 | no exit button | -

## A11Y: accessibility
PASS | A11Y-1.1 | buttons ≥ 48 px (`buttonHeight()`, game.js:261), pause tap area ≥ 48 px, greyed-out text kept at 4.5:1 (game.js:4392) | -
MANUAL | A11Y-2.1 | Developer Portal: choose accurate accessibility tags (touch, mouse and keyboard; sound not needed to play) | -

## I18N: internationalization
N/A | I18N-1.1 | `getLanguage()` isn't used (English only) | -
PASS | I18N-1.2 | no browser locale APIs (scan) | -
PASS | I18N-2.1 | English (`UI_TEXT`, config.js) | -

## MON: monetization
PASS | MON-1.1 | no off-platform monetization | -
PASS | MON-1.2 | rewards are in-game retries only | -
PASS | MON-1.3 | rewards only work in the game | -
PASS | MON-1.4 | nothing can be traded | -
PASS | MON-2.1 | only `ytgame.ads.requestRewardedAd` (game.js:114) | -
PASS | MON-2.2 | `Sound.setAdPlaying(true)` while the ad loads or plays (game.js:1932) | -
PASS | MON-2.3 | `isPaused()` while waiting; an answer during a system pause waits for onResume | -
PASS | MON-2.4 | no other ad services | -
MANUAL | MON-2.5 | Developer Portal: turn on monetization (rewarded ads are used) | -
PASS | MON-RW | only from the "RETRY LEVEL X" button with an ad badge and "Watch an ad..."; never automatic; "START OVER" is always there; 90 s give-up (game.js:1924, game.js:1833) | -
N/A | MON-INT | no interstitial ads | -
MANUAL | MON-4.1 | Developer Portal: check the title, description and images are advertiser-friendly (cartoon tank combat, no gore) | -
PASS | MON-3.1 | no in-app purchases | -

## PRIV: privacy and data
PASS | PRIV-1 | no personal data collected; the reward ID carries no user data | -
PASS | PRIV-3a | only the SDK script and relative sound files (scan) | -
PASS | PRIV-3b | nothing works around blocking | -
PASS | PRIV-3c | nothing looks like a QR code | -
PASS | PRIV-4.1 | no clipboard use | -
PASS | PRIV-4.2a | no personal info asked for | -
PASS | PRIV-4.2b | no login or account screens | -
PASS | PRIV-5a | the code is not obfuscated or minified | -
PASS | PRIV-6/7 | no WebAssembly, eval, new Function or workers | -
PASS | PRIV-8 | one `index.html`, one canvas | -

## STAB: stability and performance
PASS | STAB-1 | 484.8 KiB before `gameReady()` | -
PASS | STAB-2 | 1166.4 KiB in all; sound files load in the background after the first tap | -
PASS | STAB-3 | largest file 344.6 KiB (< 512 KiB) | -
PASS | STAB-4 | saves are capped at `SAVE.maxBytes` 500 KiB (save.js:62); a real save is under 2 KiB | -
MANUAL | STAB-5 | start-up waits up to 3 s for `loadData` (`SAVE.loadTimeout`), then the 1.5 s "LEVEL 1" intro runs before `gameReady()`. Test: time it from a cold start in the YouTube app on a mid-range phone | -
MANUAL | STAB-6 | Test: play 10+ levels plus endless with DevTools Memory open; the heap should stay flat and far under 512 MB | -
PASS | STAB-7 | standard APIs (Canvas 2D, Web Audio with a webkit fallback); WAV files are 16-bit PCM, 44.1 kHz mono, which iOS plays | -
PASS | STAB-8 | relative paths only (`build.py` checks) | -
PASS | STAB-9 | file names use only letters, digits, `_`, `-`, `.` (`build.py` checks) | -
PASS | STAB-10 | 21 files | -

## TS: trust and safety
PASS | TS-1.1 | cartoon tank combat, no gore or hateful content | -
MANUAL | TS-1.2 | Developer Portal: audience not "made for kids"; the content suits 13+ | -
MANUAL | TS-1.3 | Developer Portal: the title, thumbnail and description match the game | -
MANUAL | TS-2.2 | all code and art are original (CREDITS.md); check no existing Playable is substantially the same | -
MANUAL | TS-2.3 | the genre is inspired by classic 8-bit tank games: check "Tank Rush" isn't someone else's trademark and the look isn't a copy | -
PASS | TS-2.4 | no music; the level tune is made in code | -
PASS | TS-2.5 | no real names or likenesses | -
MANUAL | TS-3 | don't share the Developer Portal dev/staging links outside certification testing | -

## Project conventions
PASS | CONV-DEBUG | `DEBUG = false` (config.js:11), `GENERATED_MODE = false` (config.js:512); `build.py` forces `DEBUG` off; debug code checks `DEBUG` | -
PASS | CONV-CONFIG | fixed: the player, enemy, bullet, screen, shop and tutorial tunables (from game.js:17-63, game.js:992, game.js:2211, shop.js:186-188, tutorial.js:14-17) moved, unchanged, into a new config.js section "Player, enemies, bullets and screen timings" | -
PASS | CONV-CREDITS | fixed: `build.py` copies CREDITS.md into dist/ and fails the build if it's missing | -
PASS | CONV-CLAUDE | fixed: CLAUDE.md now says every button is at least 48 px in portrait too (`buttonHeight()`); the config.js and build sections are updated | -

## Summary
- FAIL: none.
- WARN: none (the three convention warnings are fixed).
- MANUAL in play: INT-5.1 (iPhone silent switch), DES-2.4 (every screen, touch and mouse), STAB-5 (cold start < 5 s), STAB-6 (memory over a long session).
- MANUAL in the Developer Portal: DES-4.2, A11Y-2.1, MON-2.5, MON-4.1, TS-1.2, TS-1.3, TS-2.2, TS-2.3, TS-3. Run YouTube's Playables bundle analyzer on the zip too.
