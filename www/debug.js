// =====================================================================
//  Debug - the debug keys and tags, and the layout self-test
//
//  All of it only does something when DEBUG is true (config.js).
// =====================================================================

// --- DEBUG keys (only work when DEBUG is true in config.js) ---
//   P  bullet upgrade +1 tier (1 faster, 2 two bullets, 3 armor-piercing
//      and three bullets),
//      after tier 3 back to 0. Shown by the HUD's upgrade badges.
//   O  tank speed upgrade +1 tier, after tier 3 back to 0. Badges too.
//   I  freeze / unfreeze all enemies (no time limit). "FREEZE".
//   L  finish the level now (with the usual bonuses and summary).
//   N  skip to the next level right away (no summary or shop).
//   B  go back one level.
//   H  play a new generated level (random seed, same theme and
//      difficulty) instead of this one; the seed is logged and shown
//      with the debug tags.
//   J  restart this level with the next theme (H then uses it).
// P and O change the same upgrades the shop sells.
let debugFreezeEnemies = false;

// Returns true if the key was a debug key
function handleDebugKey(event) {
  if (!["KeyP", "KeyO", "KeyI", "KeyL", "KeyN", "KeyB", "KeyH", "KeyJ"].includes(event.code)) return false;
  if (event.repeat) return true;

  // Upgrades, freeze and finishing early make this level's economy
  // numbers fake, so its log line gets marked
  if (["KeyP", "KeyO", "KeyI", "KeyL"].includes(event.code)) {
    levelStats.debugTainted = true;
  }

  if (event.code === "KeyP") {
    upgrades.bulletTier = (upgrades.bulletTier + 1) % 4;
    player.armorPiercing = upgrades.bulletTier >= 3;
    applyUpgradesToPlayer();
  }
  if (event.code === "KeyO") {
    upgrades.speedTier = (upgrades.speedTier + 1) % 4;
    applyUpgradesToPlayer();
  }
  if (event.code === "KeyI") {
    debugFreezeEnemies = !debugFreezeEnemies;
  }
  if (event.code === "KeyL") {
    finishLevel(); // does nothing outside of play
  }
  if (event.code === "KeyN" && !isLastLevel()) {
    startLevel(levelIndex + 1);
  }
  if (event.code === "KeyB" && levelIndex > 0) {
    startLevel(levelIndex - 1);
  }
  if (event.code === "KeyH") {
    loadDebugGeneratedLevel();
  }
  if (event.code === "KeyJ") {
    cycleDebugTheme();
  }
  return true;
}

// Debug keys H and J only work during a level (or its intro)
function debugLevelKeysAllowed() {
  return isPlaying() ||
         gameState === GAME_STATE.LEVEL_INTRO ||
         gameState === GAME_STATE.WORLD_INTRO;
}

// DEBUG key "H": generate a level with a random seed, the current
// theme and difficulty, and start it in place of the current level
function loadDebugGeneratedLevel() {
  if (!debugLevelKeysAllowed()) return;
  const level = currentLevel();
  const seed = Math.floor(Math.random() * 1000000);
  debugLevel = generateLevel(seed, currentTheme().id, level.difficulty || levelIndex + 1, level.world);
  console.log("[Levelgen] H: seed " + seed + " (" + debugLevel.theme + ")");
  startLevel(levelIndex);
}

// DEBUG key "J": restart the current level with the next theme in
// GENERATOR.themeOrder (same map; a generated level is made again with
// the same seed in the new theme). "H" then uses that theme.
function cycleDebugTheme() {
  if (!debugLevelKeysAllowed()) return;
  const level = currentLevel();
  const order = GENERATOR.themeOrder;
  const nextTheme = order[(order.indexOf(currentTheme().id) + 1) % order.length];
  debugLevel = level.seed !== undefined
    ? generateLevel(level.seed, nextTheme, level.difficulty, level.world, level.name)
    : { ...level, theme: nextTheme };
  console.log("[Debug] J: theme " + nextTheme);
  startLevel(levelIndex);
}

// ---------------------------------------------------------------------
// DEBUG: level select on the title screen (title.js adds these buttons
// only when DEBUG is true): "LEVEL -" and "LEVEL +" side by side, and
// under them "DEBUG: START LEVEL n", which starts a new game at that
// level (no gold, no upgrades). With endless mode it goes 20 levels
// past the last hand-made one.
// ---------------------------------------------------------------------
const debugSelect = { level: 1 };

function debugLevelButtons(x, y, width, height, gap) {
  const last = LEVELS.length + (ENDLESS_ENABLED || GENERATED_MODE ? 20 : 0);
  const change = (by) => () => { debugSelect.level = clamp(debugSelect.level + by, 1, last); };
  const half = (width - gap) / 2;
  const n = debugSelect.level;
  return [
    { label: "LEVEL -", primary: false, action: change(-1), x, y, width: half, height },
    { label: "LEVEL +", primary: false, action: change(1), x: x + half + gap, y, width: half, height },
    { label: "DEBUG: START LEVEL " + n, primary: false, action: () => debugStartLevel(n), x, y: y + height + gap, width, height },
  ];
}

// A fresh run that begins at level number n (from 1)
function debugStartLevel(n) {
  if (!DEBUG) return;
  progress.run = null;
  newGame();
  if (n > 1) startLevel(n - 1);
}

// Small orange tags in the top-left corner of the map showing the
// debug settings, e.g. "FREEZE  SEED 1003 D3". Only when DEBUG is
// true: with DEBUG off nothing of this is drawn. (The upgrade tiers
// are shown by the HUD's upgrade badges, also without DEBUG.)
function drawDebugTags() {
  if (!DEBUG) return;
  const tags = [];
  if (debugFreezeEnemies) tags.push("FREEZE");
  // A generated level's seed and difficulty, e.g. "SEED 1003 D3"
  const level = currentLevel();
  if (level.seed !== undefined) tags.push("SEED " + level.seed + " D" + level.difficulty);
  if (tags.length === 0) return;

  const s = field.tileSize;
  ctx.font = "bold " + Math.round(s * 0.45) + "px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ff9a2e";
  ctx.fillText(tags.join("  "), field.x + s * 0.15, field.y + s * 0.1);
  ctx.textBaseline = "middle";
}

// ---------------------------------------------------------------------
// DEBUG: layout self-test. Works out the layout (computeLayout) for the
// window sizes below, right- and left-handed, without safe areas, logs
// every rectangle (one collapsed group per size) and checks that
// nothing overlaps, everything is on screen and every control is big
// enough: touch targets at least LANDSCAPE.minTouch with spacing between
// them, and in landscape the joystick, cross and fire button at least
// minControl. It also checks the playfield's shape on screen (13 x 21
// tiles in portrait, turned to 21 x 13 in landscape) and the mapping
// from the map to the screen. Sizes that fail are warned about at the
// end.
// ---------------------------------------------------------------------
const LAYOUT_TEST_SIZES = [
  [360, 800], [412, 915], [800, 360], [915, 412], [768, 1024], [1024, 768],
  [1920, 1080], [3440, 1440], [360, 1280], [1280, 360],
  [600, 600], [520, 500], // nearly square: the overlay layout
  [844, 390], [932, 430], [667, 375], // common phones held sideways
];

function layoutSelfTest() {
  if (!DEBUG) return;
  const failed = [];
  for (const [width, height] of LAYOUT_TEST_SIZES) {
    for (const leftHanded of [false, true]) {
      const layout = computeLayout(width, height, { top: 0, right: 0, bottom: 0, left: 0 }, 1, leftHanded);
      const rects = layoutTestRects(layout);
      const problems = [...layoutProblems(layout, rects), ...mappingProblems(layout)];
      const name = width + "x" + height + (leftHanded ? " left-handed" : "");
      if (problems.length) failed.push(name);
      console.groupCollapsed("[Layout] " + name + ": " + layout.mode + ", " +
                             (problems.length ? problems.length + " problem(s)" : "OK"));
      const rounded = {};
      for (const [key, r] of Object.entries(rects)) {
        rounded[key] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
      }
      console.table(rounded);
      const menus = buttonHeight(layout.overlay.unit * SMALLEST_MENU_BUTTON);
      console.log("playfield " + layout.field.cols + "x" + layout.field.rows + " tiles" +
                  (layout.field.turned ? " (turned)" : "") + ", " +
                  "tile " + layout.field.tileSize + " px" +
                  // (the test has no safe areas and one device pixel per CSS pixel)
                  (layout.mode === "landscape" ? " (" + Math.floor((height - LANDSCAPE.spacing * 2) / GRID_COLS) + " at full height)" : "") +
                  ", menu unit " + layout.overlay.unit.toFixed(1) +
                  " px (smallest menu button " + menus.toFixed(1) + " px)" +
                  (layout.shop ? ", shop: " + layout.shop.cols + " columns, unit " + layout.shop.s.toFixed(1) + " px" : "") +
                  (layout.hudLayout.font ? ", HUD font " + layout.hudLayout.font + " px in " + layout.hudLayout.columns + " column(s)" : ""));
      for (const problem of problems) console.warn(problem);
      console.groupEnd();
    }
  }
  if (failed.length) console.warn("[Layout] self-test failed for: " + failed.join(", "));
  else console.log("[Layout] self-test: all " + LAYOUT_TEST_SIZES.length + " sizes pass (both hands)");
}

// The rectangles of a layout: what is drawn, then the touch areas
function layoutTestRects(layout) {
  const f = layout.field;
  const d = layout.dpad;
  const circle = (x, y, r) => ({ x: x - r, y: y - r, width: r * 2, height: r * 2 });
  const move = rectCenter(layout.moveBox);
  const b = layout.pause;
  return {
    playfield: fieldRect(f),
    hudDisplay: layout.hudLayout.display,
    badgeRow: layout.hudLayout.badgeRow,
    cross: { x: d.x - d.width / 2, y: d.y - d.height / 2, width: d.width, height: d.height },
    joystick: circle(move.x, move.y, layout.joystickRadius),
    fireButton: circle(layout.fireButton.x, layout.fireButton.y, layout.fireButton.radius),
    pauseButton: { x: b.x, y: b.y, width: b.size, height: b.size },
    moveTouch: layout.move,
    fireTouch: layout.fire,
    pauseTouch: pauseTapRect(b, f),
  };
}

// What's wrong with a layout (an empty list if nothing)
function layoutProblems(layout, r) {
  const L = LANDSCAPE;
  const problems = [];
  const eps = 0.01;
  const overlaps = (a, b) => a.x < b.x + b.width - eps && b.x < a.x + a.width - eps &&
                             a.y < b.y + b.height - eps && b.y < a.y + a.height - eps;
  const gap = (a, b) => Math.max(b.x - a.x - a.width, a.x - b.x - b.width, b.y - a.y - a.height, a.y - b.y - b.height);
  const pairs = (names, test) => {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) test(names[i], names[j]);
    }
  };

  // Everything on screen
  for (const [name, rect] of Object.entries(r)) {
    if (rect.x < -eps || rect.y < -eps || rect.x + rect.width > layout.width + eps ||
        rect.y + rect.height > layout.height + eps) {
      problems.push(name + " is partly off the screen");
    }
  }

  // Nothing drawn overlaps (the overlay controls are over the playfield
  // on purpose), the controls keep "spacing" from the HUD and each other
  const controls = ["cross", "joystick", "fireButton"];
  pairs(["playfield", "hudDisplay", "badgeRow", ...controls], (a, b) => {
    if (controls.includes(a) && controls.includes(b) && a !== "fireButton" && b !== "fireButton") return;
    if (layout.mode === "overlay" && a === "playfield") return;
    if (overlaps(r[a], r[b])) problems.push(a + " overlaps " + b);
    else if ((controls.includes(a) || controls.includes(b)) && a !== "playfield" &&
             gap(r[a], r[b]) < L.spacing - eps) {
      problems.push(a + " and " + b + " are only " + gap(r[a], r[b]).toFixed(1) + " px apart");
    }
  });

  // Touch areas: no overlaps with each other or the HUD, spaced apart
  const touches = ["moveTouch", "fireTouch", "pauseTouch"];
  pairs(touches, (a, b) => {
    if (overlaps(r[a], r[b])) problems.push(a + " overlaps " + b);
    else if (gap(r[a], r[b]) < L.spacing - eps) problems.push(a + " and " + b + " are only " + gap(r[a], r[b]).toFixed(1) + " px apart");
  });
  for (const touch of touches) {
    for (const hud of ["hudDisplay", "badgeRow"]) {
      if (overlaps(r[touch], r[hud])) problems.push(touch + " overlaps " + hud);
    }
  }

  // Sizes
  const minControl = layout.mode === "portrait" ? L.minTouch : L.minControl;
  for (const name of controls) {
    if (r[name].width < minControl - eps) problems.push(name + " is " + r[name].width.toFixed(1) + " px, less than " + minControl);
  }
  for (const name of touches) {
    if (Math.min(r[name].width, r[name].height) < L.minTouch - eps) {
      problems.push(name + " is smaller than " + L.minTouch + " px");
    }
  }
  const menu = buttonHeight(layout.overlay.unit * SMALLEST_MENU_BUTTON);
  if (menu < L.minTouch - eps) problems.push("menu buttons are " + menu.toFixed(1) + " px tall");
  const shopButton = buttonHeight((layout.shop ? layout.shop.s : layout.field.tileSize) * SHOP_BUTTON_HEIGHT);
  if (shopButton < L.minTouch - eps) problems.push("the shop's START button is " + shopButton.toFixed(1) + " px tall");
  return problems;
}

// What's wrong with how the map is shown on the screen (an empty list if
// nothing): upright in portrait (13 x 21 tiles), turned in landscape
// (21 x 13) with the base on the left and the enemy spawns on the right,
// every map tile on a tile of its own, and directions that match the
// mapping and turn back (input) to what they were.
function mappingProblems(layout) {
  const problems = [];
  const f = layout.field;
  const s = f.tileSize;
  const turned = layout.mode !== "portrait";
  const [cols, rows] = turned ? [GRID_ROWS, GRID_COLS] : [GRID_COLS, GRID_ROWS];
  if (f.turned !== turned) problems.push("the playfield should" + (turned ? "" : " not") + " be turned");
  if (f.cols !== cols || f.rows !== rows) {
    problems.push("the playfield is " + f.cols + "x" + f.rows + " tiles on screen, not " + cols + "x" + rows);
  }

  // Every map tile on its own tile of the playfield on screen
  const seen = new Set();
  let wrong = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const at = tileToScreen(col, row, f);
      const x = Math.round((at.x - f.x) / s);
      const y = Math.round((at.y - f.y) / s);
      if (x < 0 || y < 0 || x >= f.cols || y >= f.rows || seen.has(x + "," + y)) wrong += 1;
      seen.add(x + "," + y);
    }
  }
  if (wrong) problems.push(wrong + " map tiles are off the playfield or on top of another");

  // The base and the spawns
  const middle = rectCenter(fieldRect(f));
  const base = mapToScreen(BASE_TILE.x + 0.5, BASE_TILE.y + 0.5, f);
  const spawn = mapToScreen(GRID_COLS / 2, 0.5, f);
  if (turned && !(base.x < middle.x && spawn.x > middle.x)) problems.push("the base should be on the left, the spawns on the right");
  if (!turned && !(base.y > middle.y && spawn.y < middle.y)) problems.push("the base should be at the bottom, the spawns at the top");

  // Each map direction moves the way it is drawn on screen, and input
  // (directionOnMap) turns it back
  const from = mapToScreen(5, 9, f);
  for (const dir of TURN_ORDER) {
    const step = DIRECTIONS[dir];
    const to = mapToScreen(5 + step.x, 9 + step.y, f);
    const looks = DIRECTIONS[directionOnScreen(dir, turned)];
    if (Math.abs(to.x - from.x - looks.x * s) > 0.01 || Math.abs(to.y - from.y - looks.y * s) > 0.01) {
      problems.push("map " + dir + " moves differently on screen than it is drawn");
    }
    if (directionOnMap(directionOnScreen(dir, turned), turned) !== dir) problems.push("input doesn't turn " + dir + " back");
  }
  if (directionOnScreen("up", turned) !== (turned ? "right" : "up")) {
    problems.push("map up is drawn as " + directionOnScreen("up", turned));
  }
  return problems;
}
