# Visual style

The target look: a detailed top-down military look with soft light, earthy ground, chunky walls and bold tanks. Everything is drawn with canvas code (no image files).

## Principles
- **Light from the top-left.** Top and left edges are lighter, bottom and right edges darker, and shadows fall to the bottom-right (`VISUALS.shadowOffset` in `config.js`).
- **Readable first.** Tiles are about 30 px on a phone (45-60 px on bigger screens). Tanks, bullets and walls must stand out from the ground, so the ground stays calm: small details with low contrast.
- **Bold simple shapes** with a dark outline. Add a detail only if it still reads at about 30 px.
- **Colors come from the theme** (`themes.js`). Draw code mixes theme colors (`mixColors()`, `withAlpha()` in `materials.js`) instead of adding new map colors. Plain black and white are fine for light and shadow.
- **Stable decoration.** Random details use seeded random (`makeRandom`) or a hash of the tile position, never `Math.random` in paint code, so nothing flickers or moves between frames.
- **Patches join up.** Water, forest, sand and ice look at their four neighbours (`sameSides()` in `materials.js`). Inside a patch the tiles run into each other without seams: shared patterns sit at the same place in every tile, and the outline (`tileOutline()`) stays straight with sharp corners on closed sides. Only open sides get a shore, a soft edge or a rim. The edge of the map counts as the same material, so rivers run off the map.
- **The turned playfield stays upright.** In landscape the map is shown turned a quarter clockwise (21 x 13 tiles, the base on the left), but only positions are turned (`mapToScreen()`, `tileToScreen()` in `game.js`). Every picture is drawn upright, so the light stays top-left and the brick pattern, cracks, shores, smoke and shadows look exactly as in portrait. The neighbours in `sameSides()` are screen neighbours (`directionOnMap()`), so the shores sit on the right sides, and water ripples are offset by the tile's place on screen (`screenCell()`) so they run on across tiles. Only tanks turn: they use the picture for the direction they face on screen (`directionOnScreen()`). Things laid over the playfield as a whole (border, ground shade, vignette, margins and their shadow, snow, hints, banners, the pause button) use its rectangle on screen (`fieldRect()`), and text is never turned.

## Performance rules
- Anything with many steps, gradients or blur is painted once into a small offscreen canvas with `cachedPicture(key, width, height, paint)` (`game.js`) and copied with `drawImage` every frame. Pictures are painted at the tile size times `devicePixelRatio` and are all thrown away when that changes (resize).
- No per-frame gradients, `shadowBlur` or filters on large areas. Gradients and canvas shadows only run inside `paint` functions.
- Big soft layers (ground shade, vignette) are tiny pictures stretched over the playfield; smoothing makes them soft.
- `field.x` / `field.y` and the tile size are whole device pixels, so copied pictures stay sharp.

## How each part is drawn
| Part | Where | How |
|---|---|---|
| Ground | `drawGround()`, `paintGround()` in `themes.js` | 6 looks per theme (`GROUND_VARIANTS`), picked by a hash of the tile position: base color, soft patches, specks, the theme's `details` (grass tufts, stones, sand ripples, snow drifts) and a faint grid line on the top and left edges |
| Ground shade | `drawGroundShade()` in `themes.js` | Big soft patches across the whole field (8 px per tile, stretched), so the ground doesn't look tiled. `VISUALS.groundShade` |
| Brick | `drawBrick()`, `paintBrick()` in `materials.js` | 4 looks (`BRICK_VARIANTS`): shaded bricks, specks, chipped corners, dark joints. Damage cracks are drawn live on top |
| Wall shadows | `drawWallShadows()` in `game.js` | A soft square shadow under each `castsShadow` tile (brick, concrete, metal). `VISUALS.wallShadowAlpha` |
| Tanks | `drawTank()`, `paintTank()` in `game.js` | One picture per look, colors and direction: dark tracks with tread lines, square hull with an engine deck, short thick cannon with a muzzle, round shaded turret with a hatch. The shapes are turned before painting, so the light stays top-left in all 4 directions |
| Tank shadows | `drawSoftShadow()` in `game.js` | A soft square (`VISUALS.tankShadowSize`) under each tank, faded along with the tank |
| Vignette | `drawVignette()` in `game.js` | Darker corners in the theme's `screen` color, over the map and under the tanks. `VISUALS.vignetteAlpha` |
| Water | `drawWater()` in `materials.js` | Three layers. Still water (darker deep patches, light shallows along shores) is cached. Moving ripples and sparkles are cached strips that repeat every 2 tiles (`WAVE_REPEAT`) and slide with `gameTime`, offset per row. The shore (dark wet edge, a little foam, a row of shaded stones in the theme's `bank` color) is cached and only drawn on sides that touch land |
| Forest | `drawForest()` in `materials.js` | A dark floor with 9 round tree crowns on a jittered 3 x 3 grid, each a ball lit from the top-left covered in leaf clumps (lighter toward the light). Crowns reach a little into neighbouring forest tiles (`FOREST_SPILL`), so a big forest is one canopy; on open sides they stay inside, giving a bumpy edge. Drawn at the theme's forest `opacity` |
| Sand | `drawSand()` in `materials.js` | A wavy soft edge on open sides (the ground shows around it), ripple lines at the same heights in every tile so they continue across a patch, grains, lit top/left and shaded bottom/right edges |
| Ice | `drawIce()` in `materials.js` | A frozen lake, flat and level with the ground, filling the whole tile (square corners, nothing raised). Faint blue clouds, diagonal shine streaks on the same lines in every tile (they run across a patch), a thin crack on about half the tiles, frost specks. On open sides: a thin frost line at the shore, and on the top and left the bank's soft shadow on the ice |
| Concrete | `drawConcrete()` in `materials.js` | 3 looks: four cast blocks (2 x 2) with dark joints, each with light top/left and dark bottom/right edges, a faint stain, small pits and sometimes a chipped corner. Four blocks and no rivets, so it never looks like metal. Damage cracks are drawn live on top |
| Metal | `drawMetal()` in `materials.js` | 3 looks: a steel plate lighter toward the top-left, fine brushed lines, a few scratches, a wide mitred bevel (bright top, light left, dark right, darkest bottom) and a shaded rivet in each corner. Damage cracks are drawn live on top |
| Base | `drawBase()`, `paintBase()` in `materials.js` | A gold star instead of the old eagle, cached: a dark frame with a rivet in each corner, an octagonal steel plate with a lit bevel, a gold ring lit from the top-left, and a faceted star (each arm two facets, shaded by the way their outer edge faces the light) with a dark outline. Colors in `BASE_LOOK` (`config.js`). The destroyed base is the same picture broken (`paintBase(c, s, true)`): everything darker, one rivet gone, cracks across the plate, the ring in four pieces, two star arms snapped off, soot, gold and steel shards and a few embers |
| Tank blasts | `addBlast()`, `drawBlast()`, `drawBlastPieces()` in `game.js` | When a tank (or the base, `BLAST_LOOKS.baseSize` bigger) is destroyed, over `BLAST_LOOKS.time` (1.4 s): warm light added to the ground, a white flash, a thin shock ring, sparks as short streaks, a fireball of 7 clouds that cools from white-hot through orange to dark red (a hot one in the middle drawn on top, cooler ones around it), grey smoke drifting to the top-right, and 8 pieces in the tank's own colors thrown up and out from under the fire (bigger and with a longer shadow while high), spinning until they land and fade. Each particle's path is picked once with seeded random (`makeRandom`) and worked out from the blast's age, so there's no update step. Fire stages and smoke are cached cloud pictures (`paintPuff()`), flash and ground light are `drawGlow()` with "lighter"; everything is clipped to the playfield. Brick explosions and bullet sparks keep the old simple look |
| Scorch marks | `drawScorchMarks()`, `paintScorch()` in `game.js` | Each blast leaves a dark mark (3 cached looks: soot thickest in the middle, blotches, soot rays, specks) on the floor, under walls and tanks. It fades out over `scorchFade` and is gone after `scorchTime` (8 s); at most `maxScorchMarks`, cleared when a level loads |
| Player tank looks | `drawPlayer()`, `playerLook()` in `game.js` | The same cached tank sprites in other color sets (`PLAYER_LOOKS` in `config.js`), plus a cached glow (`drawGlow()`) under the tank. See "Player tank states" below |
| Power-ups on the map | `drawPowerUp()` in `game.js`, `paintBadge()` in `powerups.js` | A cached round badge (metal rim lit from the top-left, dark face, a faint ring and the symbol in the type's color, a soft gloss) floating up and down over a pulsing glow in its color |
| Coins | `drawCoins()` in `game.js`, `paintCoin()` in `powerups.js` | A cached gold coin (dark edge, lit rim, raised star, shine spot) that turns (squeezed sideways) over a pulsing gold glow; each coin has its own timing. Coins on forest tiles are drawn again on top of the forest, so they can be found |
| HUD effect timers | `drawEffectTimers()` in `game.js` | The same cached badges, smaller, with a countdown bar in the type's color (timed power-ups only; the shop armor is an upgrade badge). The HUD coin is the same coin picture |
| Control panel | `drawControlPanel()`, `paintControlPanel()` in `game.js` | One cached picture per screen size and theme: dark metal (a little of the theme's `screen` color mixed in) with brushed lines, a lit bevel and dark line along the top, engraved seams beside the HUD part, rivets in the top corners of each part, and a soft shadow up onto the playfield. Portrait only: in landscape there is no panel, and the HUD and controls sit on the margin art |
| Joystick (Drag) | `drawJoystick()`, `paintJoystickBase()`, `paintJoystickTop()` | Two cached pictures: a base with a beveled metal rim around a sunken well with four etched arrows, and a metal stick top (dome lit from the top-left, grip ring, highlight, shadow). It's always drawn in the movement part, though a drag can start anywhere: the base sits where the touch started (or as close to it as fits in the part) and the top moves as the finger moves from there. Idle, both show faintly (`idleJoystickAlpha`) in the middle of the control's square (`controlZone.moveBox`) |
| D-pad (Cross) | `drawDpad()`, `paintDpadWell()`, `paintDpadButton()` | A dark cross-shaped well with a dimpled hub, and four metal plates of the same size with a bevel and an arrow. The cross is square, as big as fits in the movement part less the margin. Each plate has a cached normal and pressed picture; pressed = bevel turned around (pushed in), darker face with amber light, thin amber outline, bright arrow, drawn 1-2 px down-right |
| Fire button | `drawFireButton()`, `paintFireButton()` | Two cached pictures: a red cap in a beveled metal ring with a dark groove, a glossy highlight and FIRE embossed (dark edge below-right, light edge above-left). Pressed: darker and smaller cap, sunk into the ring, weaker gloss. As big as fits in its part less the margin |
| HUD display | `drawHud()`, `hudLayout()`, `paintHudDisplay()` | A cached metal frame with corner screws around a dark sunken screen (at most 0.6 times as tall as wide), with the text drawn live on it. Under it is a row kept free for the upgrade badges (`CONTROL_ZONE.badgeRowShare`, `badgeRowMax`), even while it's empty, so the display doesn't move when a badge shows up. (The star emblem plate that used to sit there is gone.) Landscape: the same framed display stands upright at the top of the movement side, as wide as its text needs (at least the control's width, at most `LANDSCAPE.hudMaxWidth`), the text in one column or two at the biggest font that fits (`sideHudSize()`), never stretched; the badge row is under it. Overlay layout: a slim framed strip above the playfield with the text in one row and the badge slots at its right end |
| Upgrade badges | `drawHudUpgradeBadges()`, `drawUpgradeBadge()`, `paintUpgradeBadge()` in `game.js`, `UPGRADE_BADGES` in `shop.js` | Small square badges like tiny HUD displays: a metal frame (`paintFramedScreen()`) around a dark screen with the shop's icon lit from the top-left. Bullets (brass shell) and tank speed (green chevrons) have 3 tier dots under the icon: amber with a soft glow and a shine when bought, dark sunken sockets with a faint rim when not; they show from tier 1. Armor is a silver shield (held until it breaks), base steel the steel plate with the gold star (held until the next level uses it). One row, centered, in a fixed order; the size fits all four in the HUD part, so a new badge never shrinks the others and nothing reaches the display, joystick or fire button. Nothing shows while none are held. One cached picture per badge, tier and size. `BADGE_ROW` in `config.js` |
| Badge flash | `hudUpgradeBadges()`, `drawUpgradeBadge()` | When a badge changes (bought, tier up, armor broken, base steel used) it flashes brighter for `BADGE_ROW.flashTime` (0.3 s): the same picture is drawn again on top with "lighter" at an alpha that rises and falls (a sine). A lost badge stays for the flash and fades out. Changes are noticed as the HUD is drawn, so a badge bought in the shop flashes when the HUD shows again |

| Margins | `drawMargins()`, `paintMargins()` in `themes.js` | The screen space around the playfield: in portrait above the control zone (sides on tablets and computers, thin strips on phones), in landscape the whole screen, so it also fills the side areas and any extra space in very wide or tall windows. It's dark metal like the control panel (`paintMetalBackground()` in `ui.js` with the theme's `screen` color mixed in by `CONTROL_LOOK.panelTint`: brushed lines, plate seams and rivets). The playfield throws a soft shadow onto it (`VISUALS.marginShadow`, wide on the bottom and right) and gets a thin metal frame. One picture per theme and screen size, at one pixel per CSS pixel; the control panel's top edge and shadow sit right on it |
| Page background | `updatePageBackground()` in `themes.js` | The color behind the canvas (seen while loading or resizing) is the margins' metal color, so it never flashes black. It changes only when the theme does; `index.html` starts with the first theme's color |

Drawing order in a frame: margins, ground, ground shade, floor tiles (water, sand, ice), scorch marks, wall shadows, walls, vignette, coins and power-ups, tank shadows and tanks (not on forest tiles), bullets, ambient snow, forest, then the tanks again faintly on forest tiles (`TERRAIN.forestEnemyAlpha`, `forestPlayerAlpha`), explosions (clipped to the playfield), control panel, HUD, controls (only while playing).

## Tanks
- **Player:** yellow-gold.
- **Basic:** grey.
- **Fast:** red, with a slimmer hull (`look.width` 0.78).
- **Heavy:** dark steel and bulkier. It turns bronze, then rusty red as it gets damaged (`damagedColors`).
- **All tanks:** tracks are always dark, the cannon is the turret color a bit darker, and a tank turns white when hit or while it carries a power-up (`FLASH_COLORS`).
- Colors live in `enemies.js` (`colors`, `damagedColors`) and `PLAYER_COLORS` in `game.js`.
- Sprites never change a tank's size or hitbox: each tank is still one tile.

## Player tank states
All looks are cached pictures. Switching is only a choice of picture, and the glow pulses by changing its alpha. Colors, glow, blink speed and blink window are in `PLAYER_LOOKS` (`config.js`).
- **Normal:** gold.
- **Shield power-up:** blue tank over a soft blue glow that gently pulses. In the shield's last `shieldWarningTime` (2) seconds it switches every `shieldBlinkTime` (0.15) seconds between blue and the look it goes back to.
- **Armor (shop):** bright silver tank (clearly lighter than the grey enemies) with a soft steady glow, and no ring around it. When armor breaks, the old ring-break effect plays with silver sparks and the tank goes back to gold.
- **Both:** blue wins. Near the shield's end it blinks blue and silver, then stays silver.
- **Respawn invincibility:** the whole tank blinks, as before.

## Pickups
- **Symbols:** a wrench in green (repair), a shield in the shield's blue, a metal block in silver-grey (fortify), a clock in orange. The shop's armor card has a silver round badge (a tank in a ring); the armor's upgrade badge is a silver shield. Symbol colors are each type's `color` in `powerups.js`.
- **Badge, coin and motion:** rim, face and coin colors, sizes, glow, bobbing, spin and blink rate are in `PICKUP_LOOKS` (`config.js`).
- **Motion stays cheap:** pickups only move by position (bobbing), width (coin turning) and glow alpha. Nothing is repainted.
- **Before they disappear:** pickups blink in their last seconds as before (`POWERUPS.blinkTime`, `ECONOMY.coinBlinkTime`).

## Ground per theme
- **Standard:** olive earth with dirt and grass patches, grass tufts, small stones.
- **Jungle:** very dark moss and mud, dense grass tufts, mossy stones.
- **Desert:** warm sand with ripples and a few pebbles.
- **Snow:** pale blue-white with snow drifts and a few dark stones.

## Terrain colors per theme
Kept in `themes.js` (`tiles`):
- **Water:** `fill`, `wave` (ripples, foam, shallows) and `bank` (shore stones).
- **Forest:** `dark`, `mid` and `light` for the shaded side, main color and sunlit side of the crowns, plus `opacity`. In the snow theme `light` is white, so the pines get snow on top.
- **Sand:** `fill` and `dots` (ripple lines, grains, shaded edges).
- **Ice:** `fill`, `shine` and `outline` (clouds, cracks, dark rim).

## Screens and menus
Shared art in `ui.js`, in the control panel's style, with every static part cached:
- `paintFramedScreen()` / `drawFramedPanel()`: a beveled metal frame with corner screws around a dark sunken screen. Used by the HUD, the end-screen panels and the shop cards.
- `drawTitlePlate()`: a title on a slanted metal plate (`paintPlate()`).
- `drawUiButton()`: a gold (primary) or steel button in a metal frame with a gloss and an embossed label, plus an amber outline when chosen with the keyboard.
- `drawMetalBackground()`: dark metal plates with seams and rivets, for the shop and the start-up screen.
- `drawStarEmblem()`: the base's star plate, whole or broken.
- `drawMessageStrip()`: a short message on a small framed dark strip sized to the text.

The screens themselves:
- **Level result:** the map is dimmed and a framed panel shows "LEVEL X COMPLETE" on a plate across its top edge. The table follows: earned gold in gold with a small coin, missed bonuses grey with 0, and the totals on a faint gold strip. Then the gold CONTINUE button.
- **Game over:** the broken star plate over a framed panel with "GAME OVER" on a plate, why the game was lost, FINAL SCORE as a big number, the records, and PLAY AGAIN.
- **Campaign complete:** the whole gold star plate over a panel with the title on a plate, the TOTAL SCORE as a big number, and the menu buttons.
- **Shop:** a metal background, a framed header (SHOP and a coin with your gold), and a framed "next level" panel with its enemies. Each item is a framed card with its round badge (`paintRoundBadge()`, like the power-ups: bullet, speed chevrons, heart, silver armor, steel plate with the gold star). Tiers show as pips that turn gold once bought, and the price has a coin; MAX shows in green. The selected card gets an amber outline. START LEVEL is a gold button. In landscape the cards form a grid of 2 or 3 columns, with the header and the "next level" panel side by side above it; a card's name shrinks to leave room for its pips.
- **Pause menu** (`pause.js`): the map is dimmed and a framed panel sits behind the buttons with "PAUSED" or "SETTINGS" on a plate across its top edge. RESUME and BACK are gold, the other buttons steel. The main page shows the records at the bottom of the panel, and under them (below another engraved line) the upgrade badges the player holds, the same pictures as in the HUD, each with its name under it in one shared font size (BULLETS, TANK SPEED, ARMOR, BASE STEEL); the panel grows downward for them, the buttons stay where they were. The settings page shows the controls below the map as before.
- **Pause button:** a small metal button with a dark face and two light bars (`paintPauseButton()`, cached, slightly see-through).
- **Positions:** every button and card sits exactly where the layout functions put it (`layoutScreenButton()`, `campaignButtons()`, `shopLayout()`, `pauseMenuLayout()`, `pauseButtonRect()`), so taps work as before. Screens are laid out around a middle point (`overlayFrame()`): over the playfield in portrait, centered on the screen in landscape, scaled so buttons are at least 48 px tall, and scrolling if they're then taller than the window.
- **Loading screen:** the metal background with the gold star plate and "LOADING..." on a title plate.
- **Start-up screen** (`save.js`): the metal background, the gold star plate, the title in gold, the subtitle on a metal plate, the best score on a small framed strip (`drawMessageStrip()`), and the gold and steel buttons.
- **"LEVEL X" intro and world banner ("World 2: Jungle"):** kept as plain outlined text over the dimmed map on purpose. They flash by between levels, and panels made them feel too heavy.
- **On-map messages:** tutorial hints and "Grab the coins!" sit on a small framed dark strip sized to the text (`drawMessageStrip()`). "ALL ENEMIES DESTROYED" goes on a title plate, kept narrow enough to leave room for the pause button.

## Control panel
- **Fits inside the existing layout:** the panel is drawn within the three parts from `portraitLayout()`. The zone height, the playfield size and the touch handling are unchanged.
- **Landscape:** no panel. The same joystick, cross, fire button and HUD pictures stand on the margin art beside the turned playfield (`sideLayout()`), with `LANDSCAPE.spacing` between them and no extra margin. The playfield gets a little smaller (down to `LANDSCAPE.minFieldShare`) when that makes room for them. When the sides are still too narrow (16:9 phones, 16:10 and squarer screens), the controls are drawn see-through (`LANDSCAPE.overlayAlpha`) over the playfield's bottom corners and the HUD becomes a strip above it (`overlayLayout()`).
- **Margin:** the D-pad, fire button and HUD keep the same margin (`CONTROL_ZONE.margin`, 3% of the zone height) inside their parts, so nothing touches its neighbour, even on narrow phones.
- **D-pad shape:** the cross is square with four equal buttons. A touch anywhere in the movement part picks the nearest arrow by angle. The hit area is the whole part, more than the drawn buttons, so a finger drifting between buttons isn't lost.
- **Drag:** steering can start anywhere on the screen except the fire part and the pause button, but the joystick is only ever drawn in the movement part.
- **Moving parts only:** each frame copies the cached pictures. Only the joystick's position and which D-pad or fire picture is shown change.
- **No debug text in the game:** the orange debug tags over the map (FREEZE, a generated level's seed) and "CLEAR SAVE (DEBUG)" only show with `DEBUG` on. Upgrade tiers are shown by the badges, never as text labels.

## Still to do
1. **Ground wear and map edges.** The target look has worn dirt paths and tank tracks, and bushes and rocks along the playfield's sides. Our ground is even all over.
