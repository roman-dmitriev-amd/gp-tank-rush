// =====================================================================
//  Power-up types - what each one looks like and what it does.
//  (Drop chances and durations are in config.js -> POWERUPS.)
//
//  Each type has:
//    color     color of its symbol, its glow on the map and its HUD
//              timer bar
//    paintSymbol  paints the symbol inside its round badge:
//              paintSymbol(context, centerX, centerY, size, color)
//              (badges are painted once and cached, see paintBadge)
//    canDrop   (optional) return false to stop it from dropping right
//              now - the game then rolls another type
//    onPickup  (optional) runs once when the player picks it up
//
//  Types with a "duration" in config.js are timed effects. The game
//  keeps their timer (picking up another one resets it) and calls:
//    onStart   (optional) when the effect starts
//    onTick    (optional) every frame while active: onTick(secondsLeft)
//    onEnd     (optional) when the time runs out or the level ends
//  Other code can check a timed effect with isEffectActive("shield").
//
//  To add a new power-up: add an entry here and one in config.js.
// =====================================================================

const POWERUP_TYPES = {
  // Repair: rebuild the walls around the base as full-health brick
  repair: {
    color: "#4cc35f",          // green
    paintSymbol: paintWrench,
    canDrop: () => baseWallsNeedRepair(),
    onPickup: () => {
      setBaseWalls("brick");
      // If fortify is running, the walls should stay metal
      if (isEffectActive("fortify")) setBaseWalls("metal");
    },
  },

  // Shield: the player can't be destroyed (checked in bullets.js)
  shield: {
    color: PLAYER_LOOKS.shieldGlow,  // blue, like the shielded tank
    paintSymbol: paintShield,
  },

  // Fortify: the walls around the base become metal for a while
  fortify: {
    color: "#c4ccd4",          // silver-grey
    paintSymbol: paintMetalBlock,
    onStart: () => setBaseWalls("metal"),
    onTick: (secondsLeft) => {
      // Near the end, blink: the walls are still metal, but are drawn
      // as brick every other moment as a warning
      const blinking = secondsLeft < POWERUPS.types.fortify.blinkTime;
      const showBrick = blinking && Math.floor(secondsLeft * 4) % 2 === 0;
      for (const [col, row] of baseWallTiles()) {
        const cell = map[row][col];
        cell.drawAs = cell.material === "metal" && showBrick ? "brick" : null;
      }
    },
    onEnd: () => setBaseWalls("brick"),
  },

  // Clock: enemies can't move or shoot (checked in enemyai.js)
  clock: {
    color: "#ff9a2e",          // orange
    paintSymbol: paintClock,
  },
};

// The shop armor has a round badge too (on its shop card), in the
// armor's silver
const ARMOR_BADGE = { color: PLAYER_LOOKS.armorRing, paintSymbol: paintArmor };

// ---------------------------------------------------------------------
// Base wall helpers used by the effects above
// ---------------------------------------------------------------------

// Put a fresh wall of this material on every tile around the base.
// Tiles with a tank on them are skipped, so no tank gets stuck.
function setBaseWalls(materialId) {
  for (const [col, row] of baseWallTiles()) {
    if (tileHasTank(col, row)) continue;
    setTile(col, row, materialId);
  }
}

// Is any wall around the base missing or damaged?
function baseWallsNeedRepair() {
  return baseWallTiles().some(([col, row]) => {
    const cell = map[row][col];
    const material = MATERIALS[cell.material];
    if (cell.material === "empty") return true;            // missing
    return material.health !== null && cell.health < material.health; // damaged
  });
}

// ---------------------------------------------------------------------
// Badges, symbols and the coin. These paint on a context "c" and are
// only called once per look and size: the game caches the result
// (cachedPicture in render.js) and copies it every frame. Colors of the
// metal rim, the dark face and the coin are in config.js (PICKUP_LOOKS).
// Light comes from the top-left, like everywhere else.
// ---------------------------------------------------------------------

// The badge of a power-up type (see paintRoundBadge)
function paintBadge(c, size, type) {
  paintRoundBadge(c, size, POWERUP_TYPES[type]);
}

// A round badge "size" pixels wide: a metal rim, a dark face with a
// faint ring in the symbol's color, the symbol, and a soft gloss on top.
// look = { color, paintSymbol } (power-ups, the shop's items)
function paintRoundBadge(c, size, look) {
  const [rimLight, rimMiddle, rimDark] = PICKUP_LOOKS.rim;
  const [faceMiddle, faceEdge] = PICKUP_LOOKS.badge;
  const m = size / 2; // center
  const r = size / 2;

  disc(c, m, m, r, rimDark);
  const rim = c.createLinearGradient(0, 0, size, size);
  rim.addColorStop(0, rimLight);
  rim.addColorStop(0.5, rimMiddle);
  rim.addColorStop(1, rimDark);
  disc(c, m, m, r * 0.92, rim);

  const face = c.createRadialGradient(m, m - r * 0.2, r * 0.1, m, m, r * 0.8);
  face.addColorStop(0, faceMiddle);
  face.addColorStop(1, faceEdge);
  disc(c, m, m, r * 0.78, face);

  c.lineWidth = Math.max(1, size * 0.025);
  c.strokeStyle = withAlpha(look.color, 0.55);
  c.beginPath();
  c.arc(m, m, r * 0.71, 0, Math.PI * 2);
  c.stroke();

  look.paintSymbol(c, m, m, size * 0.62, look.color);

  // Gloss: a faint light band over the top of the face
  c.save();
  c.beginPath();
  c.arc(m, m, r * 0.78, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = "rgba(255, 255, 255, 0.12)";
  c.beginPath();
  c.ellipse(m, m - r * 0.5, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Fill for a symbol in "color": lighter at the top, darker at the bottom
function symbolFill(c, cy, size, color) {
  const fill = c.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  fill.addColorStop(0, mixColors(color, "#ffffff", 0.45));
  fill.addColorStop(1, mixColors(color, "#000000", 0.25));
  return fill;
}

// The dark outline color for a symbol in "color"
function symbolOutline(color) {
  return mixColors(color, "#000000", 0.65);
}

// Wrench (repair): a handle with a round head and an open jaw, tilted.
// Drawn once thicker in the outline color, then in the symbol's color.
function paintWrench(c, cx, cy, size, color) {
  const outline = Math.max(1, size * 0.06);
  c.save();
  c.translate(cx, cy);
  c.rotate(Math.PI / 4);
  c.lineCap = "round";
  for (const [extra, paint] of [[outline, symbolOutline(color)], [0, symbolFill(c, 0, size, color)]]) {
    c.strokeStyle = paint;
    c.lineWidth = size * 0.18 + extra * 2;
    c.beginPath();
    c.moveTo(0, -size * 0.1);
    c.lineTo(0, size * 0.36);
    c.stroke();
    disc(c, 0, -size * 0.2, size * 0.21 + extra, paint);
  }
  // The open jaw: a slot in the badge's face color
  c.fillStyle = PICKUP_LOOKS.badge[0];
  c.fillRect(-size * 0.075, -size * 0.46, size * 0.15, size * 0.24);
  c.restore();
}

// Shield: flat-ish top curving down to a point, the left half lit, a
// light ridge down the middle
function paintShield(c, cx, cy, size, color) {
  const w = size * 0.36;
  const top = cy - size * 0.38;
  const bottom = cy + size * 0.44;
  const shape = () => {
    c.beginPath();
    c.moveTo(cx - w, top);
    c.quadraticCurveTo(cx, top - size * 0.08, cx + w, top);
    c.quadraticCurveTo(cx + w, cy + size * 0.15, cx, bottom);
    c.quadraticCurveTo(cx - w, cy + size * 0.15, cx - w, top);
    c.closePath();
  };
  shape();
  c.lineWidth = Math.max(2, size * 0.12);
  c.strokeStyle = symbolOutline(color);
  c.stroke();
  c.fillStyle = symbolFill(c, cy, size, color);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = "rgba(255, 255, 255, 0.2)";
  c.fillRect(cx - w, top - size * 0.1, w, size);
  c.restore();
  c.strokeStyle = withAlpha(mixColors(color, "#ffffff", 0.7), 0.9);
  c.lineWidth = Math.max(1, size * 0.045);
  c.beginPath();
  c.moveTo(cx, top + size * 0.05);
  c.lineTo(cx, bottom - size * 0.12);
  c.stroke();
}

// Metal block (fortify): a small steel plate with a bevel and 4 rivets
function paintMetalBlock(c, cx, cy, size, color) {
  const half = size * 0.36;
  const left = cx - half;
  const top = cy - half;
  const side = half * 2;
  const edge = Math.max(1, side * 0.14);
  const outline = Math.max(1, size * 0.06);
  c.fillStyle = symbolOutline(color);
  c.fillRect(left - outline, top - outline, side + outline * 2, side + outline * 2);
  c.fillStyle = symbolFill(c, cy, side, color);
  c.fillRect(left, top, side, side);
  c.fillStyle = mixColors(color, "#ffffff", 0.6);   // lit top and left edges
  c.fillRect(left, top, side, edge);
  c.fillRect(left, top, edge, side);
  c.fillStyle = mixColors(color, "#000000", 0.4);   // dark bottom and right edges
  c.fillRect(left, top + side - edge, side, edge);
  c.fillRect(left + side - edge, top, edge, side);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + dx * half * 0.5;
    const y = cy + dy * half * 0.5;
    disc(c, x, y, size * 0.06, symbolOutline(color));
    disc(c, x - size * 0.015, y - size * 0.015, size * 0.025, "#ffffff");
  }
}

// Clock: an orange case around a light face, tick marks, two dark hands
function paintClock(c, cx, cy, size, color) {
  const r = size * 0.42;
  disc(c, cx, cy, r + Math.max(1, size * 0.05), symbolOutline(color));
  disc(c, cx, cy, r, symbolFill(c, cy, r * 2, color));
  disc(c, cx, cy, r * 0.72, mixColors(color, "#ffffff", 0.85));
  const dark = symbolOutline(color);
  for (let i = 0; i < 4; i++) {   // ticks at 12, 3, 6 and 9
    const angle = (i * Math.PI) / 2;
    disc(c, cx + Math.sin(angle) * r * 0.55, cy - Math.cos(angle) * r * 0.55, Math.max(0.7, size * 0.03), dark);
  }
  c.strokeStyle = dark;
  c.lineCap = "round";
  c.lineWidth = Math.max(1, size * 0.07);
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx, cy - r * 0.5);                    // minute hand
  c.moveTo(cx, cy);
  c.lineTo(cx + r * 0.32, cy + r * 0.18);        // hour hand
  c.stroke();
  disc(c, cx, cy, Math.max(1, size * 0.045), color);
}

// Armor (the shop armor's round badge): a small silver tank inside a
// silver ring, like the armored player's tank
function paintArmor(c, cx, cy, size, color) {
  const outline = symbolOutline(color);
  c.lineWidth = Math.max(2, size * 0.1);
  c.strokeStyle = outline;
  c.beginPath();
  c.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.max(1, size * 0.06);
  c.strokeStyle = color;
  c.stroke();
  const half = size * 0.17;
  c.fillStyle = outline;
  c.fillRect(cx - half - 1, cy - half - 1, half * 2 + 2, half * 2 + 2);
  c.fillStyle = symbolFill(c, cy, half * 2, PLAYER_LOOKS.armor.body);
  c.fillRect(cx - half, cy - half, half * 2, half * 2);
  c.fillStyle = PLAYER_LOOKS.armor.turret;
  c.fillRect(cx - size * 0.035, cy - size * 0.3, size * 0.07, size * 0.22);   // barrel
  disc(c, cx, cy, half * 0.6, PLAYER_LOOKS.armor.turret);                   // turret
}

// A gold coin "size" pixels wide: a dark edge, a rim lit from the
// top-left, a face with a raised star and a shine spot
function paintCoin(c, size) {
  const [shine, gold, rim, edge] = PICKUP_LOOKS.coin;
  const m = size / 2;
  const r = size / 2;
  disc(c, m, m, r, edge);
  const rimFill = c.createLinearGradient(0, 0, size, size);
  rimFill.addColorStop(0, shine);
  rimFill.addColorStop(0.5, gold);
  rimFill.addColorStop(1, rim);
  disc(c, m, m, r * 0.88, rimFill);
  const face = c.createRadialGradient(m - r * 0.3, m - r * 0.3, r * 0.1, m, m, r * 0.7);
  face.addColorStop(0, shine);
  face.addColorStop(0.6, gold);
  face.addColorStop(1, mixColors(gold, rim, 0.6));
  disc(c, m, m, r * 0.68, face);

  // A five-pointed star, dark with a light edge above it (raised)
  const star = (dx, dy, color) => {
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? r * 0.4 : r * 0.17;
      const x = m + dx + Math.cos(angle) * radius;
      const y = m + dy + Math.sin(angle) * radius;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
  };
  const step = Math.max(0.5, size * 0.03);
  star(-step, -step, withAlpha(shine, 0.9));
  star(0, 0, withAlpha(rim, 0.85));

  c.fillStyle = "rgba(255, 255, 255, 0.75)";
  c.beginPath();
  c.ellipse(m - r * 0.38, m - r * 0.42, r * 0.18, r * 0.1, -Math.PI / 4, 0, Math.PI * 2);
  c.fill();
}
