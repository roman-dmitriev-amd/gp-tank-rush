# Quality plan

A review of the game as it is now (code read, not measured on a phone), with proposals ordered by impact against effort: the best value first. No code was changed.

- **Effort:** S = up to half a day, M = one or two days, L = several days.
- **ART CHANGE** = the proposal changes or replaces a picture you already drew. Everything else only adds new things next to your art.
- Performance numbers are estimates from the code. Proposal 3 measures them before anything is optimized.

## What is already good

The tile, tank and menu art, the tank blast (fire, smoke, pieces, scorch mark), the layout system and the audio chain are at release quality. The gaps are in **feedback around the action** (firing, hits, spawns and pickups have almost no visual response), **music** (none), **transitions** (every screen is a hard cut), **the difficulty curve** (enemies never get smarter or more numerous) and **frame cost on cheap phones** (the whole map is redrawn every frame).

## Proposals

### 1. Shot feedback: muzzle flash, recoil, bullet with a trail — ART CHANGE (bullets only)
- **What:** A short flash at the cannon tip when any tank fires (a cached glow, 60–80 ms), the tank's picture drawn 1–2 px back for a few frames, and bullets drawn as a short bright streak with a faint tail instead of a plain outlined dot. Positions and hitboxes stay as they are.
- **Why:** Firing is the most repeated action in the game and today it has no visual response at all. This is the biggest change in feel for the least work.
- **Effort:** S. **Risk:** Low. The bullet is the only existing picture that changes.

### 2. Screen shake and vibration
- **What:** A small decaying shake of the playfield only (not the HUD or controls) on tank blasts, bigger for the player's death and the base. A short vibration on the player's death, armor break and base loss. One new setting, VIBRATION, and shake strength in `config.js`.
- **Why:** Explosions look good but carry no weight. On a phone, vibration is half of "impact".
- **Effort:** S. **Risk:** Low. Vibration in the Android app needs the VIBRATE permission (granted at install, no prompt), which changes the "no permissions" rule in CLAUDE.md. Shake must stay small so aiming is never disturbed.

### 3. Frame-time meter and a cap on drawing resolution
- **What:** A DEBUG-only frame-time readout (average and worst frame), then a cap on the canvas pixel ratio (for example 2) so phones with a ratio of 2.6–3 draw far fewer pixels.
- **Why:** The canvas is created at the full device pixel ratio (`resize()` in `layout.js`). A cheap 720p phone is fine, but a cheap 1080p phone with a weak GPU fills about 2.5 million pixels several times over per frame. Nothing can be tuned sensibly until this is measured on a real low-end device.
- **Effort:** S. **Risk:** Low. Slightly softer picture on capped phones; the tile size must stay on whole device pixels.

### 4. Draw the static map once, not every frame
- **What:** Paint ground, ground shade, sand, ice, still water, wall shadows, walls and the vignette into one playfield-sized picture, repainted only when a tile changes (a brick breaks, fortify, base steel) or the theme or size changes. Per frame: one copy, then water ripples, scorch marks and everything that moves.
- **Why:** Each frame now makes roughly 700–1000 `drawImage` calls for things that did not change: 273 ground tiles, a shadow per wall, every tile, plus two clip paths built from every forest tile. This is the largest performance cost in the game.
- **Effort:** M. **Risk:** Medium. The layer order (scorch marks under walls, the fortify blink) must come out identical, and a missed repaint would show a stale tile. Needs a careful before/after check in every theme.

### 5. Enemy spawn warning and player respawn effect
- **What:** A blinking marker at the spawn point for about 0.8 s before an enemy appears (the delay comes out of the existing spawn delay, so pacing is unchanged), and a short flash or ring when the player's tank comes back.
- **Why:** Enemies currently pop into existence, which reads as unfair when you are near the top row, and the classic genre has this for a reason.
- **Effort:** S. **Risk:** Low. If the marker time is added on top of the spawn delay instead, levels get slightly easier.

### 6. Hit and pickup feedback
- **What:** Sparks on every bullet impact (brick and concrete included, today only on walls that deflect), a spark where two bullets cancel, a small gold sparkle and a floating "+8" when a coin is taken, floating score on a kill, and a ring in the power-up's color when one is picked up.
- **Why:** Coins, power-ups and bullet-on-bullet hits are sound-only today. Players need to see what they earned.
- **Effort:** S–M. **Risk:** Low. Floating text must stay small and short so it never hides bullets.

### 7. Brick break with debris — ART CHANGE
- **What:** Replace the three growing circles used for a destroyed brick, concrete or metal tile with a small dust puff and 4–6 pieces in the tile's theme colors, built from the same parts as the tank blast.
- **Why:** STYLE.md already notes that brick explosions "keep the old simple look". It is the weakest effect and it plays constantly, right next to the best one.
- **Effort:** S. **Risk:** Low. Must stay much smaller and shorter than a tank blast so the field stays readable.

### 8. Background music
- **What:** Music with its own MUSIC setting: one menu/shop loop and one battle loop (ideally a variation per world), fading under the level jingles and stopping with the existing pause and ad rules.
- **In code:** A small step sequencer on the existing `melody()` / `heldNote()` helpers can make a chiptune-style military march. Costs no file size. It will sound "retro", not orchestral, and I can only write simple tunes. Each loop can be rendered once into a sound buffer at start-up, so playing it costs almost nothing on a slow phone.
- **Rendered to files:** The same code can be rendered to WAV on the computer and shipped as files, but uncompressed loops are large (about 2.5 MB per minute in mono). Compressed OGG needs an outside encoder, which you would run.
- **Needs files from you:** Anything that should sound like real instruments. Two or three seamless loops of 60–90 s as OGG, about 1 MB each, credited in `CREDITS.md`.
- **Why:** A silent game reads as unfinished in a store listing video and in the first ten seconds of play.
- **Effort:** M (in code) or S (playing files you supply). **Risk:** Medium. A weak or repetitive loop is worse than none, so it needs your ear, and the engine loop has to be re-balanced against it.

### 9. Title screen
- **What:** A first screen with the star plate, the title and a PLAY button (plus CONTINUE when a run is saved, which the start-up screen already draws). Today a new player goes straight into "LEVEL 1".
- **Why:** The first tap unlocks audio, so the first level's fanfare is never heard and music could not start. It also gives the game a proper front door and a place for settings before play.
- **Effort:** S. **Risk:** Low. One extra tap before the first game.

### 10. Screen transitions
- **What:** A quick fade (150–250 ms) between screens, panels that slide or scale in, and a "LEVEL X" intro whose text moves in and out instead of appearing. Drawn with alpha and position only.
- **Why:** Every state change is a hard cut, which makes otherwise polished menus feel abrupt.
- **Effort:** M. **Risk:** Low–medium. Input must stay locked during a transition, and it touches each screen's draw function.

### 11. Level summary that counts up
- **What:** Rows appear one by one with a tick sound, the gold total counts up, earned bonuses flash. A tap skips to the end.
- **Why:** The reward moment is a static table. Counting up is the cheapest way to make earning gold feel good.
- **Effort:** S. **Risk:** Low. Must be skippable, and the existing button delay stays.

### 12. Smarter enemies (gameplay change)
- **What:** Keep the random driving, but add a tunable chance for an enemy to turn toward the base or the player, and to fire when one of them is straight ahead. Chances rise by level and are set per enemy type.
- **Why:** Enemy AI is purely random with a bias downward. Enemies never aim, so danger comes only from numbers and luck, and late levels feel like early ones played faster.
- **Effort:** M. **Risk:** High for balance. Every level's difficulty shifts, so all 20 need replaying. Should be done together with proposal 13.

### 13. A difficulty curve with more than speed (gameplay change)
- **What:** Let the number of enemies on the field (fixed at 3) and the spawn delay (fixed at 1.5 s) change by level, and add one tougher enemy for worlds 3–4 (for example one that fires twice). Review the economy against it.
- **Why:** Scaling today is +1.5% speed per level capped at +25%, and a faster fire rate. From about level 17 nothing gets harder except the map. Endless mode flattens completely.
- **Effort:** M. **Risk:** High for balance, as above. A new enemy is data plus colors, not new art.

### 14. Danger and state feedback
- **What:** A pulsing red edge on the playfield and a short alarm sound when a base wall is hit by an enemy, a HUD lives flash at one life left, a "3-2-1" beep as a shield or fortify runs out, and smoke from a heavy tank at 1 health.
- **Why:** The base can be lost from off-attention with no warning. Losing should always feel like something the player saw coming.
- **Effort:** S–M. **Risk:** Low. The alarm needs a repeat limit so it never nags.

### 15. Tank motion: moving treads, dust, track marks — ART CHANGE (tank picture)
- **What:** Two tread pictures per tank swapped while it drives, small dust puffs behind a moving tank (snow spray on snow, splashes at shores), and faint track marks that fade like scorch marks.
- **Why:** Tanks slide as rigid pictures. Movement is the second most constant thing on screen after firing.
- **Effort:** M. **Risk:** Medium. Doubles the cached tank pictures, the tread detail has to read at 30 px, and track marks must be capped like scorch marks.

### 16. Sound variety
- **What:** Each file-based effect has exactly one file, so every shot sounds the same apart from ±4% pitch. Add variations, and make better versions of the sounds still built from simple tones.
- **In code:** Richer synthesis for coin, power-up, armor break, purchase, UI tap, metal and concrete hits (layered noise bursts, short pitch sweeps, a little echo), and new sounds for proposals 5, 6 and 14. These suit synthesis well.
- **Needs files from you:** 2–3 more variations each for the cannon, brick and explosion sounds, a distinct base-destroyed blast, and a heavier engine. The loader already supports several files per effect.
- **Why:** Repetition is what makes a game's sound feel cheap, and shots and brick hits play hundreds of times per level.
- **Effort:** S–M. **Risk:** Low. Volumes need re-balancing against the existing chain.

### 17. Enemy engine and distance cues
- **What:** A quiet second engine layer whose level follows how many enemies are moving, and slightly quieter shots for enemies far from the player.
- **Why:** Only the player's tank makes a driving sound, so the battlefield is silent between shots.
- **Effort:** S. **Risk:** Low–medium. Easy to make muddy on a phone speaker; needs a listen on a real device.

### 18. Player death and game over moment
- **What:** A bigger, slower blast for the player than for enemies, a half-second slow-motion when the base is hit, and the game over panel arriving after the blast instead of over it.
- **Why:** The two most dramatic events in the game look the same as an ordinary kill.
- **Effort:** S. **Risk:** Low. Slow-motion changes timing only after the game is already lost.

### 19. Cheaper frames: less garbage and less text work
- **What:** Stop rebuilding long cache-key strings and small arrays every frame (tank keys, `filter` / `map` in bullets and enemies), and draw HUD text into a cached picture that is repainted only when a number changes.
- **Why:** Steady small allocations cause periodic stutters on low-memory phones, and text drawing is one of the slower canvas calls.
- **Effort:** M. **Risk:** Low. Worth doing only if proposal 3's meter shows stutter after proposal 4.

### 20. Ground wear and playfield edges — ART CHANGE (ground)
- **What:** The item from "Still to do" in STYLE.md: worn dirt paths along likely tank routes, and bushes and rocks along the playfield's sides.
- **Why:** The ground is even everywhere, so maps read as tiles on a flat color.
- **Effort:** M–L. **Risk:** Medium. Extra ground detail can hurt readability, which STYLE.md puts first.

### 21. Ambient life per world
- **What:** Like the snow: drifting dust in the desert, a few falling leaves in the jungle, light cloud shadows in the standard world. Computed from game time, capped like the snowflakes.
- **Why:** Three of the four worlds are completely still apart from water.
- **Effort:** S–M. **Risk:** Low. Must stay faint so it never looks like bullets.

### 22. Controls polish
- **What:** A hold-to-fire option (auto-repeat while FIRE is held), a joystick dead-zone and size setting, and a light vibration tick on FIRE (with proposal 2).
- **Why:** Tapping FIRE for a whole level is tiring on glass, and thumb sizes differ.
- **Effort:** S. **Risk:** Medium. Hold-to-fire makes the game easier, so it should be a setting that is off by default, or tuned in with proposal 13.

### 23. Shop and button feedback
- **What:** A press animation on every button (sink and brighten), a flash and coin burst on a purchase, and the gold counter counting down.
- **Why:** Buttons respond with sound only, so a tap on a slow phone can feel missed.
- **Effort:** S. **Risk:** Low.

### 24. Stars and best results per level
- **What:** One to three stars on the summary (finished, base walls untouched, no life lost: the three bonuses that already exist), saved per level and shown on the title screen.
- **Why:** A reason to replay and a clear goal beyond the score. This is a new feature, so only if you want it.
- **Effort:** M. **Risk:** Medium. Changes the save format (a new `SAVE_VERSION`) and needs a way to pick a level.

### 25. Frame pacing on 90 and 120 Hz screens
- **What:** Draw at most 60 frames per second and step the game in fixed slices.
- **Why:** On high-refresh phones the game draws twice as often for no visible gain, which costs battery and heat. Fixed steps also make movement identical on every device.
- **Effort:** S–M. **Risk:** Medium. Touches the main loop; movement and bullet timing must be re-checked.

## Suggested order

1. **First pass (feel):** 1, 2, 5, 6, 7. About three days, and the game feels different.
2. **Performance:** 3 first, then 4, then 19 only if the meter still shows stutter.
3. **Front door and flow:** 9, 10, 11, 23.
4. **Sound:** 16, 8, then 17.
5. **Gameplay:** 12 and 13 together, with a full replay of all 20 levels, then 14, 18, 22.
6. **Later:** 15, 20, 21, 24, 25.

## Decisions for you

- **Music (8):** chiptune made in code, or tracks you supply?
- **Gameplay changes (12, 13, 22):** these alter difficulty. Do you want them, or only looks and sound?
- **ART CHANGE items (1, 7, 15, 20):** which of these may I touch?
- **Vibration (2):** is adding the VIBRATE permission acceptable?
