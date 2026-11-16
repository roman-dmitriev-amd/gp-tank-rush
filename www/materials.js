// =====================================================================
//  Materials - every kind of map tile, as data.
//
//  Each material has:
//    id              its name, used in code ("brick", "metal", ...)
//    letter          the letter used for it in levels.js layouts
//                    (null = can't be placed in a layout; the game
//                    places it itself, like the base)
//    health          damage it can take before it's destroyed
//                    (null = can never be destroyed)
//    minDamageToHurt bullets with less damage than this just bounce
//                    off with a spark (normal bullets do 1 damage,
//                    armor-piercing ones do 2)
//    blocksTank      tanks can't drive through it
//    blocksBullet    bullets hit it (if false, they fly over it)
//    layer           when it's drawn:
//                      "ground"  first (floor tiles: sand, ice, water)
//                      "solid"   next (walls that block things)
//                      then the tanks and bullets
//                      "overlay" last, on top of the tanks (forest)
//                    Tanks under an "overlay" tile show faintly
//                    (TERRAIN.forestEnemyAlpha / forestPlayerAlpha).
//    speedFactor     (optional) tanks on it move at this times their
//                    speed (checked at the tank's center), default 1
//    slippery        (optional) tanks on it keep sliding for a moment
//                    after they stop or turn (ice)
//    hitSound        (optional) the sound (audio.js) when a bullet
//                    damages it; bullets that bounce off play "metalHit"
//    destroySound    (optional) the sound instead of hitSound when the
//                    hit destroys it
//    castsShadow     (optional) throws a shadow onto the floor to the
//                    bottom-right, so it looks raised (render.js)
//    draw            function that draws one tile of it:
//                    draw(x, y, size, cell, col, row) where cell.health
//                    is the health it has left and col, row its place
//                    on the map
//
//  To add a new material, add an entry here (and its draw function
//  below). Its numbers (like the sand speed) go in config.js (TERRAIN).
// =====================================================================

const MATERIALS = {
  empty: {
    id: "empty",
    letter: ".",
    health: null,
    minDamageToHurt: 0,
    blocksTank: false,
    blocksBullet: false,
    layer: "ground",
    draw: null,          // nothing: the ground shows through
  },

  brick: {
    id: "brick",
    letter: "B",
    health: 2,
    minDamageToHurt: 1,
    blocksTank: true,
    blocksBullet: true,
    layer: "solid",
    hitSound: "brickHit",
    destroySound: "brickDestroy",
    castsShadow: true,
    draw: drawBrick,
  },

  concrete: {
    id: "concrete",
    letter: "C",
    health: 4,
    minDamageToHurt: 1,
    blocksTank: true,
    blocksBullet: true,
    layer: "solid",
    hitSound: "concreteHit",
    castsShadow: true,
    draw: drawConcrete,
  },

  metal: {
    id: "metal",
    letter: "M",
    health: 6,           // 3 armor-piercing hits (damage 2 each)
    minDamageToHurt: 2,  // only armor-piercing bullets can hurt it
    blocksTank: true,
    blocksBullet: true,
    layer: "solid",
    hitSound: "metalHit",
    castsShadow: true,
    draw: drawMetal,
  },

  // Water: tanks can't drive into it, bullets fly over it
  water: {
    id: "water",
    letter: "W",
    health: null,
    minDamageToHurt: 0,
    blocksTank: true,
    blocksBullet: false,
    layer: "ground",
    draw: drawWater,
  },

  // Forest: blocks nothing, but is drawn over tanks and bullets
  forest: {
    id: "forest",
    letter: "F",
    health: null,
    minDamageToHurt: 0,
    blocksTank: false,
    blocksBullet: false,
    layer: "overlay",
    draw: drawForest,
  },

  // Sand: blocks nothing, tanks drive slower on it
  sand: {
    id: "sand",
    letter: "S",
    health: null,
    minDamageToHurt: 0,
    blocksTank: false,
    blocksBullet: false,
    layer: "ground",
    speedFactor: TERRAIN.sandSpeedFactor,
    draw: drawSand,
  },

  // Ice: blocks nothing, tanks slide on it
  ice: {
    id: "ice",
    letter: "I",
    health: null,
    minDamageToHurt: 0,
    blocksTank: false,
    blocksBullet: false,
    layer: "ground",
    slippery: true,
    draw: drawIce,
  },

  // The player's base (a gold star). The game places it from the level's
  // "base" position; if it's hit, the game is lost.
  base: {
    id: "base",
    letter: null,
    health: 1,
    minDamageToHurt: 1,
    blocksTank: true,
    blocksBullet: true,
    layer: "solid",
    isBase: true,
    draw: drawBase,
  },
};

// ---------------------------------------------------------------------
// Drawing helpers
// These use the game's canvas "ctx" (set up in layout.js).
// x, y = top-left corner of the tile on screen, s = tile size.
// Colors come from the current theme (themes.js), so the same shapes
// look different in each world.
// ---------------------------------------------------------------------

// This material's colors in the current theme, e.g. tileColors("brick")
function tileColors(materialId) {
  return currentTheme().tiles[materialId];
}

// Crack lines, as tile fractions (0 = left/top, 1 = right/bottom).
// One more crack is shown for every point of damage taken.
const CRACKS = [
  [[0.15, 0.1], [0.35, 0.35], [0.25, 0.55], [0.45, 0.85]],
  [[0.85, 0.15], [0.65, 0.4], [0.75, 0.6], [0.6, 0.9]],
  [[0.5, 0.05], [0.55, 0.3], [0.42, 0.5]],
  [[0.08, 0.7], [0.3, 0.72], [0.38, 0.95]],
];

// Darken the tile and draw cracks depending on how much health it has
// lost. Does nothing for an undamaged tile.
function drawDamage(x, y, s, health, maxHealth, crackColor) {
  const damageTaken = maxHealth - health;
  if (damageTaken <= 0) return;

  // Darker the more damaged it is (up to half dark)
  ctx.fillStyle = "rgba(0, 0, 0, " + (0.5 * damageTaken / maxHealth) + ")";
  ctx.fillRect(x, y, s, s);

  // One crack per point of damage (as many as we have drawn)
  ctx.strokeStyle = crackColor;
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.lineJoin = "round";
  ctx.beginPath();
  const crackCount = Math.min(damageTaken, CRACKS.length);
  for (let i = 0; i < crackCount; i++) {
    const crack = CRACKS[i];
    ctx.moveTo(x + crack[0][0] * s, y + crack[0][1] * s);
    for (const [fx, fy] of crack.slice(1)) ctx.lineTo(x + fx * s, y + fy * s);
  }
  ctx.stroke();
}

// A color between two "#rrggbb" colors: amount 0 = a, 1 = b
function mixColors(a, b, amount) {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  let result = "#";
  for (const shift of [16, 8, 0]) {
    const va = (ca >> shift) & 255;
    const vb = (cb >> shift) & 255;
    result += Math.round(va + (vb - va) * amount).toString(16).padStart(2, "0");
  }
  return result;
}

// A "#rrggbb" color as an rgba() string with this opacity (0-1)
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
}

// Brick: rows of bricks with dark sunken joints, every other row
// shifted by half a brick, like a real wall. The wall around the base
// uses the theme's "baseWall" colors. Drawing every brick each frame
// would be slow, so each look is painted once (cachedPicture in render.js)
// and copied after that; only the damage is drawn live.
const BRICK_VARIANTS = 4;  // how many different brick tile looks

function drawBrick(x, y, s, cell, col, row) {
  const colors = cell.baseWall ? currentTheme().baseWall : tileColors("brick");
  // A few different looks, mixed by position, so walls don't repeat
  const variant = (col + row * 2) % BRICK_VARIANTS;
  const key = "brick" + colors.fill + colors.mortar + colors.outline + variant;
  const picture = cachedPicture(key, s, s, (c) => paintBrick(c, s, colors, variant));
  ctx.drawImage(picture, x, y, s, s);

  drawDamage(x, y, s, cell.health, MATERIALS.brick.health, colors.crack);
}

// Paint one brick tile at (0, 0) on the context c. Each brick is a
// little lighter or darker than the others, lit from the top-left
// (light top/left edges, dark bottom/right edges), with a few specks
// and sometimes a chipped corner. The joints are the theme's outline
// color with a little mortar in it. A fixed seed per variant gives the
// same look every time.
function paintBrick(c, s, colors, variant) {
  const random = makeRandom(variant * 101 + 7);
  const joint = mixColors(colors.outline, colors.mortar, 0.3);
  c.fillStyle = joint;
  c.fillRect(0, 0, s, s);

  const rows = 4;
  const rowHeight = s / rows;
  const gap = Math.max(1, s * 0.045); // width of the joints
  for (let r = 0; r < rows; r++) {
    // Joints as tile fractions: two whole bricks, or (every other row)
    // a whole brick between two halves
    const edges = r % 2 === 0 ? [0, 0.5, 1] : [0, 0.25, 0.75, 1];
    for (let i = 0; i < edges.length - 1; i++) {
      const left = edges[i] * s + gap / 2;
      const right = edges[i + 1] * s - gap / 2;
      const top = r * rowHeight + gap / 2;
      const bottom = (r + 1) * rowHeight - gap / 2;
      const w = right - left;
      const h = bottom - top;

      // This brick's color: a bit toward the outline or the mortar
      const tint = random() - 0.5;
      const brick = tint < 0 ? mixColors(colors.fill, colors.outline, -tint * 0.5)
                             : mixColors(colors.fill, colors.mortar, tint * 0.4);
      c.fillStyle = brick;
      c.fillRect(left, top, w, h);

      // Light top and left edges, dark bottom and right edges
      const edge = Math.max(1, h * 0.2);
      c.fillStyle = mixColors(brick, colors.mortar, 0.4);
      c.fillRect(left, top, w, edge);
      c.fillRect(left, top, edge * 0.8, h);
      c.fillStyle = mixColors(brick, colors.outline, 0.55);
      c.fillRect(left, bottom - edge, w, edge);
      c.fillRect(right - edge * 0.8, top, edge * 0.8, h);

      // A few small specks, dark and light
      for (let k = 0; k < 6; k++) {
        const size = Math.max(1, s * (0.015 + random() * 0.02));
        c.fillStyle = random() < 0.55 ? mixColors(brick, colors.outline, 0.35)
                                      : mixColors(brick, colors.mortar, 0.3);
        c.fillRect(left + edge + random() * Math.max(0, w - 2 * edge - size),
                   top + edge + random() * Math.max(0, h - 2 * edge - size), size, size);
      }

      // Sometimes a chipped corner (whole bricks only)
      if (random() < 0.3 && w > h) {
        chipCorner(c, left, top, right, bottom, h * 0.4, Math.floor(random() * 4), joint);
      }
    }
  }
}

// Cut a triangle of "color" out of one corner of a block (0 top-left,
// 1 top-right, 2 bottom-left, 3 bottom-right), "size" pixels along
// each side
function chipCorner(c, left, top, right, bottom, size, corner, color) {
  const cx = corner % 2 === 0 ? left : right;
  const cy = corner < 2 ? top : bottom;
  const dx = corner % 2 === 0 ? size : -size;
  const dy = corner < 2 ? size : -size;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + dx, cy);
  c.lineTo(cx, cy + dy);
  c.closePath();
  c.fill();
}

// Concrete: four heavy cast blocks (2 x 2) with dark joints, each lit
// from the top-left (light top/left edges, dark bottom/right edges),
// with a faint stain, small pits and now and then a chipped corner.
// Four blocks and no rivets, so it reads differently from metal.
// Painted once per look (cachedPicture in render.js); only the damage is
// drawn live.
const CONCRETE_VARIANTS = 3;

function drawConcrete(x, y, s, cell, col, row) {
  const colors = tileColors("concrete");
  const variant = groundVariant(col, row) % CONCRETE_VARIANTS;
  const key = "concrete" + colors.fill + colors.seam + colors.outline + variant;
  ctx.drawImage(cachedPicture(key, s, s, (c) => paintConcrete(c, s, colors, variant)), x, y, s, s);

  drawDamage(x, y, s, cell.health, MATERIALS.concrete.health, colors.crack);
}

function paintConcrete(c, s, colors, variant) {
  const random = makeRandom(variant * 457 + 31);
  const joint = mixColors(colors.seam, colors.outline, 0.5);
  c.fillStyle = joint;
  c.fillRect(0, 0, s, s);

  const gap = Math.max(1, s * 0.05);  // width of the joints
  const edge = Math.max(1, s * 0.05); // width of the light and dark edges
  const half = s / 2;
  for (const [bx, by] of [[0, 0], [half, 0], [0, half], [half, half]]) {
    const left = bx + gap / 2;
    const top = by + gap / 2;
    const size = half - gap;

    // This block's color: a bit darker or lighter than the others
    const tone = random() - 0.5;
    const block = tone < 0 ? mixColors(colors.fill, colors.seam, -tone * 0.5)
                           : mixColors(colors.fill, "#ffffff", tone * 0.3);
    c.fillStyle = block;
    c.fillRect(left, top, size, size);

    // A faint stain and small pits, kept on this block
    c.save();
    c.beginPath();
    c.rect(left, top, size, size);
    c.clip();
    softPatch(c, left + size * (0.2 + random() * 0.6), top + size * (0.2 + random() * 0.6),
              size * (0.3 + random() * 0.3), colors.seam, 0.4);
    for (let k = 0; k < 6; k++) {
      const pit = Math.max(0.5, s * (0.012 + random() * 0.015));
      c.fillStyle = random() < 0.7 ? withAlpha(colors.outline, 0.45) : "rgba(255, 255, 255, 0.35)";
      c.fillRect(left + edge + random() * (size - 2 * edge - pit), top + edge + random() * (size - 2 * edge - pit), pit, pit);
    }
    c.restore();

    // Light top and left edges, dark bottom and right edges
    c.fillStyle = mixColors(block, "#ffffff", 0.45);
    c.fillRect(left, top, size, edge);
    c.fillRect(left, top, edge, size);
    c.fillStyle = mixColors(block, colors.outline, 0.45);
    c.fillRect(left, top + size - edge, size, edge);
    c.fillRect(left + size - edge, top, edge, size);

    // Sometimes a chipped corner
    if (random() < 0.35) {
      chipCorner(c, left, top, left + size, top + size, size * (0.18 + random() * 0.12), Math.floor(random() * 4), joint);
    }
  }

  // Dark outline around the tile, so neighbouring tiles stay apart
  c.strokeStyle = colors.outline;
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, s - 1, s - 1);
}

// Metal: a thick steel plate, lighter toward the top-left, with fine
// brushed lines, a wide bevel (bright top, light left, dark right,
// darkest bottom), a few scratches and a shaded rivet in each corner.
// Only armor-piercing bullets hurt it (its cracks are drawn live).
// Painted once per look (cachedPicture in render.js).
const METAL_VARIANTS = 3;

function drawMetal(x, y, s, cell, col, row) {
  const colors = tileColors("metal");
  const variant = groundVariant(col, row) % METAL_VARIANTS;
  const key = "metal" + colors.fill + colors.shine + colors.shadow + colors.rivet + colors.outline + variant;
  ctx.drawImage(cachedPicture(key, s, s, (c) => paintMetal(c, s, colors, variant)), x, y, s, s);

  drawDamage(x, y, s, cell.health, MATERIALS.metal.health, colors.crack);
}

function paintMetal(c, s, colors, variant) {
  const random = makeRandom(variant * 683 + 37);
  const steel = c.createLinearGradient(0, 0, s, s);
  steel.addColorStop(0, mixColors(colors.fill, colors.shine, 0.35));
  steel.addColorStop(1, mixColors(colors.fill, colors.shadow, 0.35));
  c.fillStyle = steel;
  c.fillRect(0, 0, s, s);

  // Brushed lines across the plate
  const line = Math.max(0.5, s * 0.012);
  for (let y = 0; y < s; y += line * 2.5) {
    c.fillStyle = withAlpha(random() < 0.5 ? colors.shine : colors.shadow, 0.12);
    c.fillRect(0, y, s, line);
  }

  // Scratches: thin light lines with a dark edge beside them
  const scratches = 1 + Math.floor(random() * 3);
  c.lineCap = "round";
  c.lineWidth = Math.max(0.5, s * 0.012);
  for (let k = 0; k < scratches; k++) {
    const x0 = s * (0.25 + random() * 0.5);
    const y0 = s * (0.25 + random() * 0.5);
    const angle = random() * Math.PI;
    const length = s * (0.08 + random() * 0.12);
    const x1 = x0 + Math.cos(angle) * length;
    const y1 = y0 + Math.sin(angle) * length;
    for (const [shift, color] of [[c.lineWidth, withAlpha(colors.outline, 0.5)], [0, withAlpha(colors.shine, 0.8)]]) {
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(x0 + shift, y0 + shift);
      c.lineTo(x1 + shift, y1 + shift);
      c.stroke();
    }
  }

  // Wide bevel: four slanted strips that meet at the corners
  const e = s * 0.11;
  const strip = (points, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) c.lineTo(px, py);
    c.closePath();
    c.fill();
  };
  strip([[0, 0], [s, 0], [s - e, e], [e, e]], mixColors(colors.fill, colors.shine, 0.7));            // top
  strip([[0, 0], [e, e], [e, s - e], [0, s]], mixColors(colors.fill, colors.shine, 0.45));           // left
  strip([[s, 0], [s, s], [s - e, s - e], [s - e, e]], mixColors(colors.fill, colors.shadow, 0.7));   // right
  strip([[0, s], [e, s - e], [s - e, s - e], [s, s]], colors.shadow);                                // bottom

  // Rivets: a shadow to the bottom-right, then a dome lit from the top-left
  const r = s * 0.065;
  c.lineWidth = Math.max(0.5, s * 0.012);
  c.strokeStyle = withAlpha(colors.outline, 0.7);
  for (const [fx, fy] of [[0.24, 0.24], [0.76, 0.24], [0.24, 0.76], [0.76, 0.76]]) {
    const x = fx * s;
    const y = fy * s;
    disc(c, x + r * 0.35, y + r * 0.4, r, withAlpha(colors.outline, 0.5));
    const dome = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    dome.addColorStop(0, colors.rivet);
    dome.addColorStop(1, mixColors(colors.rivet, colors.shadow, 0.65));
    c.fillStyle = dome;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  // Dark outline around the tile
  c.strokeStyle = colors.outline;
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, s - 1, s - 1);
}

// The base: a gold star, or the broken star plate once it has been
// destroyed. Both are painted once (cachedPicture in render.js).
function drawBase(x, y, s, cell) {
  const broken = cell.health <= 0;
  const picture = cachedPicture(broken ? "baseBroken" : "base", s, s, (c) => paintBase(c, s, broken));
  ctx.drawImage(picture, x, y, s, s);
}

// The base on context c: a dark frame with a rivet in each corner, an
// octagonal steel plate with a bevel, a gold ring and a faceted gold
// star. Light comes from the top-left: facets and edges facing it are
// lighter. Colors are in config.js (BASE_LOOK).
// "broken" paints the destroyed base instead: everything darker, a
// rivet missing, the plate cracked, the ring in pieces, two arms of the
// star broken off, shards of gold and steel around, soot and embers.
function paintBase(c, s, broken) {
  const look = BASE_LOOK;
  const tone = (color) => (broken ? mixColors(color, look.frame, 0.45) : color);
  const [plateLight, plateMiddle, plateDark] = look.plate.map(tone);
  const [shine, gold, shade, outline] = look.gold.map(tone);
  const random = makeRandom(77); // the same broken look every time
  const m = s / 2;

  // Dark frame, with a small rivet in each corner (one gone when broken)
  c.fillStyle = look.frame;
  c.fillRect(0, 0, s, s);
  for (const [fx, fy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
    if (broken && fx > 0.5 && fy < 0.5) continue;
    disc(c, fx * s, fy * s, s * 0.035, tone(look.rivet));
    disc(c, fx * s - s * 0.01, fy * s - s * 0.01, s * 0.012, tone("#ffffff"));
  }

  // Octagonal steel plate: a lit bevel (lighter at the top-left), then
  // the flat face a little inside it
  const octagon = (inset) => {
    const cut = s * 0.24 - inset * 0.41; // keeps the slanted sides parallel
    const a = inset;
    const b = s - inset;
    c.beginPath();
    c.moveTo(a + cut, a);
    c.lineTo(b - cut, a);
    c.lineTo(b, a + cut);
    c.lineTo(b, b - cut);
    c.lineTo(b - cut, b);
    c.lineTo(a + cut, b);
    c.lineTo(a, b - cut);
    c.lineTo(a, a + cut);
    c.closePath();
  };
  const bevel = c.createLinearGradient(0, 0, s, s);
  bevel.addColorStop(0, plateLight);
  bevel.addColorStop(0.5, plateMiddle);
  bevel.addColorStop(1, plateDark);
  octagon(s * 0.03);
  c.fillStyle = bevel;
  c.fill();
  octagon(s * 0.09);
  c.fillStyle = plateMiddle;
  c.fill();

  // Broken: jagged cracks running out from the middle of the plate
  if (broken) {
    c.strokeStyle = look.frame;
    c.lineWidth = Math.max(1, s * 0.025);
    c.lineJoin = "round";
    for (const start of [0.4, 2.2, 3.9, 5.3]) {
      let angle = start;
      let x = m;
      let y = m;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        angle += (random() - 0.5) * 0.9;
        x += Math.cos(angle) * s * 0.1;
        y += Math.sin(angle) * s * 0.1;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  // Gold ring: a dark outline, then gold lit from the top-left. When
  // broken, only a few pieces are left.
  const ringRadius = s * 0.34;
  const ringWidth = s * 0.065;
  const ringPieces = broken ? [[0.2, 1.1], [1.7, 2.6], [3.4, 4.1], [4.8, 5.8]] : [[0, Math.PI * 2]];
  const ringGold = c.createLinearGradient(m - ringRadius, m - ringRadius, m + ringRadius, m + ringRadius);
  ringGold.addColorStop(0, shine);
  ringGold.addColorStop(0.5, gold);
  ringGold.addColorStop(1, shade);
  for (const [paint, width] of [[outline, ringWidth + Math.max(2, s * 0.04)], [ringGold, ringWidth]]) {
    c.lineWidth = width;
    c.strokeStyle = paint;
    for (const [from, to] of ringPieces) {
      c.beginPath();
      c.arc(m, m, ringRadius, from, to);
      c.stroke();
    }
  }

  // The star (when broken, the arms at tips 2 and 6 are snapped off)
  paintGoldStar(c, m, m, s * 0.28, s * 0.115, [shine, gold, shade, outline], broken ? [2, 6] : []);

  if (!broken) return;

  // Soot over the middle
  softPatch(c, m, m, s * 0.45, "#000000", 0.5);

  // Shards of gold and steel thrown around, each with a dark edge
  for (let i = 0; i < 7; i++) {
    const angle = random() * Math.PI * 2;
    const distance = s * (0.3 + random() * 0.15);
    const x = m + Math.cos(angle) * distance;
    const y = m + Math.sin(angle) * distance;
    const size = s * (0.04 + random() * 0.04);
    const turn = random() * Math.PI * 2;
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = turn + (k * Math.PI * 2) / 3 + (random() - 0.5);
      c.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
    }
    c.closePath();
    c.lineWidth = Math.max(1, s * 0.015);
    c.strokeStyle = look.frame;
    c.stroke();
    c.fillStyle = i % 2 === 0 ? mixColors(gold, shine, 0.3) : plateLight;
    c.fill();
  }

  // A few dim embers, spread around the middle
  for (let i = 0; i < 4; i++) {
    const angle = (i + random() * 0.6) * (Math.PI / 2);
    const distance = s * (0.08 + random() * 0.2);
    disc(c, m + Math.cos(angle) * distance, m + Math.sin(angle) * distance, s * 0.02, withAlpha("#ff8a2a", 0.85));
  }
}

// A faceted gold star centered on (cx, cy) on context c (the base, and
// the base steel badge). "tip" and "inner" are the distances of its
// 5 tips and 5 inner corners from the middle; colors = [shine, gold,
// shade, outline]. Each arm is two facets sloping down to their outer
// edge, shaded by the way that edge faces the light (top-left). Tips
// listed in "snapped" (0, 2, ... 8, clockwise from the top) are broken
// off close to the middle.
function paintGoldStar(c, cx, cy, tip, inner, colors, snapped) {
  const [shine, gold, shade, outline] = colors;
  const lightAngle = -Math.PI * 0.75; // toward the top-left
  const litColor = (angle) => {
    const amount = Math.cos(angle - lightAngle); // 1 = facing the light, -1 = away
    return amount > 0 ? mixColors(gold, shine, amount * 0.8) : mixColors(gold, shade, -amount * 0.9);
  };

  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 1 ? inner : snapped.includes(i) ? inner * 1.25 : tip;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  const facets = [];
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % 10];
    let nx = by - ay;          // at right angles to the outer edge...
    let ny = -(bx - ax);
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
      nx = -nx;                // ...pointing away from the center
      ny = -ny;
    }
    facets.push({ ax, ay, bx, by, color: litColor(Math.atan2(ny, nx)) });
  }
  const facetPath = (f) => {
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(f.ax, f.ay);
    c.lineTo(f.bx, f.by);
    c.closePath();
  };
  // A thick dark outline around every facet first, then all the facets
  // on top, so only the star's outer outline stays visible
  c.lineJoin = "round";
  c.lineWidth = Math.max(2, tip * 0.18);
  c.strokeStyle = outline;
  for (const f of facets) {
    facetPath(f);
    c.stroke();
  }
  for (const f of facets) {
    facetPath(f);
    c.fillStyle = f.color;
    c.fill();
    c.strokeStyle = f.color; // hide the hairline gaps between facets
    c.lineWidth = 0.5;
    c.stroke();
  }
}

// ---------------------------------------------------------------------
// Terrain tiles: water, forest, sand and ice. Each one looks at its
// four neighbours (sameSides), so patches join up: inside a patch the
// tiles run into each other without seams, and only the sides that
// touch other ground get a shore, a soft edge or a rim. Each look is
// painted once (cachedPicture in render.js) per theme, sides and variant.
// The variant comes from the tile's position (groundVariant, themes.js).
// ---------------------------------------------------------------------

// The four sides of a tile on screen: 0 up, 1 right, 2 down, 3 left
const SIDES = ["up", "right", "down", "left"];

// Which sides of the map tile at (col, row), as it is drawn on screen,
// continue into the same material: bit 1 = up, 2 = right, 4 = down,
// 8 = left. The neighbour on each side is found through directionOnMap
// (render.js), so a turned playfield gets its shores and edges on the
// right sides. Outside the map counts as the same if "outsideCounts" is
// true (a river runs off the map instead of getting a shore along the
// map's edge).
function sameSides(col, row, materialId, outsideCounts) {
  let sides = 0;
  for (let i = 0; i < 4; i++) {
    const step = DIRECTIONS[directionOnMap(SIDES[i])];
    const c = col + step.x;
    const r = row + step.y;
    const outside = c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS;
    if (outside ? outsideCounts : map[r][c].material === materialId) sides |= 1 << i;
  }
  return sides;
}

// Side i is "open": the next tile that way is something else
function isOpen(sides, i) {
  return (sides & (1 << i)) === 0;
}

// Path around a tile on context c: straight along sides that continue
// into the same material, pulled in by "inset" (plus a random wobble) on
// open sides, and cut by "cornerCut" more where two open sides meet, so
// the corner is round. The points are joined with smooth curves, except
// at corners next to a closed side: those stay sharp, so the tile meets
// its neighbours exactly (no little gaps where tiles join).
function tileOutline(c, s, sides, inset, wobble, cornerCut, random) {
  const starts = [[0, 0], [s, 0], [s, s], [0, s]];  // each side's first corner, clockwise
  const along = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const points = [];  // [x, y, sharp]
  for (let i = 0; i < 4; i++) {
    const prev = (i + 3) % 4;
    // The corner, pulled in from the open sides next to it
    const round = isOpen(sides, i) && isOpen(sides, prev);
    const cut = round ? cornerCut : 0;
    const inHere = isOpen(sides, i) ? inset + cut : 0;
    const inPrev = isOpen(sides, prev) ? inset + cut : 0;
    points.push([starts[i][0] + inward[i][0] * inHere + inward[prev][0] * inPrev,
                 starts[i][1] + inward[i][1] * inHere + inward[prev][1] * inPrev, !round]);
    // Three more points along the side
    for (let k = 1; k < 4; k++) {
      const d = isOpen(sides, i) ? inset + (random() - 0.5) * 2 * wobble : 0;
      const u = (k / 4) * s;
      points.push([starts[i][0] + along[i][0] * u + inward[i][0] * d,
                   starts[i][1] + along[i][1] * u + inward[i][1] * d, false]);
    }
  }
  // A closed curve through the midpoints between the points, bending
  // toward each point (or going straight to it if it's sharp)
  const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const first = middle(points[points.length - 1], points[0]);
  c.beginPath();
  c.moveTo(first[0], first[1]);
  for (let k = 0; k < points.length; k++) {
    const [px, py, sharp] = points[k];
    const next = middle(points[k], points[(k + 1) % points.length]);
    if (sharp) {
      c.lineTo(px, py);
      c.lineTo(next[0], next[1]);
    } else {
      c.quadraticCurveTo(px, py, next[0], next[1]);
    }
  }
  c.closePath();
}

// A band along side i of the tile: "color" at the edge (at this
// opacity), fading out "depth" pixels in
function edgeBand(c, s, i, depth, color, alpha) {
  const bands = [            // gradient start and end, then the band's rectangle
    [0, 0, 0, depth, 0, 0, s, depth],
    [s, 0, s - depth, 0, s - depth, 0, depth, s],
    [0, s, 0, s - depth, 0, s - depth, s, depth],
    [0, 0, depth, 0, 0, 0, depth, s],
  ];
  const [x0, y0, x1, y1, rx, ry, rw, rh] = bands[i];
  const fade = c.createLinearGradient(x0, y0, x1, y1);
  fade.addColorStop(0, withAlpha(color, alpha));
  fade.addColorStop(1, withAlpha(color, 0));
  c.fillStyle = fade;
  c.fillRect(rx, ry, rw, rh);
}

// A soft round patch of color, fading out at radius r
function softPatch(c, x, y, r, color, alpha) {
  const patch = c.createRadialGradient(x, y, 0, x, y, r);
  patch.addColorStop(0, withAlpha(color, alpha));
  patch.addColorStop(1, withAlpha(color, 0));
  c.fillStyle = patch;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

// A filled circle
function disc(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

// ----- Water -----
// Three layers: still water (deeper in the middle, light shallows along
// the shores), moving ripples and sparkles on top, then the shore with
// stones on the sides that touch land. The ripples are strips that
// repeat every WAVE_REPEAT tiles sideways and slide along with
// "gameTime" (game.js), so they stop on pause; each row of tiles is
// shifted a bit, so they don't line up.
const WATER_VARIANTS = 3;
const WAVE_REPEAT = 2;

function drawWater(x, y, s, cell, col, row) {
  const colors = tileColors("water");
  const sides = sameSides(col, row, "water", true);
  const variant = groundVariant(col, row) % WATER_VARIANTS;
  const look = colors.fill + colors.wave + colors.bank + sides + "-" + variant;

  ctx.drawImage(cachedPicture("water" + look, s, s, (c) => paintWater(c, s, colors, sides, variant)), x, y, s, s);
  // (The strips run across the screen, so they follow the grid on screen)
  const at = screenCell(col, row); // layout.js
  drawSliding(wavePicture("ripples", colors, s), x, y, s, at.col + gameTime * 0.18 + at.row * 0.37);
  drawSliding(wavePicture("sparkles", colors, s), x, y, s, at.col - gameTime * 0.35 + at.row * 0.61);
  if (sides !== 15) {
    ctx.drawImage(cachedPicture("shore" + look, s, s, (c) => paintShore(c, s, colors, sides, variant)), x, y, s, s);
  }
}

// Draw one tile's worth of a wave strip (wavePicture), starting
// "offset" tiles into it. Adding the tile's column to the offset makes
// neighbouring tiles show neighbouring parts of the strip.
function drawSliding(picture, x, y, s, offset) {
  const scale = picture.width / (s * (WAVE_REPEAT + 1)); // picture pixels per CSS pixel
  const shift = (((offset % WAVE_REPEAT) + WAVE_REPEAT) % WAVE_REPEAT) * s;
  ctx.drawImage(picture, shift * scale, 0, s * scale, picture.height, x, y, s, s);
}

function paintWater(c, s, colors, sides, variant) {
  const random = makeRandom(variant * 389 + 5);
  c.fillStyle = colors.fill;
  c.fillRect(0, 0, s, s);
  // Deeper, darker patches in the middle
  for (let i = 0; i < 2; i++) {
    softPatch(c, s * (0.3 + random() * 0.4), s * (0.3 + random() * 0.4), s * (0.2 + random() * 0.15),
              mixColors(colors.fill, "#000000", 0.3), 0.5);
  }
  // Lighter shallows along the shores
  const shallow = mixColors(colors.fill, colors.wave, 0.5);
  for (let i = 0; i < 4; i++) {
    if (isOpen(sides, i)) edgeBand(c, s, i, s * 0.4, shallow, 0.75);
  }
}

// The moving layer: a strip WAVE_REPEAT + 1 tiles wide that repeats
// every WAVE_REPEAT tiles (everything is drawn again one repeat to the
// left and right, so it joins seamlessly). "ripples" are short light
// crests, "sparkles" small bright glints.
function wavePicture(kind, colors, s) {
  const repeat = WAVE_REPEAT * s;
  return cachedPicture(kind + colors.wave, s * (WAVE_REPEAT + 1), s, (c) => {
    const random = makeRandom(kind === "ripples" ? 41 : 43);
    c.lineCap = "round";
    const count = kind === "ripples" ? 18 : 7;
    for (let i = 0; i < count; i++) {
      const x = random() * repeat;
      const y = s * (0.1 + random() * 0.8);
      const length = s * (kind === "ripples" ? 0.08 + random() * 0.12 : 0.03 + random() * 0.04);
      if (kind === "ripples") {
        c.lineWidth = Math.max(1, s * 0.025);
        c.strokeStyle = withAlpha(colors.wave, 0.25 + random() * 0.4);
      } else {
        c.lineWidth = Math.max(1, s * 0.035);
        c.strokeStyle = withAlpha(mixColors(colors.wave, "#ffffff", 0.7), 0.9);
      }
      for (const copy of [-repeat, 0, repeat]) {
        c.beginPath();
        c.moveTo(x + copy, y);
        c.quadraticCurveTo(x + copy + length / 2, y - s * 0.035, x + copy + length, y);
        c.stroke();
      }
    }
  });
}

// Where the water meets land: a dark wet edge, a broken line of foam and
// a row of stones, on each open side (the rest of the picture is clear)
function paintShore(c, s, colors, sides, variant) {
  const random = makeRandom(variant * 613 + 9);
  const starts = [[0, 0], [s, 0], [s, s], [0, s]];
  const along = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  // A point "u" along side i and "v" in from it
  const at = (i, u, v) => [starts[i][0] + along[i][0] * u + inward[i][0] * v,
                           starts[i][1] + along[i][1] * u + inward[i][1] * v];
  const open = [0, 1, 2, 3].filter((i) => isOpen(sides, i));

  // Wet edge
  for (const i of open) edgeBand(c, s, i, s * 0.2, mixColors(colors.bank, "#000000", 0.45), 0.85);
  // A few bits of foam just off the stones, at uneven spots
  c.lineCap = "round";
  c.lineWidth = Math.max(1, s * 0.025);
  c.strokeStyle = withAlpha(mixColors(colors.wave, "#ffffff", 0.6), 0.5);
  for (const i of open) {
    for (let u = random() * s * 0.3; u < s; u += s * (0.2 + random() * 0.3)) {
      const v = s * (0.11 + random() * 0.08);
      const [x0, y0] = at(i, u, v);
      const [x1, y1] = at(i, u + s * (0.02 + random() * 0.05), v);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
  }
  // Stones, each with its shadow and a light spot (light from the top-left)
  for (const i of open) {
    for (let k = 0; k < 7; k++) {
      const r = s * (0.045 + random() * 0.035);
      const [x, y] = at(i, ((k + 0.5) / 7 + (random() - 0.5) * 0.06) * s, s * (0.03 + random() * 0.05));
      const stone = mixColors(colors.bank, random() < 0.5 ? "#000000" : "#ffffff", random() * 0.25);
      disc(c, x + r * 0.25, y + r * 0.3, r, "rgba(0, 0, 0, 0.35)");
      disc(c, x, y, r, stone);
      disc(c, x - r * 0.3, y - r * 0.3, r * 0.45, mixColors(stone, "#ffffff", 0.35));
    }
  }
}

// ----- Forest -----
// A canopy of round tree crowns, lit from the top-left, over a dark
// floor. Crowns may reach a little over into neighbouring forest tiles
// (FOREST_SPILL), so a big forest is one canopy; on open sides they
// stay inside, which gives a bumpy edge. Drawn a bit see-through
// (the theme's forest "opacity").
const FOREST_VARIANTS = 3;
const FOREST_SPILL = 0.2;  // how far crowns reach into a neighbouring forest tile

function drawForest(x, y, s, cell, col, row) {
  const colors = tileColors("forest");
  const sides = sameSides(col, row, "forest", true);   // where the edge is
  const spill = sameSides(col, row, "forest", false);  // where crowns may reach over
  const variant = groundVariant(col, row) % FOREST_VARIANTS;
  const pad = s * FOREST_SPILL;
  const size = s + pad * 2;
  const key = "forest" + colors.dark + colors.mid + colors.light + sides + "-" + spill + "-" + variant;
  const picture = cachedPicture(key, size, size, (c) => paintForest(c, s, pad, colors, sides, spill, variant));

  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * colors.opacity;
  ctx.drawImage(picture, x - pad, y - pad, size, size);
  ctx.globalAlpha = before;
}

function paintForest(c, s, pad, colors, sides, spill, variant) {
  const random = makeRandom(variant * 277 + 13);
  c.translate(pad, pad); // (0, 0) = the tile's top-left

  // Paint only on the tile and a strip into each neighbouring forest tile
  const strips = [[0, -pad, s, pad], [s, 0, pad, s], [0, s, s, pad], [-pad, 0, pad, s]];
  c.beginPath();
  c.rect(0, 0, s, s);
  for (let i = 0; i < 4; i++) if (!isOpen(spill, i)) c.rect(...strips[i]);
  c.clip();

  // Dark floor under the crowns
  tileOutline(c, s, sides, s * 0.06, s * 0.03, s * 0.08, random);
  c.fillStyle = mixColors(colors.dark, "#000000", 0.35);
  c.fill();

  // Crowns on a 3 x 3 grid with some jitter, drawn from the back (top)
  // to the front; on open sides they're kept inside the tile
  const crowns = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const r = s * (0.19 + random() * 0.08);
      let x = s * ((gx + 0.5) / 3 + (random() - 0.5) * 0.12);
      let y = s * ((gy + 0.5) / 3 + (random() - 0.5) * 0.12);
      if (isOpen(sides, 0)) y = Math.max(y, r * 0.9);
      if (isOpen(sides, 1)) x = Math.min(x, s - r * 0.9);
      if (isOpen(sides, 2)) y = Math.min(y, s - r * 0.9);
      if (isOpen(sides, 3)) x = Math.max(x, r * 0.9);
      crowns.push({ x, y, r });
    }
  }
  crowns.sort((a, b) => a.y - b.y);
  for (const crown of crowns) paintCrown(c, crown.x, crown.y, crown.r, colors, random);
}

// One tree crown: a ball lit from the top-left, covered in small leaf
// clumps (also on its rim, so the outline is bumpy). Clumps facing the
// light are lighter, the ones on the far side darker.
function paintCrown(c, x, y, r, colors, random) {
  const mid = colors.mid;
  const ball = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  ball.addColorStop(0, mixColors(mid, colors.light, 0.5));
  ball.addColorStop(0.55, mid);
  ball.addColorStop(1, colors.dark);
  c.fillStyle = ball;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();

  for (let k = 0; k < 10; k++) {
    const angle = random() * Math.PI * 2;
    const distance = r * (0.25 + random() * 0.65);
    // +1 = on the top-left (toward the light), -1 = on the bottom-right
    const lit = -(Math.cos(angle) + Math.sin(angle)) / Math.SQRT2 * (distance / r);
    const color = lit > 0 ? mixColors(mid, colors.light, lit * 0.8) : mixColors(mid, colors.dark, -lit * 0.8);
    disc(c, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, r * (0.2 + random() * 0.15), color);
  }
}

// ----- Sand -----
// Sand with a soft wavy edge on open sides (the ground shows around it),
// ripple lines that run on from tile to tile, grains, and light top/left
// and shaded bottom/right edges, like a low mound.
const SAND_VARIANTS = 3;

function drawSand(x, y, s, cell, col, row) {
  const colors = tileColors("sand");
  const sides = sameSides(col, row, "sand", true);
  const variant = groundVariant(col, row) % SAND_VARIANTS;
  const key = "sand" + colors.fill + colors.dots + sides + "-" + variant;
  ctx.drawImage(cachedPicture(key, s, s, (c) => paintSand(c, s, colors, sides, variant)), x, y, s, s);
}

function paintSand(c, s, colors, sides, variant) {
  const random = makeRandom(variant * 541 + 17);
  tileOutline(c, s, sides, s * 0.07, s * 0.035, s * 0.08, random);
  c.fillStyle = colors.fill;
  c.fill();
  c.clip(); // everything else stays on the sand

  softPatch(c, s * (0.3 + random() * 0.4), s * (0.3 + random() * 0.4), s * 0.3, colors.dots, 0.25);
  softPatch(c, s * (0.3 + random() * 0.4), s * (0.3 + random() * 0.4), s * 0.25, mixColors(colors.fill, "#ffffff", 0.4), 0.35);

  // Ripples: the same wavy lines at the same heights in every sand tile
  // (one wave per tile), so they join up across a patch
  const lineWidth = Math.max(1, s * 0.025);
  c.lineWidth = lineWidth;
  c.lineCap = "round";
  for (const height of [0.2, 0.52, 0.84]) {
    const lines = [[-lineWidth, mixColors(colors.fill, "#ffffff", 0.45)], [0, colors.dots]];
    for (const [shift, color] of lines) {
      c.strokeStyle = color;
      c.beginPath();
      for (let k = 0; k <= 16; k++) {
        const x = (k / 16) * s;
        const y = height * s + Math.sin((k / 16) * Math.PI * 2 + height * 7) * s * 0.035 + shift;
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  // Grains
  for (let i = 0; i < 20; i++) {
    const size = Math.max(0.5, s * (0.015 + random() * 0.015));
    c.fillStyle = random() < 0.6 ? withAlpha(colors.dots, 0.6) : "rgba(255, 255, 255, 0.35)";
    c.fillRect(random() * s, random() * s, size, size);
  }

  // Edges: lit on the top and left, shaded on the bottom and right
  for (let i = 0; i < 4; i++) {
    if (!isOpen(sides, i)) continue;
    const lit = i === 0 || i === 3;
    edgeBand(c, s, i, s * 0.2, lit ? "#ffffff" : colors.dots, lit ? 0.3 : 0.6);
  }
}

// ----- Ice -----
// A frozen lake, flat and level with the ground: faint blue clouds,
// long diagonal shine streaks that run on across a whole patch, a few
// thin cracks and frost specks. It fills the whole tile (square
// corners); on open sides there's a line of frost at the shore and, on
// the top and left, the bank's soft shadow on the ice.
const ICE_VARIANTS = 3;

function drawIce(x, y, s, cell, col, row) {
  const colors = tileColors("ice");
  const sides = sameSides(col, row, "ice", true);
  const variant = groundVariant(col, row) % ICE_VARIANTS;
  const key = "ice" + colors.fill + colors.shine + colors.outline + sides + "-" + variant;
  ctx.drawImage(cachedPicture(key, s, s, (c) => paintIce(c, s, colors, sides, variant)), x, y, s, s);
}

function paintIce(c, s, colors, sides, variant) {
  const random = makeRandom(variant * 797 + 21);
  c.fillStyle = colors.fill;
  c.fillRect(0, 0, s, s);

  for (let i = 0; i < 2; i++) {
    softPatch(c, s * (0.25 + random() * 0.5), s * (0.25 + random() * 0.5), s * (0.2 + random() * 0.15),
              mixColors(colors.fill, colors.outline, 0.6), 0.5);
  }

  // Shine streaks along x + y = k (and k + 1 tiles): the same lines in
  // every ice tile, so they continue into the neighbours
  c.strokeStyle = withAlpha(colors.shine, 0.8);
  for (const [k, width] of [[0.3, 0.07], [0.42, 0.025], [0.8, 0.04]]) {
    c.lineWidth = Math.max(1, s * width);
    c.beginPath();
    c.moveTo(0, k * s);
    c.lineTo(k * s, 0);
    c.moveTo(k * s, s);
    c.lineTo(s, k * s);
    c.stroke();
  }

  // A thin crack on about every other tile: a jagged line with a light
  // edge beside it
  const crackCount = random() < 0.5 ? 1 : 0;
  const crackWidth = Math.max(1, s * 0.018);
  for (let i = 0; i < crackCount; i++) {
    const points = [[s * (0.2 + random() * 0.6), s * (0.2 + random() * 0.6)]];
    let angle = random() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      angle += (random() - 0.5) * 1.4;
      const length = s * (0.08 + random() * 0.1);
      const [px, py] = points[points.length - 1];
      points.push([px + Math.cos(angle) * length, py + Math.sin(angle) * length]);
    }
    for (const [shift, color] of [[crackWidth, withAlpha(colors.shine, 0.9)], [0, colors.outline]]) {
      c.strokeStyle = color;
      c.lineWidth = crackWidth;
      c.beginPath();
      points.forEach(([px, py], k) => (k === 0 ? c.moveTo(px + shift, py + shift) : c.lineTo(px + shift, py + shift)));
      c.stroke();
    }
  }

  // Frost specks
  for (let i = 0; i < 12; i++) {
    const size = Math.max(0.5, s * (0.012 + random() * 0.015));
    c.fillStyle = withAlpha(colors.shine, 0.7);
    c.fillRect(random() * s, random() * s, size, size);
  }

  // Shore on open sides: the bank's shadow on the top and left (the
  // light comes from the top-left, so the ice looks a little lower than
  // the ground), then a thin line of frost along the edge
  for (let i = 0; i < 4; i++) {
    if (!isOpen(sides, i)) continue;
    if (i === 0 || i === 3) edgeBand(c, s, i, s * 0.16, colors.outline, 0.6);
    edgeBand(c, s, i, s * 0.06, colors.shine, 0.9);
  }
}
