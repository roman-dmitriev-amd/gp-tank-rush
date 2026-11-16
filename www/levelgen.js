// =====================================================================
//  Level generator - makes a level from a seed, a theme and a
//  difficulty (1-15). The same inputs always give the same level.
//
//  generateLevel(seed, themeId, difficulty) returns a level in the same
//  format as levels.js (name, theme, world, map, enemies), so the game
//  loads it like a hand-made one.
//
//  How it works:
//    1. Fill the left half of the map (columns 0-6) with clusters:
//       the theme's extras (themes.js, generatorTiles: a river with
//       crossings, ponds, forest/sand/ice patches), then wall segments
//       and blocks (brick/concrete/metal, the mix per difficulty is in
//       config.js, GENERATOR.walls). Solid tiles (brick, concrete,
//       metal, water) stay under GENERATOR.maxSolidShare of the map.
//    2. Mirror it to the right half, so the level is symmetric.
//    3. Check that every enemy spawn point can reach the base (flood
//       fill: water, concrete and metal block, brick is passable). If
//       not, try again with seed + 1, up to GENERATOR.maxAttempts
//       times, then use a simple open layout.
//    4. Build the enemy list for the difficulty.
//
//  Never use Math.random in here: all randomness comes from the seeded
//  random number generator, so a seed always gives the same level.
//  (It uses GRID_COLS and GRID_ROWS from config.js, and BASE_TILE,
//  PLAYER_START, SPAWN_POINTS and baseWallTiles() from layout.js and map.js, which
//  are ready by the time a level is generated.)
// =====================================================================

// Small seeded random number generator (mulberry32). Returns a
// function that gives a new number from 0 (included) to 1 (excluded)
// each time it's called.
function makeRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whole number from min to max (both included)
function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

// Pick a key from { key: weight, ... }, bigger weight = more likely
function pickWeighted(random, weights) {
  const keys = Object.keys(weights).filter((key) => weights[key] > 0);
  let total = 0;
  for (const key of keys) total += weights[key];
  let roll = random() * total;
  for (const key of keys) {
    roll -= weights[key];
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}

// Is this tile in a clear zone (around the base, the player start or
// an enemy spawn point)? Nothing but empty ground may go there.
function inClearZone(col, row) {
  const base = BASE_TILE;
  const start = PLAYER_START;
  const near = (point, size) =>
    Math.abs(col - point.x) <= size && Math.abs(row - point.y) <= size;
  if (near(base, GENERATOR.baseClear)) return true;
  if (near(start, GENERATOR.playerStartClear)) return true;
  return SPAWN_POINTS.some((point) => near(point, GENERATOR.spawnClear));
}

// The letters that block tanks or are solid walls
const SOLID_LETTERS = "BCMW";

// ---------------------------------------------------------------------
// Building the left half
// ---------------------------------------------------------------------

// The left half, including the middle column (it mirrors onto itself)
function halfWidth() {
  return Math.ceil(GRID_COLS / 2);
}

// The shape of a cluster: a list of [col, row] offsets
function rectShape(width, height) {
  const tiles = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) tiles.push([dx, dy]);
  }
  return tiles;
}

// A rectangle with some corners cut off, so patches look rounder.
// Never cuts so much that fewer than 3 tiles are left.
function blobShape(random, width, height) {
  let tiles = rectShape(width, height);
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  for (const [cx, cy] of corners) {
    if (tiles.length > 3 && random() < 0.5) {
      tiles = tiles.filter(([x, y]) => x !== cx || y !== cy);
    }
  }
  return tiles;
}

// Number of solid tiles on the whole map, counted from the left half
// (every column but the middle one is there twice after mirroring)
function solidCount(grid) {
  const middle = halfWidth() - 1;
  let count = 0;
  for (const line of grid) {
    for (let col = 0; col < halfWidth(); col++) {
      if (SOLID_LETTERS.includes(line[col])) count += col === middle ? 1 : 2;
    }
  }
  return count;
}

// Most solid tiles a map may have, leaving room for the base wall
function maxSolidTiles() {
  return Math.floor(GENERATOR.maxSolidShare * GRID_COLS * GRID_ROWS) - baseWallTiles().length;
}

// Try to put a cluster (shape of one letter) somewhere on the left
// half. Every tile must be empty ground and outside the clear zones.
// Solid clusters (walls, water) also keep one tile of space from other
// solid tiles, so they don't merge into one big wall, and must not push
// the map over maxSolidTiles(). Gives up after a few tries (the level
// just gets one cluster less).
function placeCluster(random, grid, shape, letter) {
  const solid = SOLID_LETTERS.includes(letter);
  const width = Math.max(...shape.map(([x]) => x)) + 1;
  const height = Math.max(...shape.map(([, y]) => y)) + 1;
  if (width > halfWidth() || height > GRID_ROWS) return false;

  for (let attempt = 0; attempt < 30; attempt++) {
    const left = randomInt(random, 0, halfWidth() - width);
    const top = randomInt(random, 0, GRID_ROWS - height);
    const fits = shape.every(([dx, dy]) => {
      const col = left + dx;
      const row = top + dy;
      if (grid[row][col] !== ".") return false;
      // Check the mirrored tile too: the clear zones must stay clear
      // on both halves
      if (inClearZone(col, row) || inClearZone(GRID_COLS - 1 - col, row)) return false;
      return !solid || !touchesSolid(grid, col, row);
    });
    if (fits) {
      for (const [dx, dy] of shape) grid[top + dy][left + dx] = letter;
      if (solid && solidCount(grid) > maxSolidTiles()) {
        for (const [dx, dy] of shape) grid[top + dy][left + dx] = "."; // too full: undo
        return false;
      }
      return true;
    }
  }
  return false;
}

// Is any of the 8 tiles around this one a solid tile (left half only)?
function touchesSolid(grid, col, row) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const r = row + dy;
      const c = col + dx;
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= halfWidth()) continue;
      if (SOLID_LETTERS.includes(grid[r][c])) return true;
    }
  }
  return false;
}

// A river: riverWidth rows of water across the left half (so across the
// whole map after mirroring), with one gap of crossingWidth tiles. The
// gap never touches the middle column, so mirroring makes 2 crossings.
// Placed before anything else, so the rows are still empty. The gap
// and the tiles just above and below it are marked KEEP_OPEN, so no
// wall or patch is put there (tryLayout turns them back into ".").
const KEEP_OPEN = "o";

function placeRiver(random, grid, extras) {
  const g = GENERATOR;
  const rows = randomInt(random, extras.riverWidth[0], extras.riverWidth[1]);
  const top = randomInt(random, g.riverRows[0], g.riverRows[1] - rows + 1);
  const gap = randomInt(random, 0, halfWidth() - 1 - g.crossingWidth);
  for (let row = top - 1; row <= top + rows; row++) {
    for (let col = 0; col < halfWidth(); col++) {
      const inGap = col >= gap && col < gap + g.crossingWidth;
      const inRiver = row >= top && row < top + rows;
      if (inRiver && !inGap) grid[row][col] = "W";
      else if (inGap) grid[row][col] = KEEP_OPEN;
    }
  }
}

// The theme's extras (themes.js, generatorTiles): at most one river,
// water ponds (3-6 tiles), and forest, sand and ice patches
function placeExtraTiles(random, grid, theme) {
  const extras = theme.generatorTiles;
  if (!extras) return;
  const kinds = [];
  for (let i = 0; i < extras.patches; i++) kinds.push(pickWeighted(random, extras.weights));

  // The river goes first, while the map is still empty
  if (kinds.includes("river")) placeRiver(random, grid, extras);

  const [minSize, maxSize] = extras.patchSize;
  for (const kind of kinds) {
    if (kind === "river") continue;
    if (kind === "pond") {
      placeCluster(random, grid, blobShape(random, randomInt(random, 2, 3), 2), "W");
    } else {
      const shape = blobShape(random, randomInt(random, minSize, maxSize), randomInt(random, minSize, maxSize));
      placeCluster(random, grid, shape, MATERIALS[kind].letter);
    }
  }
}

// Wall clusters: short segments and small blocks. The material of each
// cluster comes from the difficulty's percentages (config.js).
function placeWalls(random, grid, difficulty) {
  const mix = GENERATOR.walls[difficulty - 1];
  const weights = { brick: mix.brick, concrete: mix.concrete, metal: mix.metal };
  for (let i = 0; i < mix.clusters; i++) {
    const letter = MATERIALS[pickWeighted(random, weights)].letter;
    let shape;
    const kind = random();
    if (kind < 0.35) {
      shape = rectShape(randomInt(random, 2, 4), 1);        // horizontal segment
    } else if (kind < 0.7) {
      shape = rectShape(1, randomInt(random, 2, 4));        // vertical segment
    } else {
      shape = rectShape(2, randomInt(random, 2, 3));        // small block
    }
    placeCluster(random, grid, shape, letter);
  }
}

// Copy the left half onto the right half
function mirrorGrid(grid) {
  for (const line of grid) {
    for (let col = 0; col < halfWidth(); col++) line[GRID_COLS - 1 - col] = line[col];
  }
}

// The base wall (brick around the base), like loadLevel builds it
function addBaseWall(grid) {
  const base = BASE_TILE;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const row = base.y + dy;
      const col = base.x + dx;
      if (row >= 0 && col >= 0 && col < GRID_COLS) grid[row][col] = "B";
    }
  }
  grid[base.y][base.x] = "."; // the game puts the base itself here
}

// ---------------------------------------------------------------------
// Reachability check (flood fill)
// ---------------------------------------------------------------------

// All tiles reachable from "start" through tiles whose letter is not in
// "blocked". Returns a Set of "col,row" strings.
function floodFill(grid, start, blocked) {
  const seen = new Set([start.x + "," + start.y]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue;
      const key = nx + "," + ny;
      if (seen.has(key) || blocked.includes(grid[ny][nx])) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

// Every spawn point can get to the base: water, concrete and metal
// block, bricks count as open (they can be shot)
function isPlayable(grid) {
  const base = BASE_TILE;
  return SPAWN_POINTS.every((point) =>
    floodFill(grid, point, "CMW").has(base.x + "," + base.y));
}

// ---------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------

// An empty grid: GRID_ROWS lines of GRID_COLS "." letters
function emptyGrid() {
  const grid = [];
  for (let row = 0; row < GRID_ROWS; row++) grid.push(new Array(GRID_COLS).fill("."));
  return grid;
}

// One try at a random layout. Returns the grid, or null if the
// reachability check fails.
function tryLayout(random, theme, difficulty) {
  const grid = emptyGrid();
  placeExtraTiles(random, grid, theme);
  placeWalls(random, grid, difficulty);
  for (const line of grid) {
    for (let col = 0; col < GRID_COLS; col++) if (line[col] === KEEP_OPEN) line[col] = ".";
  }
  mirrorGrid(grid);
  addBaseWall(grid);
  return isPlayable(grid) ? grid : null;
}

// When no seed worked: an open map with a few brick pillars
function openLayout() {
  const grid = emptyGrid();
  for (const row of [5, 10, 14]) {
    for (const col of [2, GRID_COLS - 3]) {
      grid[row][col] = "B";
      grid[row + 1][col] = "B";
    }
  }
  addBaseWall(grid);
  return grid;
}

// ---------------------------------------------------------------------
// Enemy list
// ---------------------------------------------------------------------

// 16 to 24 enemies (GENERATOR in config.js): basic and fast from the
// start, the heavy share rises with the difficulty. Each type is
// spread evenly through the list (with a little seeded wobble), so
// heavy tanks don't all come at once.
// (Every 4th enemy carries a power-up: enemyai.js does that when it
// spawns, POWERUPS.flashingEnemyEvery.)
function generateEnemies(random, difficulty) {
  const g = GENERATOR;
  const progress = (difficulty - 1) / 14; // 0 at difficulty 1, 1 at 15
  const count = Math.round(g.minEnemies + (g.maxEnemies - g.minEnemies) * progress);
  const heavyShare = g.heavyShareMin + (g.heavyShareMax - g.heavyShareMin) * progress;
  const heavy = Math.round(count * heavyShare);
  const fast = Math.round(count * g.fastShare);
  const counts = { basic: count - fast - heavy, fast, heavy };

  // Enemy k of a type with n enemies gets the place (k + 0.25..0.75) / n
  // on a 0-1 line; sorting by place mixes the types evenly
  const places = [];
  for (const type of Object.keys(counts)) {
    const n = counts[type];
    for (let k = 0; k < n; k++) {
      places.push({ type, place: (k + 0.25 + random() * 0.5) / n });
    }
  }
  places.sort((a, b) => a.place - b.place);
  return places.map((entry) => entry.type);
}

// ---------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------

// Make a level. seed: any whole number, themeId: "standard", "jungle",
// "desert" or "snow", difficulty: 1-15. "world" (optional) is the
// world number for the banner, "name" (optional) shows in the level
// intro (levels.js).
function generateLevel(seed, themeId, difficulty, world = 1, name = "Generated " + seed) {
  difficulty = Math.max(1, Math.min(15, Math.round(difficulty)));
  const theme = THEMES[themeId] || THEMES.standard;

  let grid = null;
  let random = null;
  let usedSeed = seed;
  for (let attempt = 0; attempt < GENERATOR.maxAttempts && !grid; attempt++) {
    usedSeed = seed + attempt;
    random = makeRandom(usedSeed);
    grid = tryLayout(random, theme, difficulty);
  }
  if (!grid) {
    grid = openLayout();
    random = makeRandom(seed);
    usedSeed = null; // no seed worked
  }

  if (DEBUG) {
    console.log(
      "[Levelgen] seed " + seed + " (" + theme.id + ", difficulty " + difficulty + ")" +
      (usedSeed === null ? ": open layout" : usedSeed !== seed ? ": used seed " + usedSeed : "")
    );
  }

  return {
    name,
    theme: theme.id,
    world,
    map: grid.map((line) => line.join("")),
    enemies: generateEnemies(random, difficulty),
    seed,        // only generated levels have these two
    difficulty,
  };
}
