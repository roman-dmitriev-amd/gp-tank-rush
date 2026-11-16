// =====================================================================
//  Map - the tile map and the levels
//
//  The current level (hand-made, generated or endless), loading it into the
//  map, reading and changing tiles, and the DEBUG level check.
// =====================================================================

// ---------------------------------------------------------------------
// Tile map
// The materials (empty, brick, concrete, metal, base...) are defined in
// materials.js; the level layouts in levels.js use their letters.
//
// Each map cell is an object: { material: "brick", health: 2 }
// "health" is how much damage it can still take (null = can't be
// destroyed). Health is set from the material when a level loads.
// ---------------------------------------------------------------------

// Look up a material by the letter used in levels.js, e.g. "B" -> brick
const LETTER_TO_MATERIAL = {};
for (const material of Object.values(MATERIALS)) {
  if (material.letter) LETTER_TO_MATERIAL[material.letter] = material.id;
}

// Outside the playfield acts like an unbreakable wall
const OUTSIDE = {
  id: "outside", health: null, minDamageToHurt: Infinity,
  blocksTank: true, blocksBullet: true,
};

let levelIndex = 0;  // which level we're on (0 = the first one)
let debugLevel = null; // DEBUG key "H": a generated level played instead

// map[row][col] = { material, health }
let map = [];

// The level being played: the debug "H" level if there is one,
// otherwise level number levelIndex
function currentLevel() {
  return debugLevel || levelAt(levelIndex);
}

// Level number "index" (0 = the first): from levels.js, or made by
// levelgen.js in a generated run (GENERATED_MODE in config.js) or in
// endless mode after the last hand-made level (ENDLESS_ENABLED).
// Generated levels are kept, so each one is only made once.
const generatedLevels = [];

function levelAt(index) {
  if (!tunedLevels[index]) tunedLevels[index] = withGunners(plainLevelAt(index), index + 1);
  return tunedLevels[index];
}

// The level as it is written (levels.js) or generated, before the
// difficulty rules change its enemy list
function plainLevelAt(index) {
  const endless = ENDLESS_ENABLED && index >= LEVELS.length;
  if (!GENERATED_MODE && !endless) return LEVELS[index];
  if (!generatedLevels[index]) {
    generatedLevels[index] = GENERATED_MODE ? generatedRunLevel(index) : endlessLevel(index);
  }
  return generatedLevels[index];
}

// Levels with their final enemy lists, kept so each is only made once
const tunedLevels = [];

// Level number "n" (from 1) with some of its "basic" tanks turned into
// "gunner" tanks: as many as DIFFICULTY.gunners says for that level,
// spread evenly through the basic ones, never among the first three
// enemies. The level itself is not changed: a copy is returned.
function withGunners(level, n) {
  const wanted = difficultyAt(DIFFICULTY.gunners, n);
  const basics = [];
  level.enemies.forEach((name, i) => { if (name === "basic" && i >= 3) basics.push(i); });
  const count = Math.min(wanted, basics.length);
  if (count <= 0) return level;
  const enemies = level.enemies.slice();
  for (let k = 0; k < count; k++) {
    enemies[basics[Math.floor((k + 0.5) * basics.length / count)]] = "gunner";
  }
  return { ...level, enemies };
}

// Generated run: level N has seed baseSeed + N, difficulty N (max 15)
// and a new theme every levelsPerTheme levels
function generatedRunLevel(index) {
  const n = index + 1; // level N
  const themeNumber = Math.floor(index / GENERATOR.levelsPerTheme);
  const order = GENERATOR.themeOrder;
  return generateLevel(
    GENERATOR.baseSeed + n,
    order[themeNumber % order.length],
    Math.min(n, 15),
    themeNumber + 1   // world number
  );
}

// Endless mode: level N (21, 22, ...) has seed baseSeed + N, a new
// theme every levelsPerTheme levels (starting again with the first
// one in themeOrder), difficulty min(15, 5 + (N - 20) / 2 rounded
// down) and the name "Endless N". The world number goes on from the
// last hand-made level.
function endlessLevel(index) {
  const n = index + 1;
  const handMade = LEVELS.length;
  const themeNumber = Math.floor((index - handMade) / GENERATOR.levelsPerTheme);
  const order = GENERATOR.themeOrder;
  const difficulty = Math.min(15,
    ENDLESS.startDifficulty + Math.floor((n - handMade) / ENDLESS.levelsPerDifficulty));
  return generateLevel(
    GENERATOR.baseSeed + n,
    order[themeNumber % order.length],
    difficulty,
    LEVELS[handMade - 1].world + themeNumber + 1,
    "Endless " + n
  );
}

// Is this the last level? (A generated run and endless mode never end.)
function isLastLevel() {
  return !GENERATED_MODE && !ENDLESS_ENABLED && levelIndex >= LEVELS.length - 1;
}

// The tiles the game fills in itself, so a map must leave them empty
// ("."): the base and its brick wall, the player start and the enemy
// spawn points. As [col, row] pairs.
function fixedTiles() {
  return [
    [BASE_TILE.x, BASE_TILE.y],
    ...baseWallTiles(),
    [PLAYER_START.x, PLAYER_START.y],
    ...SPAWN_POINTS.map((point) => [point.x, point.y]),
  ];
}

// Check every level in levels.js on load and warn (in the browser
// console, only when DEBUG is on) about: wrong map size, unknown
// letters, themes or enemy types, filled fixed tiles, a base that an
// enemy spawn point can't reach, and too many filled tiles.
function checkLevels() {
  if (!DEBUG) return;
  LEVELS.forEach((level, i) => {
    const name = "Level " + (i + 1) + ' "' + level.name + '"';
    if (!THEMES[level.theme]) {
      console.warn(name + ': unknown theme "' + level.theme + '" (see themes.js), using standard');
    }
    for (const typeName of level.enemies) {
      if (!ENEMY_TYPES[typeName]) {
        console.warn(name + ': unknown enemy type "' + typeName + '" (see enemies.js)');
      }
    }
    if (level.map.length !== GRID_ROWS) {
      console.warn(name + ": map should have " + GRID_ROWS + " rows, it has " + level.map.length);
    }
    level.map.forEach((line, row) => {
      if (line.length !== GRID_COLS) {
        console.warn(name + ", row " + row + ": should have " + GRID_COLS + " letters, it has " + line.length);
      }
      for (const letter of line) {
        if (!LETTER_TO_MATERIAL[letter]) {
          console.warn(name + ", row " + row + ': unknown letter "' + letter + '" (see materials.js)');
        }
      }
    });
    for (const [col, row] of fixedTiles()) {
      const letter = (level.map[row] || "")[col];
      if (letter !== undefined && letter !== ".") {
        console.warn(name + ": column " + col + ", row " + row + ' must be "." ' +
                     "(base, base wall, player start or spawn point), it is \"" + letter + '"');
      }
    }
    // The rest needs a map of the right size
    if (level.map.length !== GRID_ROWS || level.map.some((line) => line.length !== GRID_COLS)) return;

    // Every spawn point must reach the base. Brick counts as open (it
    // can be shot), concrete, metal and water block. floodFill is in
    // levelgen.js.
    for (const point of SPAWN_POINTS) {
      if (!floodFill(level.map, point, "CMW").has(BASE_TILE.x + "," + BASE_TILE.y)) {
        console.warn(name + ": the base can't be reached from the spawn point at column " + point.x);
      }
    }

    // At most LEVEL_MAX_FILLED of the tiles may be brick, concrete,
    // metal or water (forest, sand and ice don't block, so don't count)
    const filled = level.map.join("").replace(/[^BCMW]/g, "").length;
    const share = filled / (GRID_COLS * GRID_ROWS);
    if (share > LEVEL_MAX_FILLED) {
      console.warn(name + ": " + Math.round(share * 100) + "% of the tiles are filled, " +
                   "the limit is " + Math.round(LEVEL_MAX_FILLED * 100) + "%");
    }
  });
}

// A fresh cell of a material, at full health
function newCell(materialId) {
  return { material: materialId, health: MATERIALS[materialId].health };
}

// Build the map for a level from its text map, then add the base with
// its brick wall and clear the tiles tanks need to appear on.
function loadLevel(level) {
  map = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const line = level.map[row] || "";
    map.push([]);
    for (let col = 0; col < GRID_COLS; col++) {
      map[row].push(newCell(LETTER_TO_MATERIAL[line[col]] || "empty"));
    }
  }

  // Brick wall around the base, then the base itself
  for (const [col, row] of baseWallTiles()) setTile(col, row, "brick");
  setTile(BASE_TILE.x, BASE_TILE.y, "base");

  // Keep the player start and enemy spawn tiles free (no walls or
  // water; the base wall above already replaced anything near the base)
  setTile(PLAYER_START.x, PLAYER_START.y, "empty");
  for (const point of SPAWN_POINTS) setTile(point.x, point.y, "empty");
}

// The tiles of the wall around the base: left, right and the 3 tiles
// above it, as [col, row] pairs (only those on the map)
function baseWallTiles() {
  const base = BASE_TILE;
  const tiles = [];
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue; // that's the base itself
      const col = base.x + dx;
      const row = base.y + dy;
      if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) tiles.push([col, row]);
    }
  }
  return tiles;
}

// Put a fresh tile of a material on the map (ignored if outside).
// Tiles around the base are marked "baseWall", so they can be drawn
// with the theme's base wall look.
function setTile(col, row, materialId) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
  const cell = newCell(materialId);
  if (baseWallTiles().some(([c, r]) => c === col && r === row)) cell.baseWall = true;
  map[row][col] = cell;
}

// One number that changes whenever anything about the map that can be
// seen changes: a tile's material, its health (cracks, the broken
// base), the look it borrows for a moment ("drawAs") or the base wall
// mark. render.js compares it each frame to know when the static map
// must be painted again. Only whole-number sums: nothing is created.
function mapSignature() {
  let sum = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = map[row][col];
      let look = MATERIALS[cell.material].number * 64 + (cell.health || 0) * 2 + (cell.baseWall ? 1 : 0);
      if (cell.drawAs) look += MATERIALS[cell.drawAs].number * 4096;
      sum = (Math.imul(sum, 31) + look) | 0;
    }
  }
  return sum;
}

// The material at this tile (OUTSIDE if it's off the playfield)
function materialAt(col, row) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return OUTSIDE;
  return MATERIALS[map[row][col].material];
}
