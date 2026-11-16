// =====================================================================
//  Render - draw(), the cached pictures and everything on the playfield
//
//  The frame for each game state, cachedPicture(), shadows, tiles, tanks,
//  coins, power-ups and bullets.
// =====================================================================

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function draw() {
  // The shop is a full screen of its own (shop.js)
  if (gameState === GAME_STATE.SHOP) {
    drawShop();
    return;
  }

  // Start-up screens: waiting for the save, or "Continue?" (save.js)
  if (gameState === GAME_STATE.LOADING) {
    showLoadingScreen();
    return;
  }
  if (gameState === GAME_STATE.CONTINUE_PROMPT) {
    drawContinuePrompt();
    return;
  }

  // The theme's dark background over the whole screen (behind the
  // control zone), then the themed margins around the playfield and the
  // page color behind the canvas (themes.js)
  ctx.fillStyle = currentTheme().screen;
  ctx.fillRect(0, 0, view.width, view.height);
  drawMargins();
  updatePageBackground();
  refreshStaticMap(); // the floor and wall pictures, if the map changed

  // Screen shake (feedback.js): everything on the playfield is drawn a
  // few pixels off, down to the explosions; the HUD and controls are not
  const shakeBy = shakeOffset();
  ctx.save();
  ctx.translate(shakeBy.x, shakeBy.y);

  drawField();        // ground, then "ground" and "solid" tiles
  drawCoins();
  drawPowerUp();
  drawSpawnWarning(); // where the next enemy is about to appear (feedback.js)

  // Tanks: nothing of them is drawn under forest ("overlay" tiles)...
  ctx.save();
  clipToOverlayTiles(false);
  drawEnemies();
  drawPlayer();
  ctx.restore();

  drawBullets();
  drawAmbient();        // the theme's snow etc. (themes.js), under forest
  drawTiles("overlay"); // forest, over tanks and bullets

  // ...except that coins in the forest are drawn on top of it, so they
  // can be found, and the tanks show faintly on top of it (the enemies
  // fainter than the player)
  ctx.save();
  clipToOverlayTiles(true);
  drawCoins();
  ctx.globalAlpha = TERRAIN.forestEnemyAlpha;
  if (TERRAIN.forestEnemyAlpha > 0) drawEnemies();
  ctx.globalAlpha = TERRAIN.forestPlayerAlpha;
  drawPlayer();
  ctx.restore();

  drawExplosions();
  ctx.restore(); // end of the shaken part
  drawControlPanel();
  drawHud();

  // What goes on top depends on the game state
  if (isPlaying()) {
    drawLevelEndHint();
    drawTutorial();
    drawControls();
  } else if (gameState === GAME_STATE.WORLD_INTRO) {
    drawWorldIntro();
  } else if (gameState === GAME_STATE.LEVEL_INTRO) {
    drawLevelIntro();
  } else if (gameState === GAME_STATE.LEVEL_SUMMARY) {
    drawLevelSummary();
  } else if (gameState === GAME_STATE.CAMPAIGN_COMPLETE) {
    drawCampaignComplete();
  } else {
    drawEndScreen();
  }

  // Pause button, or the pause menu over everything (pause.js)
  if (pauseMenu.open) drawPauseMenu();
  else if (canOpenPauseMenu()) drawPauseButton();
}

// The gold coin picture, "size" pixels wide (paintCoin in powerups.js)
function coinPicture(size) {
  return cachedPicture("coin" + size, size, size, (c) => paintCoin(c, size));
}

// Coins on the map: the cached coin turning slowly (squeezed sideways,
// so it looks like it spins) over a soft pulsing gold glow. Each coin
// has its own timing. Blinks during its last seconds.
function drawCoins() {
  const s = field.tileSize;
  const look = PICKUP_LOOKS;
  const size = s * look.coinSize;
  const picture = coinPicture(size);
  for (const coin of coins) {
    const timeLeft = ECONOMY.coinLifetime - coin.age;
    if (timeLeft < ECONOMY.coinBlinkTime && Math.floor(coin.age * look.blinkRate) % 2 === 1) continue;

    const { x: cx, y: cy } = mapToScreen(coin.x + 0.5, coin.y + 0.5);
    const phase = coin.x * 1.7 + coin.y * 2.3;
    drawGlow(cx, cy, look.coin[1], look.glowSize * 0.8,
             look.glowAlpha * pulse(look.pulseSpeed, look.pulseAmount, phase));
    const turn = 0.35 + 0.65 * Math.abs(Math.cos(gameTime * look.coinSpinSpeed + phase));
    ctx.drawImage(picture, cx - (size * turn) / 2, cy - size / 2, size * turn, size);
  }
}

// While waiting to end the level, tell the player to grab the coins:
// "ALL ENEMIES DESTROYED" on a title plate and "Grab the coins!" on a
// small framed strip under it (ui.js), near the top of the playfield as
// it is on screen (the text is never turned)
function drawLevelEndHint() {
  if (levelEndTimer === null) return;
  const s = field.tileSize;
  const rect = fieldRect();
  const cx = rect.x + rect.width / 2;
  const maxWidth = rect.width - s * 3; // leaves room for the pause button
  drawTitlePlate("ALL ENEMIES DESTROYED", cx, rect.y + s * 1.3, s * 0.55, "#7ee081", maxWidth);
  drawMessageStrip("Grab the coins!", cx, rect.y + s * 2.5, s * 0.5, "#f5c542", maxWidth);
}

// The map under the tanks: the floor (ground, sand, ice), the water,
// scorch marks from blasts, the walls with their shadows, the vignette
// over all that, and the border. The floor and the walls don't change
// from frame to frame, so each is one picture of the whole playfield
// (the static map, below) copied here; only the water and the scorch
// marks are drawn tile by tile.
function drawField() {
  const rect = fieldRect();
  if (VISUALS.cacheStaticMap) {
    ctx.drawImage(staticMap.floor, rect.x, rect.y, rect.width, rect.height);
  } else {
    paintFloor();
  }
  drawTiles("ground", true); // the moving floor tiles: water
  drawScorchMarks();
  if (VISUALS.cacheStaticMap) {
    ctx.drawImage(staticMap.walls, rect.x, rect.y, rect.width, rect.height);
  } else {
    paintWalls();
  }
  drawVignette();

  // Border around the whole playfield
  ctx.strokeStyle = currentTheme().border;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2);
}

// The floor, tile by tile: ground tiles in the theme's look (themes.js),
// big soft patches across them so the ground doesn't look tiled, then
// the floor tiles that never move (sand, ice)
function paintFloor() {
  const s = field.tileSize;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const at = tileToScreen(col, row);
      drawGround(at.x, at.y, s, col, row);
    }
  }
  drawGroundShade();
  drawTiles("ground", false);
}

// The walls, tile by tile, over their shadows
function paintWalls() {
  drawWallShadows();
  drawTiles("solid");
}

// ---------------------------------------------------------------------
// The static map: two pictures as big as the playfield, the floor and
// the walls (with their shadows; see-through where there is no wall).
// Painting them tile by tile every frame was most of a frame's work,
// though they only change when a tile does. So they are painted again
// only when the map (mapSignature() in map.js: a tile broken, damaged,
// repaired, fortified), the theme or the playfield's size or place
// changed, and copied in drawField() the rest of the time.
// They are painted on the game's own canvas at the playfield's place
// and copied from there, pixel for pixel, so they look exactly as if
// drawn tile by tile. VISUALS.cacheStaticMap = false turns this off.
// ---------------------------------------------------------------------
const staticMap = {
  floor: document.createElement("canvas"),
  walls: document.createElement("canvas"),
  // What the pictures were painted for
  signature: null, theme: null, x: 0, y: 0, width: 0, height: 0, turned: false,
};

// Call at the start of a frame, before anything else is drawn on the
// playfield (and before the screen shake moves it)
function refreshStaticMap() {
  if (!VISUALS.cacheStaticMap) return;
  const m = staticMap;
  const ratio = pixelRatio();
  const rect = fieldRect();
  // The playfield in real pixels (it sits on whole ones, layout.js)
  const x = Math.round(rect.x * ratio);
  const y = Math.round(rect.y * ratio);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  const signature = mapSignature();
  const theme = currentTheme().id;
  if (m.signature === signature && m.theme === theme && m.x === x && m.y === y &&
      m.width === width && m.height === height && m.turned === field.turned) return;
  m.signature = signature;
  m.theme = theme;
  m.x = x; m.y = y; m.width = width; m.height = height; m.turned = field.turned;

  // The floor covers the whole playfield; for the walls the playfield
  // is emptied first, so the picture is see-through between them
  paintFloor();
  keep(m.floor);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  paintWalls();
  keep(m.walls);

  // Copy the playfield's part of the game canvas into "picture"
  function keep(picture) {
    picture.width = width;   // (setting the size also empties it)
    picture.height = height;
    picture.getContext("2d").drawImage(canvas, x, y, width, height, 0, 0, width, height);
  }
}

// ---------------------------------------------------------------------
// Cached pictures. Things that take many drawing steps (ground, bricks,
// tanks, shadows, vignette) are painted once into a small offscreen
// canvas and copied with drawImage every frame. They are painted at the
// tile size times devicePixelRatio, so they stay sharp, and all of them
// are thrown away when that or the screen size changes (resize).
// ---------------------------------------------------------------------
let pictures = {};       // painted pictures, by key
let picturesSize = "";   // tile size in real pixels and screen size they were painted for

// The picture for "key", width x height CSS pixels. The first time it's
// needed, paint(c, scale) paints it on context c in CSS pixels (scale =
// real pixels per CSS pixel). "scale" can be given for pictures that
// are meant to be stretched (1 = one real pixel per CSS pixel).
function cachedPicture(key, width, height, paint, scale) {
  const ratio = pixelRatio();
  // (The screen size too, so full-screen pictures of old sizes don't pile up)
  const size = field.tileSize * ratio + "@" + view.width + "x" + view.height;
  if (size !== picturesSize) {
    pictures = {};
    picturesSize = size;
  }
  if (!pictures[key]) {
    const pixelScale = scale || ratio;
    const picture = document.createElement("canvas");
    picture.width = Math.max(1, Math.round(width * pixelScale));
    picture.height = Math.max(1, Math.round(height * pixelScale));
    const c = picture.getContext("2d");
    c.scale(picture.width / width, picture.height / height);
    paint(c, picture.width / width);
    pictures[key] = picture;
  }
  return pictures[key];
}

// A soft shadow under something the size of a tile with its top-left at
// (x, y): a black square "size" tiles wide with a blurred edge, moved
// right and down (the light comes from the top-left). Works with the
// current globalAlpha (faded tanks get faded shadows). "tile" is the
// tile size in pixels (the playfield's, unless given).
function drawSoftShadow(x, y, size, alpha, tile) {
  const s = tile || field.tileSize;
  const side = size * s;
  const pad = VISUALS.shadowBlur * s * 2; // room for the blurred edge
  const box = side + pad * 2;
  const picture = cachedPicture("shadow" + size + (tile ? "@" + tile : ""), box, box, (c, scale) => {
    // Only the square's canvas shadow lands on the picture: the square
    // itself is drawn off to the left (shadowBlur and shadowOffset are
    // in real pixels, not affected by c.scale)
    c.shadowColor = "#000000";
    c.shadowBlur = VISUALS.shadowBlur * s * scale;
    c.shadowOffsetX = box * 2 * scale;
    c.fillStyle = "#000000";
    c.fillRect(pad - box * 2, pad, side, side);
  });

  const corner = (s - side) / 2 - pad + VISUALS.shadowOffset * s;
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(picture, x + corner, y + corner, box, box);
  ctx.globalAlpha = before;
}

// Tiles whose material has "castsShadow" (materials.js) throw a soft
// shadow onto the floor to the bottom-right, so they look raised. The
// shadows stay inside the playfield.
function drawWallShadows() {
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = map[row][col];
      if (!MATERIALS[cell.drawAs || cell.material].castsShadow) continue;
      const at = tileToScreen(col, row);
      drawSoftShadow(at.x, at.y, 1, VISUALS.wallShadowAlpha);
    }
  }
  ctx.restore();
}

// Darker corners on the playfield, in the theme's screen color: a small
// picture with a soft round fade, stretched over the whole playfield as
// it is on screen (turned or not).
function drawVignette() {
  if (VISUALS.vignetteAlpha <= 0) return;
  const color = currentTheme().screen;
  const size = 64;
  const picture = cachedPicture("vignette" + color, size, size, (c) => {
    const middle = size / 2;
    const fade = c.createRadialGradient(middle, middle, middle * 0.75, middle, middle, middle * 1.45);
    fade.addColorStop(0, withAlpha(color, 0));
    fade.addColorStop(1, withAlpha(color, VISUALS.vignetteAlpha));
    c.fillStyle = fade;
    c.fillRect(0, 0, size, size);
  });
  const rect = fieldRect();
  ctx.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
}

// Limit drawing (until ctx.restore()) to the tiles of the "overlay"
// layer (inside = true) or to everywhere else (inside = false).
function clipToOverlayTiles(inside) {
  const s = field.tileSize;
  ctx.beginPath();
  if (!inside) ctx.rect(0, 0, view.width, view.height); // the whole screen
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (materialAt(col, row).layer === "overlay") {
        const at = tileToScreen(col, row);
        ctx.rect(at.x, at.y, s, s);
      }
    }
  }
  // "evenodd": with the whole screen added, the tiles become holes
  ctx.clip("evenodd");
}

// Draw every map tile whose material is on this layer ("ground",
// "solid" or "overlay", see materials.js). Each material draws itself
// with its own draw function from materials.js, upright at the tile's
// place on screen. "moving" (optional): only the materials that move
// (true: water) or only the ones that don't (false).
function drawTiles(layer, moving) {
  const s = field.tileSize;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = map[row][col];
      // "drawAs" lets a tile look like another material for a moment
      // (used by the fortify power-up's warning blink)
      const material = MATERIALS[cell.drawAs || cell.material];
      if (!material.draw || material.layer !== layer) continue;
      if (moving !== undefined && !!material.moving !== moving) continue;
      const at = tileToScreen(col, row);
      material.draw(at.x, at.y, s, cell, col, row);
    }
  }
}

// Which look the player's tank has: "shield" (blue, pulsing glow),
// "armor" (silver, a steady glow) or "normal" (gold). The
// shield wins when both are on. In the shield's last seconds the tank
// switches between blue and the look it goes back to (armor or normal).
function playerLook() {
  const after = upgrades.hasArmor ? "armor" : "normal";
  const shieldLeft = activeEffects.shield || 0;
  if (shieldLeft <= 0) return after;
  const blinking = shieldLeft < PLAYER_LOOKS.shieldWarningTime &&
    Math.floor(shieldLeft / PLAYER_LOOKS.shieldBlinkTime) % 2 === 1;
  return blinking ? after : "shield";
}

function drawPlayer() {
  if (!player.alive) return;
  // While invincible, blink: visible for 0.1s, hidden for 0.1s
  if (player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 1) return;

  const { x: cx, y: cy } = mapToScreen(player.x + 0.5, player.y + 0.5);
  const looks = PLAYER_LOOKS;
  const look = playerLook();
  if (look === "shield") {
    drawGlow(cx, cy, looks.shieldGlow, looks.glowSize,
             looks.shieldGlowAlpha * pulse(looks.pulseSpeed, looks.pulseAmount, 0));
    drawTank(player, looks.shield);
  } else if (look === "armor") {
    drawGlow(cx, cy, looks.armorGlow, looks.glowSize, looks.armorGlowAlpha);
    drawTank(player, looks.armor);
  } else {
    drawTank(player);
  }
}

// A number that goes smoothly up and down between 1 - amount and 1, for
// pulsing glows ("phase" shifts it, so not everything pulses together)
function pulse(speed, amount, phase) {
  return 1 - amount * (0.5 + 0.5 * Math.sin(gameTime * speed + phase));
}

// A soft round glow of "color", "size" tiles wide, centered on (cx, cy):
// a cached picture drawn at this opacity (so pulsing only changes alpha)
function drawGlow(cx, cy, color, size, alpha) {
  const width = size * field.tileSize;
  const picture = cachedPicture("glow" + color + size, width, width, (c) => {
    softPatch(c, width / 2, width / 2, width / 2, color, 1);
  });
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(picture, cx - width / 2, cy - width / 2, width, width);
  ctx.globalAlpha = before;
}

// Enemies look faded while the clock power-up has frozen them (on top
// of any fading already set, like under the forest)
function drawEnemies() {
  const before = ctx.globalAlpha;
  if (isEffectActive("clock") || debugFreezeEnemies) ctx.globalAlpha = before * 0.5;
  for (const enemy of enemies) drawTank(enemy);
  ctx.globalAlpha = before;
}

// A round pickup badge for a power-up type, "size" pixels wide,
// centered on (cx, cy). Painted once (paintBadge in powerups.js) and
// copied after that.
function drawBadge(type, cx, cy, size) {
  const picture = cachedPicture("badge" + type + size, size, size, (c) => paintBadge(c, size, type));
  ctx.drawImage(picture, cx - size / 2, cy - size / 2, size, size);
}

// The power-up on the map: its badge floating gently up and down over a
// pulsing glow in its color. Blinks during its last seconds on the map.
function drawPowerUp() {
  if (!powerUp) return;
  const look = PICKUP_LOOKS;
  const timeLeft = POWERUPS.lifetime - powerUp.age;
  if (timeLeft < POWERUPS.blinkTime && Math.floor(powerUp.age * look.blinkRate) % 2 === 1) return;
  const s = field.tileSize;
  const { x: cx, y: cy } = mapToScreen(powerUp.col + 0.5, powerUp.row + 0.5);
  drawGlow(cx, cy, POWERUP_TYPES[powerUp.type].color, look.glowSize,
           look.glowAlpha * pulse(look.pulseSpeed, look.pulseAmount, 0));
  const bob = Math.sin(gameTime * look.bobSpeed) * look.bobHeight * s;
  drawBadge(powerUp.type, cx, cy + bob, s * look.badgeSize);
}

// Active timed power-ups in the HUD, side by side around centerX: a
// small badge each, with a bar under it that shrinks as the time runs
// out. (The shop's armor is an upgrade badge under the display.)
function drawEffectTimers(types, centerX, y, size) {
  const gap = size * 0.25;
  const barHeight = Math.max(2, size * 0.14);
  const totalWidth = types.length * size + (types.length - 1) * gap;
  let x = centerX - totalWidth / 2 + size / 2;

  for (const type of types) {
    drawBadge(type, x, y - barHeight / 2, size * 0.85);

    // Countdown bar under the icon
    const fraction = activeEffects[type] / effectFullTime[type];
    const barY = y + size * 0.42;
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(x - size / 2, barY, size, barHeight);
    ctx.fillStyle = POWERUP_TYPES[type].color;
    ctx.fillRect(x - size / 2, barY, size * fraction, barHeight);
    x += size + gap;
  }
}

// Bullets: a short bright streak with a dark edge, pointing the way it
// flies, and a faint tail behind it (never reaching back past the
// cannon it left). Only the look: a bullet is still a point for hits.
// Sizes are in FEEDBACK (config.js).
function drawBullets() {
  const s = field.tileSize;
  const look = FEEDBACK;
  ctx.lineCap = "round";
  for (const bullet of bullets) {
    const step = DIRECTIONS[bullet.dir];
    const flown = Math.abs(bullet.x - bullet.fromX) + Math.abs(bullet.y - bullet.fromY);
    const head = mapToScreen(bullet.x, bullet.y);
    const back = Math.min(look.bulletLength, flown);
    const end = mapToScreen(bullet.x - step.x * back, bullet.y - step.y * back);
    const tailLength = Math.min(look.bulletTail, flown);
    const tail = mapToScreen(bullet.x - step.x * tailLength, bullet.y - step.y * tailLength);

    // Player bullets are white (orange when armor-piercing), enemy
    // bullets are a bit red
    let color = "#ffb3a6";
    if (bullet.owner === player) color = bullet.damage >= ARMOR_PIERCING_DAMAGE ? "#ff9a2e" : "#ffffff";

    // The tail, then the streak: its dark edge first, the color over it
    ctx.strokeStyle = color;
    ctx.globalAlpha = look.bulletTailAlpha;
    ctx.lineWidth = s * look.bulletWidth * 0.6;
    line(tail, end);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = s * look.bulletWidth + 2;
    line(end, head);
    ctx.strokeStyle = color;
    ctx.lineWidth = s * look.bulletWidth;
    line(end, head);
  }
  ctx.lineCap = "butt";

  function line(from, to) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

// Normal tank shape (the player uses this; enemy types can change it)
const NORMAL_LOOK = { width: 1, turret: 1, barrel: 1 };

// A tank with a soft shadow under it. Its picture (one per look, colors
// and direction) is painted once by paintTank and copied after that.
// On the playfield it points the way its map direction looks on screen
// (turned with the playfield in landscape).
// "lookColors" (optional) replaces its colors, e.g. the player's shield
// or armor look (PLAYER_LOOKS).
// "place" (optional, e.g. the shop's preview) draws it elsewhere:
// { x, y, size } in pixels instead of on its tile, as it faces.
function drawTank(tank, lookColors, place) {
  const s = place ? place.size : field.tileSize; // the tank is one tile big
  // White for a moment after being hit, otherwise its own colors
  // Power-up carriers blink white all the time
  const carrierBlink = tank.carriesPowerUp && Math.floor(gameTime * 6) % 2 === 1;
  const colors = tank.flashTimer > 0 || carrierBlink ? FLASH_COLORS : lookColors || tank.colors;
  const look = tank.look || NORMAL_LOOK;
  const at = place || tileToScreen(tank.x, tank.y);
  const facing = place ? tank.facing : directionOnScreen(tank.facing);

  drawSoftShadow(at.x, at.y, VISUALS.tankShadowSize, VISUALS.tankShadowAlpha, place ? s : undefined);

  const key = "tank" + look.width + "," + look.turret + "," + look.barrel +
    colors.body + colors.track + colors.turret + colors.outline + facing + (place ? s : "");
  const picture = cachedPicture(key, s, s, (c) => paintTank(c, s, look, colors, facing));
  // Just after firing the picture sits a little back (recoil, feedback.js);
  // the shadow and the tank itself stay where they are
  const recoil = place ? 0 : tankRecoil(tank) * s;
  const step = DIRECTIONS[facing];
  ctx.drawImage(picture, at.x - step.x * recoil, at.y - step.y * recoil, s, s);
}

// A point given for a tank pointing up (around its center), turned to
// "facing" (a quarter turn clockwise for "right", and so on)
function turnPoint(x, y, facing) {
  if (facing === "right") return { x: -y, y: x };
  if (facing === "down") return { x: -x, y: -y };
  if (facing === "left") return { x: y, y: -x };
  return { x, y };
}

// The same for a rectangle (quarter turns keep it a rectangle)
function turnRect(left, top, width, height, facing) {
  const a = turnPoint(left, top, facing);
  const b = turnPoint(left + width, top + height, facing);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

// Paint a tank seen from above on context c (a tile-sized picture):
// dark tracks with tread lines, a square hull, a short thick cannon and
// a round turret. The shapes are laid out pointing up and turned to
// "facing" before painting, so the light always comes from the top-left
// (light top/left edges, dark bottom/right edges, a shine on the turret).
// Sizes are tile fractions; "look" makes it slimmer or bulkier.
function paintTank(c, s, look, colors, facing) {
  const outline = colors.outline;
  const edge = Math.max(1, s * 0.035); // width of the light and dark edges
  c.translate(s / 2, s / 2);            // (0, 0) = the tank's center
  c.lineWidth = Math.max(1, s * 0.03);
  c.lineJoin = "round";
  c.strokeStyle = outline;

  // A plain rectangle, turned to "facing"
  function plain(left, top, width, height, color) {
    const r = turnRect(left * s, top * s, width * s, height * s, facing);
    c.fillStyle = color;
    c.fillRect(r.x, r.y, r.w, r.h);
    return r;
  }
  // A rectangle with light top/left and dark bottom/right edges
  function block(left, top, width, height, color) {
    const r = plain(left, top, width, height, color);
    c.fillStyle = mixColors(color, "#ffffff", 0.3);
    c.fillRect(r.x, r.y, r.w, edge);
    c.fillRect(r.x, r.y, edge, r.h);
    c.fillStyle = mixColors(color, outline, 0.45);
    c.fillRect(r.x, r.y + r.h - edge, r.w, edge);
    c.fillRect(r.x + r.w - edge, r.y, edge, r.h);
    return r;
  }

  const width = look.width;

  // Tracks: dark, with lighter tread lines across, then an outline
  const outer = 0.43 * width;  // outside edge of the tracks
  const inner = 0.28 * width;  // inside edge
  const tread = mixColors(colors.track, "#ffffff", 0.22);
  const treadThickness = Math.max(1, s * 0.025) / s;
  for (const left of [-outer, inner]) {
    const r = block(left, -0.44, outer - inner, 0.88, colors.track);
    for (let i = 1; i < 8; i++) {
      plain(left, -0.44 + i * 0.11 - treadThickness / 2, outer - inner, treadThickness, tread);
    }
    c.strokeRect(r.x, r.y, r.w, r.h);
  }

  // Hull: a square plate between the tracks, a darker engine deck at the back
  const hullHalf = 0.29 * width;
  const hull = block(-hullHalf, -0.34, hullHalf * 2, 0.68, colors.body);
  c.strokeRect(hull.x, hull.y, hull.w, hull.h);
  plain(-hullHalf * 0.6, 0.2, hullHalf * 1.2, 0.08, mixColors(colors.body, outline, 0.35));

  // Cannon: short and thick, with a wider muzzle at the tip
  const barrelColor = mixColors(colors.turret, outline, 0.25);
  const barrelHalf = 0.065 * look.barrel;
  const barrel = block(-barrelHalf, -0.42, barrelHalf * 2, 0.45, barrelColor);
  c.strokeRect(barrel.x, barrel.y, barrel.w, barrel.h);
  const muzzle = block(-barrelHalf * 1.4, -0.48, barrelHalf * 2.8, 0.09, barrelColor);
  c.strokeRect(muzzle.x, muzzle.y, muzzle.w, muzzle.h);

  // Round turret, shaded like a ball lit from the top-left
  const radius = 0.17 * look.turret * s;
  const center = turnPoint(0, 0.03 * s, facing);
  const shine = c.createRadialGradient(center.x - radius * 0.4, center.y - radius * 0.4, radius * 0.1,
                                       center.x, center.y, radius);
  shine.addColorStop(0, mixColors(colors.turret, "#ffffff", 0.4));
  shine.addColorStop(0.55, colors.turret);
  shine.addColorStop(1, mixColors(colors.turret, outline, 0.4));
  c.beginPath();
  c.arc(center.x, center.y, radius, 0, Math.PI * 2);
  c.fillStyle = shine;
  c.fill();
  c.stroke();

  // Small hatch on the turret, a bit to the back
  const hatch = turnPoint(0.04 * look.turret * s, (0.03 + 0.06 * look.turret) * s, facing);
  c.beginPath();
  c.arc(hatch.x, hatch.y, 0.045 * look.turret * s, 0, Math.PI * 2);
  c.fillStyle = mixColors(colors.turret, outline, 0.35);
  c.fill();
}
