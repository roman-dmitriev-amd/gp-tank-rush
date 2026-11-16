// =====================================================================
//  Themes - how a level looks. A theme is data: to add a new one, add
//  an entry to THEMES below and use its id in a level's "theme" field
//  (levels.js).
//
//  There are four: "standard", "jungle", "desert" and "snow".
//
//  Each theme has:
//    id          its name, used in levels.js ("standard", "snow", ...)
//    name        shown in the "World 2: Jungle" banner
//    screen      dark color around the playfield and behind the
//                control zone (keep it dark: the HUD text is white)
//    ground      the empty playfield tiles (drawGround):
//                  base      main color
//                  blotches  colors of the soft patches over it, on
//                            each tile and across the whole field
//                  line      faint line along each tile's edge
//                  details   small things scattered on the tiles:
//                            { kind, color, most } where kind is
//                            "tuft" (grass), "stone", "ripple" (sand)
//                            or "drift" (snow), and each tile gets
//                            0 to "most" of them
//    border      line around the whole playfield
//    accent      UI accent color, for small details in the control
//                zone and HUD (keep it bright: it's drawn on "screen")
//    tiles       colors for each material (materials.js draws the same
//                shapes with these colors):
//                  brick    fill, mortar, outline, crack
//                  concrete fill, seam, outline, crack
//                  metal    fill, shine, shadow, rivet, outline, crack
//                  water    fill, wave (ripples), bank (stones on the
//                           shore)
//                  sand     fill, dots (ripple lines and grains)
//                  ice      fill, shine, outline
//                  forest   dark (shaded side of the tree crowns), mid
//                           (their main color), light (sunlit side),
//                           opacity (a bit see-through)
//    baseWall    brick colors for the wall around the base (same keys
//                as tiles.brick), so the base stands out
//    ambient     (optional) a small animated effect over the map:
//                  "snow"   falling snow (numbers in config.js, AMBIENT)
//    generatorTiles  extras the level generator (levelgen.js) places
//                in this theme:
//                  patches    how many extras go on the left half
//                             (then mirrored)
//                  weights    what each extra is, bigger = more often:
//                             river (water across the map with
//                             crossings, at most one per level), pond
//                             (3-6 water tiles), forest, sand, ice
//                  patchSize  [min, max] width and height of forest,
//                             sand and ice patches
//                  riverWidth [min, max] rows of water in a river
// =====================================================================

const THEMES = {
  // The classic look: green fields with grass tufts, earthy brick
  standard: {
    id: "standard",
    name: "Standard",
    screen: "#0b120c",
    ground: {
      base: "#3b4027",
      blotches: ["#4d4630", "#33502a", "#2c321e"],  // dirt, grass, shade
      line: "#31361f",
      details: [
        { kind: "tuft", color: "#5f8f3e", most: 3 },
        { kind: "stone", color: "#7d7663", most: 2 },
      ],
    },
    border: "#4d6b48",
    accent: "#8fd16a",
    tiles: {
      brick:    { fill: "#9a5a32", mortar: "#d6b48a", outline: "#4f2a12", crack: "#24110a" },
      concrete: { fill: "#b7b8a8", seam: "#828470", outline: "#6f715f", crack: "#44463a" },
      metal:    { fill: "#8a9399", shine: "#d3dade", shadow: "#4e575d", rivet: "#e8edf0", outline: "#2b3135", crack: "#1d2321" },
      water:    { fill: "#2a6690", wave: "#9fd3ee", bank: "#7a7464" },
      sand:     { fill: "#b8a374", dots: "#8f7c50" },
      ice:      { fill: "#cfe6f2", shine: "#ffffff", outline: "#a9c9da" },
      forest:   { dark: "#163f1c", mid: "#447532", light: "#7cb84e", opacity: 0.92 },
    },
    baseWall:   { fill: "#7a3b22", mortar: "#c99a72", outline: "#3c1a0b", crack: "#1d0b04" },
    ambient: null,
    generatorTiles: {   // small rivers, few ponds
      patches: 3, weights: { river: 2, pond: 1, forest: 2 },
      patchSize: [2, 3], riverWidth: [1, 1],
    },
  },

  // Very dark green ground, mossy brick and stone, dense leaves, murky water
  jungle: {
    id: "jungle",
    name: "Jungle",
    screen: "#060c07",
    ground: {
      base: "#1f2d19",
      blotches: ["#2a3d1f", "#3a3622", "#16220f"],  // moss, mud, shade
      line: "#19251a",
      details: [
        { kind: "tuft", color: "#3f7a32", most: 4 },
        { kind: "stone", color: "#55614a", most: 1 },  // mossy
      ],
    },
    border: "#355a2e",
    accent: "#6fe07a",
    tiles: {
      brick:    { fill: "#6b6236", mortar: "#8fae5a", outline: "#2c2810", crack: "#141206" },  // moss in the joints
      concrete: { fill: "#8c9580", seam: "#5d6d50", outline: "#4f5a45", crack: "#2c3326" },
      metal:    { fill: "#5f6e62", shine: "#94a897", shadow: "#3d4a40", rivet: "#c6d6c8", outline: "#232c25", crack: "#111712" },
      water:    { fill: "#1b4a44", wave: "#6aa892", bank: "#56614b" },  // murky, mossy stones
      sand:     { fill: "#8f8255", dots: "#6a5f3a" },
      ice:      { fill: "#cfe6f2", shine: "#ffffff", outline: "#a9c9da" },
      forest:   { dark: "#0b3412", mid: "#2f6726", light: "#5aa63e", opacity: 0.95 },
    },
    baseWall:   { fill: "#4f4822", mortar: "#7a9a46", outline: "#211e09", crack: "#0f0d03" },
    ambient: null,
    generatorTiles: {   // large forest patches, rivers
      patches: 4, weights: { forest: 5, river: 2 },
      patchSize: [3, 4], riverWidth: [1, 2],
    },
  },

  // Warm sand ground with dune ripples, bricks as sandstone
  desert: {
    id: "desert",
    name: "Desert",
    screen: "#16100a",
    ground: {
      base: "#c9a46a",
      blotches: ["#d6b37a", "#b8945c", "#c09a62"],
      line: "#bd9860",
      details: [
        { kind: "ripple", color: "#a8844f", most: 2 },
        { kind: "stone", color: "#9a7b52", most: 1 },
      ],
    },
    border: "#8a6a3c",
    accent: "#ffb85c",
    tiles: {
      brick:    { fill: "#c27840", mortar: "#f0d2a2", outline: "#6e3e18", crack: "#3a1f08" },
      concrete: { fill: "#cbbfa6", seam: "#968a70", outline: "#7f745d", crack: "#4b4433" },
      metal:    { fill: "#8f8a80", shine: "#cbc5b8", shadow: "#5f5a52", rivet: "#efe9dc", outline: "#3f3b35", crack: "#211e1a" },
      water:    { fill: "#1f7f8a", wave: "#8fd8d8", bank: "#a88a5e" },  // oasis
      sand:     { fill: "#e3c48a", dots: "#b2925a" },
      ice:      { fill: "#cfe6f2", shine: "#ffffff", outline: "#a9c9da" },
      forest:   { dark: "#3a5a24", mid: "#71883f", light: "#b4c060", opacity: 0.92 },  // dry shrubs
    },
    baseWall:   { fill: "#9a5226", mortar: "#e6be8a", outline: "#4a2508", crack: "#241004" },
    ambient: null,
    generatorTiles: {   // sand patches, a pond sometimes
      patches: 4, weights: { sand: 6, pond: 1 },
      patchSize: [2, 4], riverWidth: [1, 1],
    },
  },

  // Pale blue-white ground, bricks as ice blocks, metal as frozen steel,
  // light falling snow
  snow: {
    id: "snow",
    name: "Snow",
    screen: "#0c1220",
    ground: {
      base: "#b3c5d5",
      blotches: ["#c6d5e2", "#a2b6c8", "#d3dfe9"],
      line: "#a5b8ca",
      details: [
        { kind: "drift", color: "#eef4f9", most: 2 },
        { kind: "stone", color: "#7f8c99", most: 1 },
      ],
    },
    border: "#7d97b0",
    accent: "#8fd3ff",
    tiles: {
      brick:    { fill: "#79b3d6", mortar: "#eaf6ff", outline: "#2f5f80", crack: "#123247" },
      concrete: { fill: "#d6dde3", seam: "#98a6b2", outline: "#7a8895", crack: "#46525d" },
      metal:    { fill: "#8aa3b8", shine: "#dceefa", shadow: "#5a7286", rivet: "#ffffff", outline: "#344a5c", crack: "#17222c" },
      water:    { fill: "#2a5f8f", wave: "#a8d4f2", bank: "#8796a4" },
      sand:     { fill: "#c4bba6", dots: "#958b74" },
      ice:      { fill: "#dcf0fa", shine: "#ffffff", outline: "#8fb8cf" },
      forest:   { dark: "#163d30", mid: "#2f6450", light: "#eef5f9", opacity: 0.93 },  // snowy pines
    },
    baseWall:   { fill: "#4f86b0", mortar: "#d6ecfb", outline: "#1d3e57", crack: "#0b1d2a" },
    ambient: "snow",
    generatorTiles: {   // ice patches, ponds, some forest
      patches: 4, weights: { ice: 4, pond: 2, forest: 1 },
      patchSize: [2, 4], riverWidth: [1, 1],
    },
  },
};

// The theme of the level being played (standard if the level has none
// or an unknown one; checkLevels in game.js warns about that)
function currentTheme() {
  return THEMES[currentLevel().theme] || THEMES.standard;
}

// ---------------------------------------------------------------------
// Drawing (uses the game's canvas "ctx" from game.js)
// ---------------------------------------------------------------------

const GROUND_VARIANTS = 6;  // different ground tile looks per theme

// One empty ground tile of the current theme. Each tile gets one of
// GROUND_VARIANTS looks, picked from its position (so it never changes),
// painted once (cachedPicture in game.js) and copied after that.
function drawGround(x, y, s, col, row) {
  const theme = currentTheme();
  const variant = groundVariant(col, row);
  const picture = cachedPicture("ground" + theme.id + variant, s, s,
    (c) => paintGround(c, s, theme.ground, variant));
  ctx.drawImage(picture, x, y, s, s);
}

// Which ground look a tile gets: its position scrambled into a number
function groundVariant(col, row) {
  let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % GROUND_VARIANTS;
}

// Paint one ground tile on context c: the base color, a few soft
// patches (fading out before the tile's sides, so tiles join smoothly),
// fine specks, the theme's details and a faint line along the top and
// left edges (the tile grid). A fixed seed per variant gives the same
// look every time.
function paintGround(c, s, ground, variant) {
  const random = makeRandom(variant * 7717 + 3);
  c.fillStyle = ground.base;
  c.fillRect(0, 0, s, s);

  for (let i = 0; i < 3; i++) {
    const x = s * (0.25 + random() * 0.5);
    const y = s * (0.25 + random() * 0.5);
    const r = s * (0.12 + random() * 0.13);
    const color = ground.blotches[Math.floor(random() * ground.blotches.length)];
    const patch = c.createRadialGradient(x, y, 0, x, y, r);
    patch.addColorStop(0, withAlpha(color, 0.7));
    patch.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = patch;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Specks, a little darker or lighter than the ground
  for (let i = 0; i < 30; i++) {
    const size = Math.max(0.5, s * (0.012 + random() * 0.018));
    c.fillStyle = random() < 0.5 ? "rgba(0, 0, 0, 0.14)" : "rgba(255, 255, 255, 0.07)";
    c.fillRect(random() * (s - size), random() * (s - size), size, size);
  }

  // Details (grass, stones, ...), kept inside the tile
  for (const detail of ground.details) {
    const count = Math.floor(random() * (detail.most + 1));
    for (let i = 0; i < count; i++) {
      const x = s * (0.18 + random() * 0.64);
      const y = s * (0.25 + random() * 0.57);
      GROUND_DETAILS[detail.kind](c, s, x, y, detail.color, random);
    }
  }

  // Faint grid line on the top and left edges (neighbours do the rest)
  c.fillStyle = ground.line;
  c.fillRect(0, 0, s, 1);
  c.fillRect(0, 0, 1, s);
}

// How each kind of ground detail is painted at (x, y) on context c.
// Light comes from the top-left, like everywhere else.
const GROUND_DETAILS = {
  // A grass tuft: 3 to 5 short blades fanning out from one spot
  tuft(c, s, x, y, color, random) {
    const blades = 3 + Math.floor(random() * 3);
    c.lineWidth = Math.max(1, s * 0.028);
    c.lineCap = "round";
    for (let i = 0; i < blades; i++) {
      const lean = (i / (blades - 1) - 0.5) * s * 0.16; // left to right
      const height = s * (0.07 + random() * 0.07);
      c.strokeStyle = mixColors(color, random() < 0.5 ? "#000000" : "#ffffff", random() * 0.25);
      c.beginPath();
      c.moveTo(x + lean * 0.3, y);
      c.quadraticCurveTo(x + lean * 0.5, y - height * 0.6, x + lean, y - height);
      c.stroke();
    }
  },

  // A small stone: its shadow, the stone, a light spot on its top-left
  stone(c, s, x, y, color, random) {
    const rx = s * (0.03 + random() * 0.035);
    const ry = rx * (0.6 + random() * 0.3);
    const blob = (bx, by, brx, bry, fill) => {
      c.fillStyle = fill;
      c.beginPath();
      c.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      c.fill();
    };
    blob(x + rx * 0.35, y + ry * 0.45, rx, ry, "rgba(0, 0, 0, 0.3)");
    blob(x, y, rx, ry, color);
    blob(x - rx * 0.3, y - ry * 0.35, rx * 0.45, ry * 0.4, mixColors(color, "#ffffff", 0.35));
  },

  // A ripple in the sand: a darker curve with a sunlit edge just above
  ripple(c, s, x, y, color, random) {
    const half = s * (0.1 + random() * 0.1);
    const bend = s * (0.03 + random() * 0.03);
    c.lineWidth = Math.max(1, s * 0.025);
    c.lineCap = "round";
    const lines = [[-c.lineWidth, mixColors(color, "#ffffff", 0.55)], [0, color]];
    for (const [shift, stroke] of lines) {
      c.strokeStyle = stroke;
      c.beginPath();
      c.moveTo(x - half, y + shift);
      c.quadraticCurveTo(x, y - bend + shift, x + half, y + shift);
      c.stroke();
    }
  },

  // A snow drift: a soft flat heap, brightest in the middle
  drift(c, s, x, y, color, random) {
    const r = s * (0.08 + random() * 0.07);
    c.save();
    c.translate(x, y);
    c.scale(1, 0.65); // flatter than round
    const heap = c.createRadialGradient(0, 0, 0, 0, 0, r);
    heap.addColorStop(0, withAlpha(color, 0.95));
    heap.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = heap;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  },
};

// Big soft patches across the whole ground, so it doesn't look tiled:
// a small picture (8 pixels per tile) of blurry blotches in the theme's
// colors, painted once per theme and stretched over the playfield (in
// its shape on screen, turned or not).
function drawGroundShade() {
  if (VISUALS.groundShade <= 0) return;
  const theme = currentTheme();
  const perTile = 8;
  const width = field.cols * perTile;
  const height = field.rows * perTile;
  const picture = cachedPicture("groundShade" + theme.id + width + "x" + height, width, height, (c) => {
    const seed = [...theme.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    const random = makeRandom(seed);
    for (let i = 0; i < 40; i++) {
      const x = random() * width;
      const y = random() * height;
      const r = perTile * (0.6 + random() * 1.4);
      const color = theme.ground.blotches[Math.floor(random() * theme.ground.blotches.length)];
      const patch = c.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, withAlpha(color, VISUALS.groundShade));
      patch.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = patch;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 1);
  const rect = fieldRect(); // game.js
  ctx.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
}

// ---------------------------------------------------------------------
// Margins: the screen space around the playfield (above the control
// zone in portrait, the whole screen in landscape, where the HUD and the
// controls sit on it), e.g. the sides on a tablet or computer, and the
// extra width or height of very wide or tall windows. It is dark metal
// like the control panel (plates
// with brushed lines, seams and rivets, a little of the theme's screen
// color mixed in), with the playfield's soft shadow on it and a thin
// metal frame around the playfield. All of it is one picture, painted
// once per theme and screen size (cachedPicture in game.js, at one pixel
// per CSS pixel since it's background) and copied every frame.
// ---------------------------------------------------------------------
function drawMargins() {
  const theme = currentTheme();
  const width = view.width;
  // Portrait: down to where the control panel starts
  const height = controlZone.zone ? Math.ceil(controlZone.zone.y) : view.height;
  const key = "margins" + theme.id + width + "x" + height + "@" + field.x + "," + field.y + field.turned;
  const picture = cachedPicture(key, width, height, (c) => paintMargins(c, width, height, theme), 1);
  ctx.drawImage(picture, 0, 0, width, height);
}

function paintMargins(c, width, height, theme) {
  const s = field.tileSize;
  const rect = fieldRect(); // game.js: the playfield as it is on screen
  paintMetalBackground(c, width, height, theme.screen); // ui.js
  paintFieldShadow(c, rect, s);
  paintFieldFrame(c, rect, s);
}

// The playfield's soft shadow on the margins: wide on the bottom and
// right (light from the top-left), narrow on the top and left
function paintFieldShadow(c, f, s) {
  const alpha = VISUALS.marginShadow;
  const band = (x0, y0, x1, y1, rx, ry, rw, rh, strength) => {
    const fade = c.createLinearGradient(x0, y0, x1, y1);
    fade.addColorStop(0, "rgba(0, 0, 0, " + strength + ")");
    fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = fade;
    c.fillRect(rx, ry, rw, rh);
  };
  const wide = s * 0.6;
  const narrow = s * 0.25;
  const right = f.x + f.width;
  const bottom = f.y + f.height;
  band(right, 0, right + wide, 0, right, f.y + narrow, wide, f.height - narrow, alpha);
  band(0, bottom, 0, bottom + wide, f.x + narrow, bottom, f.width - narrow, wide, alpha);
  band(f.x, 0, f.x - narrow, 0, f.x - narrow, f.y, narrow, f.height, alpha * 0.5);
  band(0, f.y, 0, f.y - narrow, f.x, f.y - narrow, f.width, narrow, alpha * 0.5);
  // The bottom-right corner, where the two wide bands meet
  const corner = c.createRadialGradient(right, bottom, 0, right, bottom, wide);
  corner.addColorStop(0, "rgba(0, 0, 0, " + alpha + ")");
  corner.addColorStop(1, "rgba(0, 0, 0, 0)");
  c.fillStyle = corner;
  c.fillRect(right, bottom, wide, wide);
}

// A thin metal frame just outside the playfield: a dark line, then
// metal lit from the top-left
function paintFieldFrame(c, f, s) {
  const [light, middle, , deepest] = CONTROL_LOOK.metal;
  const frame = Math.max(2, s * 0.08);
  const offset = frame / 2 + 1;
  c.lineWidth = frame + 2;
  c.strokeStyle = deepest;
  c.strokeRect(f.x - offset, f.y - offset, f.width + offset * 2, f.height + offset * 2);
  const metal = c.createLinearGradient(f.x, f.y, f.x + f.width, f.y + f.height);
  metal.addColorStop(0, mixColors(middle, light, 0.4));
  metal.addColorStop(1, mixColors(middle, deepest, 0.5));
  c.lineWidth = frame;
  c.strokeStyle = metal;
  c.strokeRect(f.x - offset, f.y - offset, f.width + offset * 2, f.height + offset * 2);
}

// The page behind the canvas (seen for a moment while loading or
// resizing) gets the margins' metal color (the panel's middle color with
// a little of the theme's screen color), so it never flashes black. Only
// changed when the theme does.
let pageBackgroundTheme = null;

function updatePageBackground() {
  const theme = currentTheme();
  if (theme.id === pageBackgroundTheme) return;
  pageBackgroundTheme = theme.id;
  const color = mixColors(CONTROL_LOOK.panel[1], theme.screen, CONTROL_LOOK.panelTint);
  document.documentElement.style.background = color;
  document.body.style.background = color;
}

// ---------------------------------------------------------------------
// Ambient effect: falling snow (snow theme). The flakes are worked out
// from "gameTime", so they need no update step and stop on pause.
// ---------------------------------------------------------------------

// Fixed random start values for each flake, made once
const SNOWFLAKES = [];
for (let i = 0; i < Math.min(AMBIENT.snowFlakes, 40); i++) {
  SNOWFLAKES.push({
    x: Math.random(),               // across the playfield (0..1)
    y: Math.random(),               // down the playfield (0..1)
    speed: 0.6 + Math.random() * 0.8, // times AMBIENT.snowSpeed
    size: 0.04 + Math.random() * 0.04, // radius, in tiles
    phase: Math.random() * Math.PI * 2, // for the side-to-side drift
  });
}

// Draw the current theme's ambient effect over the playfield (game.js
// calls this after the tanks and bullets, before the forest overlay).
// Snow falls down the screen, whether the playfield is turned or not.
function drawAmbient() {
  if (!AMBIENT.enabled || currentTheme().ambient !== "snow") return;

  const s = field.tileSize;
  const rect = fieldRect(); // game.js
  const width = rect.width;
  const height = rect.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, width, height);
  ctx.clip(); // keep the flakes on the playfield
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  for (const flake of SNOWFLAKES) {
    // Fall down (wrapping around at the bottom) and drift sideways
    const fallen = flake.y + (gameTime * AMBIENT.snowSpeed * flake.speed) / field.rows;
    const y = rect.y + (fallen % 1) * height;
    const drift = Math.sin(gameTime * 1.3 + flake.phase) * AMBIENT.snowDrift * s;
    const x = rect.x + flake.x * width + drift;
    ctx.moveTo(x + flake.size * s, y);
    ctx.arc(x, y, flake.size * s, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
