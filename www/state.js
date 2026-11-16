// =====================================================================
//  State - the tanks, the counters and the game states
//
//  The player and enemy lists, lives / score / gold, the GAME_STATE list,
//  and starting, finishing, losing and restarting levels and runs.
// =====================================================================

// ---------------------------------------------------------------------
// Tanks
// Player and enemies are the same kind of object.
// x and y are measured in tiles (0 = left/top edge of the playfield).
// Every tank is one tile big.
// ---------------------------------------------------------------------
const PLAYER_COLORS = {
  body: "#e0b23a",
  track: "#35302a",
  turret: "#f0cc5c",
  outline: "#2b2106",
};

// Colors used for the white flash when an enemy gets hit
const FLASH_COLORS = {
  body: "#ffffff",
  track: "#e6e6e6",
  turret: "#ffffff",
  outline: "#9a9a9a",
};

function createTank(x, y, facing, speed, colors) {
  return {
    x, y, facing, speed, colors,
    maxBullets: 1,     // bullets this tank may have flying at once
    slideDir: null,    // ice: the direction it's sliding in
    slideTimer: 0,     // ice: seconds of sliding left
  };
}

const player = createTank(0, 0, "up", PLAYER_SPEED, PLAYER_COLORS);
player.alive = true;
player.respawnTimer = 0;     // counts down while waiting to come back
player.invincibleTimer = 0;  // counts down while blinking / safe
player.armorPiercing = false; // upgrade: bullets do ARMOR_PIERCING_DAMAGE
                              // (bullet upgrade tier 3 in the shop)
// Shop upgrades (speed, bullets, armor) live in shop.js -> "upgrades"

let enemies = [];            // enemy tanks on screen right now
let enemiesSpawned = 0;      // how many have appeared so far
let enemiesDestroyed = 0;    // how many the player has destroyed
let spawnTimer = 0;          // counts down to the next spawn
let nextSpawnPoint = 0;      // take turns: left, center, right

let lives = PLAYER_LIVES;
let score = 0;
let gold = 0;              // carries over between levels (economy: config.js)
let baseDestroyed = false;

// What happened during the current level, for the end-of-level summary
let levelStats = newLevelStats();

function newLevelStats() {
  return {
    enemiesDestroyed: 0,
    coinGold: 0,        // gold picked up from coins
    baseWallDamaged: false, // did an enemy bullet damage a base wall?
    livesLost: 0,
    bonuses: [],        // filled in when the level ends: { label, gold }
    totalGold: 0,       // coins + bonuses
    debugTainted: false, // a debug key changed this level (economy log)
  };
}

// After the last enemy is destroyed, play goes on LEVEL_END_DELAY
// seconds (config.js) so the player can still grab the coins (ends
// early once none are left).
let levelEndTimer = null;    // null = still fighting

// ---------------------------------------------------------------------
// Game state
// The game is always in exactly ONE of these states. Each state decides
// what gets updated, what is drawn and what the input does. To add a
// main menu later, add a new state here.
// ---------------------------------------------------------------------
const GAME_STATE = {
  LOADING: "loading",              // start-up: waiting for the save (save.js)
  CONTINUE_PROMPT: "continuePrompt", // "Continue from level X" / "New game" (save.js)
  WORLD_INTRO: "worldIntro",       // "World 2: Jungle" when the theme changes
  LEVEL_INTRO: "levelIntro",       // "LEVEL X" shown before play starts
  PLAYING: "playing",              // the normal game
  LEVEL_SUMMARY: "levelSummary",   // level done: gold summary, "Continue"
  SHOP: "shop",                    // buy upgrades, "Start level X" (shop.js)
  CAMPAIGN_COMPLETE: "campaignComplete", // level 20 done: "Continue to Endless" / "Play again"
  LOST: "lost",                    // out of lives or base destroyed
};

let gameState = GAME_STATE.LEVEL_INTRO;
let stateTimer = 0;    // seconds spent in the current state

function isPlaying() {
  return gameState === GAME_STATE.PLAYING;
}

function setState(newState) {
  gameState = newState;
  stateTimer = 0;
  releaseAllInput(); // don't carry held buttons into the new screen
  resetOverlayScroll();
  if (newState === GAME_STATE.LEVEL_INTRO) Sound.play("levelStart"); // the "LEVEL X" fanfare
}

// All enemies of this level destroyed (and the coins collected or
// gone): add the level bonuses and show the summary.
function finishLevel() {
  if (!isPlaying()) return;
  tutorialLevelCompleted();
  Sound.play("levelComplete");
  endAllEffects();
  powerUp = null;
  awardLevelBonuses();
  updateRecords(); // best score, highest level (save.js)
  writeSave();
  setState(GAME_STATE.LEVEL_SUMMARY);
}

// Work out this level's bonuses, add them to the gold and log the
// numbers to the console for balancing.
function awardLevelBonuses() {
  const stats = levelStats;
  stats.bonuses = [
    { label: "Level complete", gold: ECONOMY.levelCompleteBonus },
    { label: "Base walls undamaged", gold: stats.baseWallDamaged ? 0 : ECONOMY.baseWallsBonus },
    { label: "No lives lost", gold: stats.livesLost > 0 ? 0 : ECONOMY.noLivesLostBonus },
  ];
  const bonusGold = stats.bonuses.reduce((sum, b) => sum + b.gold, 0);
  gold += bonusGold;
  stats.totalGold = stats.coinGold + bonusGold;

  if (DEBUG) {
    console.log(
      "[Economy] Level " + (levelIndex + 1) +
      ": coins " + stats.coinGold +
      ", bonuses " + bonusGold +
      ", total " + stats.totalGold +
      " (gold now " + gold + ")" +
      (stats.debugTainted ? " [DEBUG-TAINTED]" : "")
    );
  }
}

function loseGame() {
  if (!isPlaying()) return; // the game already ended
  Sound.play("gameOver", 0.4); // a moment after the explosion
  updateRecords();       // save.js
  // The run is over: nothing is left to continue from after closing
  // the game. Only a rewarded ad on the game over screen brings it back
  // (continueFromCheckpoint in gameover.js).
  progress.run = null;
  writeSave();
  showGameOver();
}

// Lives, score, gold and upgrades as they were when the level began,
// so "Restart level" can put them back
let levelStartSave = null;

// Theme of the level started last, to notice when a new world begins
let lastThemeId = null;

// Was the "CAMPAIGN COMPLETE" screen already shown in this run?
let campaignShown = false;

// Rewarded continues used in this run (game over screen, saved with
// the run), at most REWARDED_CONTINUES_PER_RUN if that is a number
let continuesUsed = 0;

// Start (or restart) a level. Score, lives and gold are NOT changed
// here, so they carry over from the previous level.
function startLevel(index) {
  levelStartSave = { lives, score, gold, upgrades: { ...upgrades } };
  if (index !== levelIndex) debugLevel = null; // the "H" level is left behind
  levelIndex = index;
  takeCheckpoint();            // for the retries on the game over screen (save.js)
  resetTutorialForLevel();
  loadLevel(currentLevel());   // fresh map, so broken bricks come back
  baseDestroyed = false;
  levelStats = newLevelStats();
  levelEndTimer = null;
  coins = [];
  powerUp = null;
  activeEffects = {};          // no effects carry over (fresh map anyway)
  effectFullTime = {};

  enemies = [];
  enemiesSpawned = 0;
  enemiesDestroyed = 0;
  spawnTimer = FEEDBACK.spawnWarning; // the first enemy gets its warning too
  nextSpawnPoint = 0;
  logEnemySpeeds();

  bullets = [];
  explosions.length = 0;
  scorchMarks.length = 0;
  stopShake(); // feedback.js

  spawnPlayer();

  // "Base steel" from the shop: start with metal base walls (it uses
  // the fortify effect, just for longer). The purchase is used up.
  if (upgrades.baseSteelPending) {
    upgrades.baseSteelPending = false;
    startTimedEffect("fortify", BASE_STEEL_START_SECONDS);
  }

  // A new theme (but not on the very first level): show the world
  // banner first, then the level intro
  const themeId = currentTheme().id;
  const newWorld = index > 0 && themeId !== lastThemeId;
  lastThemeId = themeId;
  setState(newWorld ? GAME_STATE.WORLD_INTRO : GAME_STATE.LEVEL_INTRO);
}

// "Restart level" in the pause menu: undo everything gained or lost in
// this level (gold, lives, used-up shop items), then start it again
function restartLevel() {
  const save = levelStartSave;
  lives = save.lives;
  score = save.score;
  gold = save.gold;
  upgrades = { ...save.upgrades };
  player.armorPiercing = upgrades.bulletTier >= 3;
  applyUpgradesToPlayer();
  startLevel(levelIndex);
}

// A brand new game: level 1, full lives, score and gold 0, nothing
// bought from the shop
function newGame() {
  lives = PLAYER_LIVES;
  score = 0;
  gold = 0;
  resetUpgrades();
  player.armorPiercing = false;
  applyUpgradesToPlayer();
  debugLevel = null;
  campaignShown = false;
  continuesUsed = 0;
  startLevel(0);
}

// "Continue from level X" (save.js): the saved run's gold, lives,
// score, upgrades, continues and free retries used, then the shop
// before that level.
// Nothing of the level itself was saved, so it starts fresh from the
// shop.
function continueSavedRun() {
  const run = progress.run;
  lives = run.lives;
  score = run.score;
  gold = run.gold;
  upgrades = { ...freshUpgrades(), ...run.upgrades };
  continuesUsed = run.continuesUsed;
  player.armorPiercing = upgrades.bulletTier >= 3;
  applyUpgradesToPlayer();
  debugLevel = null;
  levelIndex = run.level - 2;               // the shop leads to levelIndex + 1
  campaignShown = run.level > LEVELS.length; // level 20 was already done
  lastThemeId = levelAt(levelIndex).theme;  // so the world banner shows when it should
  openShop();
}

// How fast an enemy of this type drives on the current level: the
// type's base speed times the level multiplier (capped), and never
// more than ENEMY_SCALING.maxSpeedVsPlayer times the player's base speed
function enemySpeed(type) {
  const s = ENEMY_SCALING;
  const multiplier = Math.min(1 + s.speedPerLevel * levelIndex, s.speedMax);
  return Math.min(ENEMY_SPEED * type.speed * multiplier, PLAYER_SPEED * s.maxSpeedVsPlayer);
}

// Seconds until an enemy of this type shoots again: the type's base
// interval, a bit shorter on later levels (but not below the minimum)
function enemyFireDelay(type) {
  const s = ENEMY_SCALING;
  const multiplier = Math.max(1 - s.fireIntervalPerLevel * levelIndex, s.fireIntervalMin);
  return randomBetween(type.fireMin, type.fireMax) * multiplier;
}

// DEBUG: log the final speed of every enemy type for this level
function logEnemySpeeds() {
  if (!DEBUG) return;
  const speeds = Object.keys(ENEMY_TYPES)
    .map((name) => name + " " + enemySpeed(ENEMY_TYPES[name]).toFixed(2))
    .join(", ");
  console.log("Level " + (levelIndex + 1) + " enemy speeds (tiles/s): " + speeds +
              " (player base " + PLAYER_SPEED + ")");
}

// All tanks that are on the map right now
function allTanks() {
  return player.alive ? [player, ...enemies] : enemies;
}
