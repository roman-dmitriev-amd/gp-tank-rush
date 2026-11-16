// =====================================================================
//  Debug mode - for testing only, keep it false for release.
//  To enable it, change false to true below and reload the page.
//  When on: debug keys work (P bullet tier, O speed tier, I freeze
//  enemies, L finish level, N next level, B previous level,
//  H new generated level, J next theme, T test beep), debug tags (and a generated
//  level's seed) show on the map, and debug info is logged to the
//  browser console (F12 -> Console).
// =====================================================================

const DEBUG = false;

// Game title, shown on the start/continue screen. The page title is set
// from these two when the game starts (init in game.js). Change the name
// here; the app's name on Android is set in the Capacitor project.
const GAME_TITLE = "Tank Rush";
const GAME_SUBTITLE = "Base Defense";

// Texts on screen, kept here so they're easy to change. Written as they
// show; {level} and {left} are filled in by the game.
const UI_TEXT = {
  gameOver: {
    retry: "CONTINUE",                                   // continue button (ads.js decides if an ad plays)
    retrySub: "Retry level {level}, keep your upgrades", // its smaller second line, {level} = the level just lost
    startOver: "START OVER",
    startOverSub: "Back to Level 1",
    retriesLeft: "{left} CONTINUES LEFT",  // between the buttons, only with a limit and more than one left
    loadingAd: "LOADING...",               // between the buttons while ads.js hasn't answered
    noReward: "NO CONTINUE THIS TIME",     // ads.js answered false (an ad was skipped)
    adNotAvailable: "NOT AVAILABLE NOW",   // ads.js failed or didn't answer
  },
};

// =====================================================================
//  Enemy difficulty per level - how much faster enemies drive and
//  shoot on later levels. Always applied to the enemy type's base
//  values (enemies.js), never on top of an already scaled value.
//    speed multiplier = 1 + speedPerLevel * (level - 1), at most speedMax
//    fire interval    = base interval * (1 - fireIntervalPerLevel * (level - 1)),
//                       at least fireIntervalMin of the base interval
//  No enemy (fast ones included) drives faster than maxSpeedVsPlayer
//  times the player's base speed (before shop upgrades).
//  With DEBUG on, the final enemy speeds are logged at each level start.
// =====================================================================

const ENEMY_SCALING = {
  speedPerLevel: 0.015,       // +1.5% speed per level
  speedMax: 1.25,             // ... up to +25%
  fireIntervalPerLevel: 0.02, // 2% less time between shots per level
  fireIntervalMin: 0.65,      // ... down to 65% of the base interval
  maxSpeedVsPlayer: 1.15,     // hard cap: 1.15x the player's base speed
};

// =====================================================================
//  Playfield size in tiles. Every map in levels.js must have exactly
//  GRID_ROWS strings of GRID_COLS letters each.
// =====================================================================

const GRID_COLS = 13;  // playfield width in tiles
const GRID_ROWS = 21;  // playfield height in tiles

// Level check on load (DEBUG only): at most this share of a map may be
// brick, concrete, metal or water (forest, sand and ice don't count)
const LEVEL_MAX_FILLED = 0.35;

// =====================================================================
//  Player, enemies, bullets and screen timings (game.js). Each enemy
//  type's own speed, health, bullets, fire rate and points are in
//  enemies.js; later levels make enemies faster (ENEMY_SCALING above).
// =====================================================================

// Player
const PLAYER_SPEED = 3;       // tiles per second
const PLAYER_LIVES = 3;       // lives at the start
const RESPAWN_DELAY = 1.0;    // seconds before the player comes back
const INVINCIBLE_TIME = 2.0;  // seconds of safety after coming back
// Corner assist: a tank this far off a gap (in tiles) slides into it
// instead of stopping at the wall
const CORNER_ASSIST_RANGE = 1 / 3;

// Enemies
const ENEMY_SPEED = 2;            // normal speed in tiles/second (level 1)
const MAX_ENEMIES_ON_SCREEN = 3;  // at most this many at once
const ENEMY_SPAWN_DELAY = 1.5;    // seconds between two spawns
const ENEMY_TURN_MIN = 0.5;       // AI picks a new direction every
const ENEMY_TURN_MAX = 2.0;       //   0.5 to 2 seconds
const ENEMY_HIT_FLASH_TIME = 0.12; // seconds an enemy flashes white when hit
// How likely each direction is when an enemy turns (bigger = more often)
const ENEMY_DIRECTION_WEIGHTS = { down: 4, left: 2, right: 2, up: 1 };

// Bullets and effects
const PLAYER_BULLET_SPEED = 10;   // tiles per second (enemy bullet
                                  // speeds are in enemies.js)
const BULLET_DAMAGE = 1;          // damage of a normal bullet
const ARMOR_PIERCING_DAMAGE = 2;  // damage with the armor-piercing upgrade
const EXPLOSION_TIME = 0.35;      // how long an explosion lasts, seconds
const SPARK_TIME = 0.15;          // how long a "bounced off" spark lasts
const ARMOR_BREAK_TIME = 0.5;     // how long the armor-break effect lasts

// Screens between levels
const LEVEL_INTRO_TIME = 1.5;     // seconds the "LEVEL X" screen shows
// On end screens, wait this long before the button works, so a
// player who is still mashing FIRE doesn't press it by accident
const BUTTON_DELAY = 1.0;         // seconds
// After the last enemy is destroyed, play goes on this long so the
// player can still grab the coins (ends early once none are left)
const LEVEL_END_DELAY = 4;        // seconds

// Shop screen (shop.js)
const SHOP_SHAKE_TIME = 0.35;   // seconds a card shakes (can't be bought)
const SHOP_INPUT_DELAY = 0.3;   // ignore input right after opening
const SHOP_DRAG_START = 8;      // pixels a finger moves before it scrolls

// Tutorial hints on level 1 (tutorial.js)
const FIRST_HINT_DELAY = 1.0;  // seconds after the level starts
const HINT_TIME = 3.0;         // seconds a hint stays on screen
const TOAST_FADE_IN = 0.25;    // seconds a hint takes to fade in
const TOAST_FADE_OUT = 0.6;    //   and to fade out

// =====================================================================
//  Economy config - all gold numbers in one place, to balance the game.
//
//  With DEBUG on, after every level the browser console prints how
//  much gold came from coins and from bonuses.
// =====================================================================

const ECONOMY = {
  // Coins dropped by destroyed enemies
  coinLifetime: 8,      // seconds a coin stays on the map
  coinBlinkTime: 3,     // it blinks during its last 3 seconds

  // Gold in the coin each enemy type drops (names from enemies.js)
  enemyGold: {
    basic: 8,
    fast: 12,
    heavy: 25,
  },

  // Bonuses added at the end of each level
  levelCompleteBonus: 40,  // for finishing the level
  baseWallsBonus: 25,      // if no base wall was damaged by an enemy bullet
  noLivesLostBonus: 25,    // if the player didn't lose a life
};

// =====================================================================
//  Shop (between levels) - prices and what each upgrade does.
//  The shop screen and the item list are in shop.js.
//  Everything bought is lost on game over / "Play again".
// =====================================================================

const SHOP = {
  // Bullet upgrade: tiers must be bought in order
  //   tier 1: bullets fly faster, tier 2: two bullets at once,
  //   tier 3: armor-piercing (damage 2, can break metal), three bullets
  bullet: {
    prices: [120, 280, 500],
    speedBonus: 0.3,        // tier 1: +30% bullet speed
    maxBulletsAtTier2: 2,   // tier 2: bullets on screen at once
    maxBulletsAtTier3: 3,   // tier 3: bullets on screen at once
  },

  // Tank speed: each tier adds this much speed
  tankSpeed: {
    prices: [100, 250, 450],
    bonusPerTier: 0.1,      // +10% per tier
  },

  // Extra life: +1 life right away, up to 3 times per run
  extraLife: {
    prices: [200, 400, 700],
  },

  // Armor: survive one hit (only one at a time, kept until it breaks)
  armor: {
    price: 100,
  },

  // Base steel: the next level starts with metal base walls
  baseSteel: {
    price: 60,
  },
};

// How long the base walls stay metal when a level starts with the
// "Base steel" upgrade (it uses the fortify effect and its blinking)
const BASE_STEEL_START_SECONDS = 30;

// =====================================================================
//  Field power-ups
//  The look and the effect of each type are in powerups.js; the
//  numbers are here. To add a new type, add it to "types" below and
//  to POWERUP_TYPES in powerups.js.
// =====================================================================

const POWERUPS = {
  flashingEnemyEvery: 4,  // every 4th enemy in a level carries a power-up
  lifetime: 10,           // seconds a power-up stays on the map
  blinkTime: 3,           // it blinks during its last 3 seconds

  types: {
    // chance:   how likely this type is to drop (out of all chances)
    // duration: seconds the effect lasts (leave out for instant ones)
    repair:  { chance: 30 },                             // fix base walls
    shield:  { chance: 30, duration: 12 },               // player invincible
    fortify: { chance: 25, duration: 15, blinkTime: 4 }, // metal base walls
    clock:   { chance: 15, duration: 5 },                // enemies frozen
  },
};

// =====================================================================
//  Looks of the player's tank with the shield power-up or the shop
//  armor, and of the pickups on the map (power-ups and coins). Only how
//  they look: the effects' own timings are in POWERUPS and ECONOMY.
// =====================================================================

const PLAYER_LOOKS = {
  // Tank colors with the shield and with armor (each set is painted once)
  shield: { body: "#3d8ef0", track: "#22303f", turret: "#93c6ff", outline: "#0a1c38" },  // blue
  armor:  { body: "#d5dce4", track: "#3a4048", turret: "#f5f8fb", outline: "#262c33" },  // bright silver
  shieldGlow: "#4da3ff",    // glow under the tank with the shield (also the shield power-up's color)
  armorGlow: "#e3eaf2",     // softer glow under the tank with armor
  armorRing: "#eef3f8",     // silver of the armor's break effect and its HUD badge
  glowSize: 1.7,            // glow width, in tiles
  shieldGlowAlpha: 0.6,     // shield glow strength (0-1)
  armorGlowAlpha: 0.35,     // armor glow strength (steady)
  pulseSpeed: 4,            // how fast the shield glow pulses
  pulseAmount: 0.3,         // how much the shield glow fades in and out (0-1)
  shieldWarningTime: 2,     // in the shield's last 2 seconds the tank blinks...
  shieldBlinkTime: 0.15,    // ...switching look every 0.15 seconds
};

// The player's base: a gold star in a gold ring on a dark steel plate
const BASE_LOOK = {
  plate: ["#6a7062", "#40453b", "#262a22"],             // steel plate: lit edge, middle, dark edge
  frame: "#1b1e18",                                     // dark frame around the plate
  rivet: "#9aa090",
  gold: ["#fff3b0", "#e8b83a", "#9c6c16", "#4a3208"],   // star and ring: shine, gold, shade, outline
};

const PICKUP_LOOKS = {
  badgeSize: 0.8,           // power-up badge width, in tiles
  coinSize: 0.56,           // coin width, in tiles
  glowSize: 1.4,            // glow width under a power-up, in tiles (coins: 80% of it)
  glowAlpha: 0.45,          // glow strength (0-1)
  pulseSpeed: 3,            // how fast the glow pulses
  pulseAmount: 0.35,        // how much the glow fades in and out (0-1)
  bobHeight: 0.05,          // power-ups float up and down this many tiles
  bobSpeed: 3,              // how fast they float
  coinSpinSpeed: 2.5,       // how fast coins turn
  blinkRate: 8,             // in their last seconds (blinkTime) pickups blink on and off 8 times a second
  rim: ["#f2f5f8", "#7b848e", "#3c434b"],             // badge's metal rim: light, middle, dark
  badge: ["#2e363f", "#14191e"],                      // badge's dark face: middle, edge
  coin: ["#fff2b0", "#f5c542", "#b8860b", "#6e4d07"], // coin: shine, gold, rim, dark edge
};

// =====================================================================
//  Terrain: numbers for the special map tiles (see materials.js)
// =====================================================================

const TERRAIN = {
  sandSpeedFactor: 0.6,     // tanks on sand move at 60% speed
  iceSlideTime: 0.35,       // seconds a tank keeps sliding on ice
  forestPlayerAlpha: 0.35,  // the player's tank under forest: 35% visible
  forestEnemyAlpha: 0.3,    // enemy tanks under forest: 30% visible (0 = hidden)
};

// =====================================================================
//  Visuals: soft shadows, ground shading and the playfield vignette.
//  Like the ground, bricks and tanks they are painted once into cached
//  pictures (cachedPicture in game.js), so they cost little per frame.
// =====================================================================

const VISUALS = {
  shadowOffset: 0.1,      // shadows fall this many tiles right and down (light from the top-left)
  shadowBlur: 0.07,       // how soft a shadow's edge is, in tiles
  wallShadowAlpha: 0.45,  // darkness of wall shadows (0 = none, 1 = black)
  tankShadowAlpha: 0.4,   // darkness of tank shadows
  tankShadowSize: 0.82,   // width and height of a tank's shadow, in tiles
  groundShade: 0.35,      // strength of the big soft patches across the ground (0 = none)
  vignetteAlpha: 0.4,     // darkness in the playfield's corners (0 = no vignette)
  marginShadow: 0.5,      // darkness of the playfield's shadow on the metal around it (0-1)
};

// =====================================================================
//  Tank explosions (drawBlast in game.js): a flash, a fireball that
//  cools from white to dark red, smoke, a shock ring, sparks and metal
//  pieces in the tank's colors, and a scorch mark left on the ground.
//  The base blows up the same way, bigger. Only looks: nothing here
//  changes gameplay. Sizes are in tiles, times in seconds.
// =====================================================================

const BLAST_LOOKS = {
  time: 1.4,            // how long the whole blast lasts (the smoke goes last)
  baseSize: 1.4,        // the base's blast is this much bigger than a tank's
  firePuffs: 7,         // fire clouds in the fireball
  smokePuffs: 5,        // dark smoke clouds rising after the fire
  debris: 8,            // metal pieces thrown off, in the tank's colors
  sparks: 12,           // bright streaks flying out
  flashTime: 0.18,      // the white flash at the start...
  flashSize: 2.4,       // ...and its width
  glowTime: 0.6,        // warm light on the ground around the blast...
  glowSize: 3.2,        // ...its width...
  glowAlpha: 0.55,      // ...and strength (0-1)
  ringTime: 0.3,        // the shock ring grows for this long...
  ringSize: 1.5,        // ...to this radius
  smokeAlpha: 0.6,      // how dark the smoke gets (0-1)
  scorchTime: 8,        // a scorch mark stays on the ground this long...
  scorchFade: 3,        // ...fading out over its last 3 seconds
  scorchAlpha: 0.6,     // how dark it is (0-1)
  scorchSize: 1.5,      // its width
  maxScorchMarks: 12,   // the oldest mark goes when there are more
  // The fireball's three stages, hot to cool: middle, inner, outer color
  fire: [
    ["#ffffff", "#ffe27a", "#ff8a1f"],
    ["#ffd45a", "#ff8a1f", "#d8431a"],
    ["#b8401c", "#6e2614", "#2a1410"],
  ],
  smoke: "#383330",
  flash: "#fff4c8",
  glow: "#ff8a2a",
  spark: "#ffd36b",
  ring: "#fff1c0",
};

// =====================================================================
//  Themes (see themes.js): the world banner and ambient effects
// =====================================================================

// Seconds the "World 2: Jungle" banner shows when the theme changes
const WORLD_INTRO_TIME = 2;

const AMBIENT = {
  enabled: true,     // false = no ambient effects (snow) at all
  snowFlakes: 40,    // number of snowflakes (at most 40)
  snowSpeed: 1.5,    // tiles per second they fall (each flake a bit different)
  snowDrift: 0.25,   // how far they sway sideways, in tiles
};

// =====================================================================
//  Saving (save.js): one JSON string in localStorage
// =====================================================================

const SAVE = {
  key: "tankrush_save_v1", // localStorage key (the save's own "version" field is inside the data)
  maxBytes: 500 * 1024,    // a save bigger than this isn't written
};

// =====================================================================
//  Continue on the game over screen (game.js): "Continue" asks ads.js
//  for a rewarded ad (showRewardedAd; for now it gives the reward with
//  no ad), then the lost level starts again from its checkpoint (how
//  the run stood when the level started)
// =====================================================================

// Continues per run ("Start over" starts a new run): a number, or null
// (or Infinity) for no limit. They are counted and saved either way.
const REWARDED_CONTINUES_PER_RUN = null;
const START_LIVES_AFTER_CONTINUE = 3;  // lives after a continue
const AD_MESSAGE_TIME = 2;   // seconds UI_TEXT.gameOver.noReward / adNotAvailable shows
const AD_WAIT_LIMIT = 90;    // seconds without an answer before giving up (paused time doesn't count)

// =====================================================================
//  Sound effects (audio.js): made in code, and for a few effects played
//  from the files in sounds/ once they have loaded (SOUND_FILES below).
//  Volumes go from 0 (silent) to 1 (full). Keep them low: they add up.
//  The volumes below (for the sounds made in code) are balanced so the
//  sounds are about as loud as each other should be on a phone speaker
//  (explosions louder than shots, hits and taps quieter).
// =====================================================================

const AUDIO = {
  effectsVolume: 0.5,  // master volume of all sound effects together
  maxSounds: 8,        // at most this many sounds playing at once
  repeatGap: 0.04,     // seconds: the same sound can't start again sooner than this
  pitchVariation: 0.05,  // shots, hits, explosions and coins: pitch +/- 5% each time...
  volumeVariation: 0.1,  // ... and volume +/- 10%, so they don't sound identical
  softenAbove: 7000,   // Hz: a gentle low-pass on all effects (no harsh highs)
  testBeepVolume: 0.8, // the debug "T" beep (loud on purpose)

  // The limiter at the very end (a compressor): keeps many sounds at
  // once from clipping. Threshold in dB, attack / release in seconds.
  limiter: { threshold: -8, knee: 4, ratio: 12, attack: 0.003, release: 0.2 },

  volumes: {
    playerShot: 0.9,
    enemyShot: 0.4,
    brickHit: 0.75,
    brickDestroy: 0.75,  // the hit that breaks a brick (made in code: the brick hit)
    concreteHit: 0.65,
    metalHit: 0.2,       // metal walls, and bullets blocked by a shield
    heavyHit: 0.3,       // a heavy tank hit but not destroyed
    explosion: 0.65,
    baseDestroyed: 0.85,
    coin: 0.35,
    powerUp: 0.23,
    armorBreak: 0.35,
    purchase: 0.5,
    cantAfford: 0.45,
    levelStart: 0.22,    // the short tune on the "LEVEL X" intro
    levelComplete: 0.27,
    gameOver: 0.35,
    uiTap: 0.3,
  },
};

// The player tank's engine (audio.js): a quiet low rumble while it
// drives. Its own master volume, kept clearly below the effects.
const ENGINE_VOLUME = 0.04;

const ENGINE_SOUND = {
  pitch: 50,               // Hz of the rumble at normal speed
  pitchPerSpeedTier: 0.04, // +4% pitch per tank speed upgrade tier
  sandPitch: 0.92,         // on sand: a little lower
  icePitch: 1.06,          // on ice: a little higher
  detune: 12,              // cents between the two waves (a slow, rough beat)
  filter: 600,             // Hz: low-pass, keeps it a dull rumble (phone speakers need some sound above ~300 Hz)
  noise: 0.25,             // the quiet noise layer's volume
  chugRate: 9,             // "chugs" per second at normal pitch
  chugDepth: 0.3,          // how much the chugging moves the volume (0-0.5)
  fadeIn: 0.06,            // seconds to fade in when the tank starts driving
  fadeOut: 0.15,           // seconds to fade out when it stops
};

// =====================================================================
//  Sound files (audio.js). They load in the background after the first
//  tap; until an effect's file has loaded (or if it fails to load) the
//  sound made in code plays instead.
//  Several files for one effect are variations: a random one plays each
//  time, never the same one twice in a row.
// =====================================================================

const SOUND_FILES = {
  folder: "sounds/",
  pitchVariation: 0.04, // each play: playback speed (and pitch) 1 +/- 4%

  // Effect name (as in AUDIO.volumes) -> its files in the folder
  files: {
    playerShot: ["player_cannon_01.wav"],
    enemyShot: ["enemy_cannon_01.wav"],
    brickHit: ["brick_impact_01.wav"],
    brickDestroy: ["brick_destroy.wav"],
    explosion: ["tank_explosion_02.wav"], // any tank blowing up
  },

  // The player's engine as a seamless loop, instead of the one made in
  // code (same fades, pitch changes, pause and mute). If the file is
  // missing the engine made in code plays.
  engineLoop: "engine_loop.wav",

  // One volume per effect for the files (1 = the file as it is). They go
  // through AUDIO.effectsVolume like every effect; the engine through
  // ENGINE_VOLUME.
  volumes: {
    playerShot: 1.0,
    enemyShot: 0.7,    // lowered: as loud as the player's shot at 1, and enemies fire a lot
    brickHit: 1.0,
    brickDestroy: 0.6, // lowered: the loudest and longest of the hits at 1
    explosion: 1.0,
    engine: 4.0,       // raised: the file is quiet, 4 is about as loud as the engine made in code
  },
};

// =====================================================================
//  Screen layout. Chosen only from the size of the game's window
//  (computeLayout in game.js): portrait when it is narrower than tall,
//  landscape otherwise.
//
//  Portrait: the playfield on top, the control zone at the bottom.
//  The control zone has three parts:
//    [movement control]  [HUD: lives, gold, score...]  [FIRE]
//  (swapped left/right with the left-handed setting)
// =====================================================================

const CONTROL_ZONE = {
  heightFraction: 0.22,  // zone height = 22% of the screen
  sideWidth: 1.1,        // movement and fire parts: this many zone heights wide,
  maxSideFraction: 0.3,  //   but at most 30% of the screen width each
  margin: 0.03,          // space around the D-pad, fire button and HUD: 3% of the zone height on each side
  badgeRowShare: 0.22,   // the upgrade badge row under the HUD display: at most 22% of the HUD part's height...
  badgeRowMax: 40,       //   ... and at most this many pixels tall
};

// Landscape: the playfield is shown turned a quarter clockwise (21 x 13
// tiles on screen, the base on the left, the enemy spawns on the right;
// mapToScreen() in game.js) and uses the full height (a little less if
// that makes room for the controls beside it, minFieldShare), centered. The side
// area on the movement side has the HUD (with the upgrade badges under
// it) at the top and the joystick or cross in the bottom corner, next
// to the playfield; the fire button sits in the other bottom corner
// (swapped by the left-handed setting). If the side areas are too narrow
// for that (nearly square windows), the controls are drawn see-through
// over the bottom corners of the playfield and the HUD is a slim strip
// above it. Menus and end screens are centered on the screen and scaled
// so their buttons are at least minTouch tall; one that is then taller
// than the screen scrolls.
const LANDSCAPE = {
  spacing: 8,            // pixels between the playfield, HUD, controls and screen edges
  controlShare: 0.4,     // joystick/cross and fire button: at most this share of the screen height...
  controlMax: 200,       //   ... and at most this many pixels
  minControl: 96,        // the drawn joystick and cross are at least this many pixels (else: overlay controls)
  minTouch: 48,          // smallest touch target in pixels (menu buttons are scaled up to this)
  maxFieldGap: 0.5,      // the controls are at most this many control widths away from the playfield
  minFieldShare: 0.85,   // the playfield may shrink to this share of its full-height size so the controls fit beside it (else: overlay controls)
  bottomMargin: 0.05,    // space under the controls: this share of the screen height (at least "spacing")
  hudMaxWidth: 260,      // the HUD display: at most this many pixels wide (at least as wide as the control)
  hudFontMax: 24,        // its text: at most this many pixels...
  hudFontMin: 10,        //   ... and at least this many (else: overlay controls and the HUD strip)
  pauseMinSize: 24,      // the pause button is drawn at least this many pixels big
  overlayAlpha: 0.55,    // overlay controls: how visible they are over the playfield
  overlayControlShare: 0.36, // overlay controls: this share of the playfield's shorter side (at least minControl)
  stripShare: 0.07,      // HUD strip above the playfield: this share of the screen height...
  stripMin: 28,          //   ... at least this many pixels...
  stripMax: 44,          //   ... and at most this many
  shopCardWidth: 10,     // shop cards in landscape: at least this many units wide (3 columns if they fit, else 2)...
  shopCardMax: 12,       //   ... and at most this many
  panelWidth: 17,        // pause menu, settings, level summary, game over and campaign complete (two columns): this many menu units wide...
  panelShare: 0.92,      //   ... if that's at most this share of the screen's width (else one column); title and panel at most this share of its height
  panelMinScale: 0.75,   //   ... text and spacing scaled down to fit, to at least this share of their size...
  minText: 14,           //   ... and text never under this many pixels (touch targets never under minTouch)
  settingsMinWidth: 15.5, // settings page: kept between the controls beside the playfield, but at least this many units wide
};

// The upgrade badges under the HUD display and in the pause menu
// (game.js): a small metal frame around a dark screen with the
// upgrade's icon, and tier dots under it for bullets and speed
const BADGE_ROW = {
  gap: 0.15,             // space between badges, in badge widths
  dotEmpty: "#060807",   // tier dot not bought yet: dark
  dotFilled: "#ffb340",  // tier dot bought: amber (like a pressed D-pad button)
  flashTime: 0.3,        // seconds a badge flashes brighter when it changes (bought, broken, used up)
  flashStrength: 0.85,   // how bright the flash gets at its peak (0-1)
};

// How the control panel looks (only looks: the controls work the same).
// The static parts are painted once into cached pictures (game.js).
const CONTROL_LOOK = {
  panel: ["#353a31", "#22261f", "#161913"],          // metal panel: top, middle, bottom
  panelTint: 0.25,       // how much of the theme's screen color is mixed into the panel
  panelShadow: 0.5,      // darkness of the shadow the panel throws up onto the playfield (0-1)
  rivet: "#8b917f",
  metal: ["#c4cacf", "#737a81", "#363b40", "#141719"],  // controls' metal: light, middle, dark, deepest
  arrow: "#d6dbe0",      // arrows on the D-pad and the joystick base
  pressed: "#ffb340",    // amber light and outline on a pressed D-pad button
  fire: ["#ff7a62", "#d42a1a", "#8a130b", "#430703"],   // fire button red: highlight, red, dark, deepest
  display: ["#18221b", "#0a0f0c"],                    // HUD screen: middle, edge
  idleJoystickAlpha: 0.45,  // the joystick when nobody touches it (0-1)
  hover: "rgba(255, 255, 255, 0.16)",       // over a button (or shop card) while the mouse is on it
  pressedShade: "rgba(0, 0, 0, 0.28)",      // over a button (or shop card) while it's pressed
  goldSubText: "#2e1f04",  // a gold button's second line: darker than its label, so the small text keeps 4.5:1
};

// =====================================================================
//  Level generator (levelgen.js)
// =====================================================================

// false = play the hand-made levels from levels.js.
// true  = a "generated run": level N is made by the generator with
//         seed GENERATOR.baseSeed + N, difficulty N (at most 15) and a
//         theme that changes every GENERATOR.levelsPerTheme levels.
//         The run never ends: there is always a next level.
const GENERATED_MODE = false;

// Endless mode: true = after the last hand-made level (20) the
// "CAMPAIGN COMPLETE" screen offers "Continue to Endless" (generated
// levels) or "Play again".
// Level N (21, 22, ...) uses seed GENERATOR.baseSeed + N, a theme that
// changes every GENERATOR.levelsPerTheme levels (GENERATOR.themeOrder)
// and difficulty min(15, startDifficulty + (N - 20) / levelsPerDifficulty).
// false = the "CAMPAIGN COMPLETE" screen has only "Play again".
const ENDLESS_ENABLED = true;

const ENDLESS = {
  startDifficulty: 5,      // difficulty of the first endless levels
  levelsPerDifficulty: 2,  // +1 difficulty every 2 levels (up to 15)
};

const GENERATOR = {
  baseSeed: 1000,         // level N uses seed baseSeed + N
  levelsPerTheme: 5,      // new theme every 5 levels
  themeOrder: ["standard", "jungle", "desert", "snow"],
  maxAttempts: 20,        // seeds to try before using the open layout
  maxSolidShare: 0.35,    // at most 35% of the map brick/concrete/metal/water

  // Rivers (themes.js decides how often): a band of water across the
  // map, somewhere between these rows, with crossings of crossingWidth
  // tiles. One crossing on the left half, mirrored = at least 2.
  riverRows: [5, 14],
  crossingWidth: 2,

  // Clear zones: only empty tiles here (the base keeps its brick wall)
  baseClear: 2,           // tiles around the base, left/right and up
  playerStartClear: 1,    // tiles around the player start
  spawnClear: 1,          // tiles around each enemy spawn point

  // Wall clusters per difficulty (index 0 = difficulty 1).
  //   clusters  wall pieces placed on the left half (then mirrored)
  //   brick, concrete, metal  how likely each material is, in %
  walls: [
    { clusters: 7,  brick: 90, concrete: 10, metal: 0 },   // 1
    { clusters: 7,  brick: 85, concrete: 15, metal: 0 },   // 2
    { clusters: 8,  brick: 80, concrete: 15, metal: 5 },   // 3
    { clusters: 8,  brick: 75, concrete: 20, metal: 5 },   // 4
    { clusters: 9,  brick: 70, concrete: 20, metal: 10 },  // 5
    { clusters: 9,  brick: 65, concrete: 25, metal: 10 },  // 6
    { clusters: 10, brick: 60, concrete: 25, metal: 15 },  // 7
    { clusters: 10, brick: 55, concrete: 30, metal: 15 },  // 8
    { clusters: 11, brick: 50, concrete: 30, metal: 20 },  // 9
    { clusters: 11, brick: 45, concrete: 35, metal: 20 },  // 10
    { clusters: 12, brick: 40, concrete: 35, metal: 25 },  // 11
    { clusters: 12, brick: 35, concrete: 40, metal: 25 },  // 12
    { clusters: 13, brick: 30, concrete: 40, metal: 30 },  // 13
    { clusters: 13, brick: 30, concrete: 35, metal: 35 },  // 14
    { clusters: 14, brick: 25, concrete: 35, metal: 40 },  // 15
  ],

  // (How many extras - rivers, ponds, forest, sand, ice - and their
  // sizes are per theme: "generatorTiles" in themes.js)

  // Enemy list: count grows from minEnemies (difficulty 1) to
  // maxEnemies (difficulty 15). Basic and fast from the start, the
  // heavy share rises. Every 4th one still carries a power-up
  // (POWERUPS.flashingEnemyEvery).
  minEnemies: 16,
  maxEnemies: 24,
  fastShare: 0.3,         // 30% of the list
  heavyShareMin: 0,       // heavy: 0% at difficulty 1 ...
  heavyShareMax: 0.4,     //   ... rising to 40% at difficulty 15
};
