// =====================================================================
//  Saving - settings, records and the run in progress.
//
//  This file has:
//    - "Save": stores ONE small JSON string in localStorage under one
//      key (SAVE.key in config.js), everything in try/catch: storage
//      that is missing, full or broken never stops the game. No other
//      storage (sessionStorage, cookies, IndexedDB).
//    - "progress": best score, highest level and the run in progress,
//      and writeSave() which saves everything at once
//    - loadSaveAtStartup(): reads the save once when the game starts
//    - the "Continue from level X / New game" screen shown at start-up
//      when a run was saved
//
//  Saves only happen on events (shop opened, level done, game over,
//  setting changed, the app hidden), never every frame.
//
//  Saved data (SAVE_VERSION 1):
//    { version, settings: { sound, soundEffects, engineSound, leftHanded, controlType },
//      bestScore, highestLevel, tutorialDone, campaignComplete,
//      checkpoint: null or { level, gold, score, upgrades, seed },
//      run: null or { level, gold, lives, score, upgrades, continuesUsed } }
//  Saves from every version load: each field is checked on its own
//  (applySaveData), and one that is missing or wrong keeps its default.
//  settings.sound is the overall sound switch; soundEffects and
//  engineSound each turn off only their part.
//  run.level is the level the shop leads to (1-based). checkpoint is
//  how the run stood when the current level started (seed only for
//  generated levels), for the retries on the game over screen
//  (state.js). Change SAVE_VERSION when the format changes, and keep
//  reading the older versions.
// =====================================================================

const SAVE_VERSION = 1;

const Save = {
  // Store the data object as one JSON string (at most SAVE.maxBytes).
  // Errors are only logged (with DEBUG).
  save(data) {
    try {
      const text = JSON.stringify(data);
      if (text.length * 2 > SAVE.maxBytes) { // a JavaScript string: 2 bytes per character
        if (DEBUG) console.warn("Save: too big (" + text.length + " characters), not saved");
        return;
      }
      localStorage.setItem(SAVE.key, text);
    } catch (e) {
      if (DEBUG) console.warn("Save failed", e);
    }
  },

  // The saved JSON string, or null when nothing is saved yet or it
  // couldn't be read
  load() {
    try {
      return localStorage.getItem(SAVE.key);
    } catch (e) {
      if (DEBUG) console.warn("Load failed", e);
      return null;
    }
  },
};

// JSON string -> save object, or null if it isn't a usable save. Every
// version is accepted (older ones, and a newer one after a rollback):
// applySaveData checks each field on its own.
function parseSave(text) {
  if (typeof text !== "string" || text === "") return null;
  try {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && Number.isInteger(data.version) && data.version >= 1) return data;
  } catch (e) {
    if (DEBUG) console.warn("Save data is broken, starting fresh");
  }
  return null;
}

// ---------------------------------------------------------------------
// What is saved besides the settings (pause.js) and tutorial.done
// (tutorial.js)
// ---------------------------------------------------------------------
const progress = {
  bestScore: 0,
  highestLevel: 0,   // highest level number played
  campaignComplete: false, // hand-made level 20 was ever completed
  checkpoint: null,  // the run when the current level started (takeCheckpoint)
  run: null,         // run in progress (saved when the shop opens)
};

// Everything to save, as one small object
function buildSaveData() {
  return {
    version: SAVE_VERSION,
    settings: {
      sound: settings.sound,
      soundEffects: settings.soundEffects,
      engineSound: settings.engineSound,
      leftHanded: settings.leftHanded,
      controlType: settings.controlType,
    },
    bestScore: progress.bestScore,
    highestLevel: progress.highestLevel,
    campaignComplete: progress.campaignComplete,
    tutorialDone: tutorial.done,
    checkpoint: progress.checkpoint,
    run: progress.run,
  };
}

// Save everything now. In the shop the run is taken again, so what the
// player just bought is kept too.
function writeSave() {
  if (gameState === GAME_STATE.SHOP) rememberRun();
  Save.save(buildSaveData());
}

// The run as it is in the shop: the next level, gold, lives, score,
// everything bought (permanent tiers, held armor and base steel) and the
// rewarded continues used (state.js)
function rememberRun() {
  progress.run = {
    level: levelIndex + 2,
    gold,
    lives,
    score,
    upgrades: { ...upgrades },
    continuesUsed,
  };
}

// A level starts (before its start effects, so a pending base steel is
// still held): remember the level, gold, score and upgrades, and the
// seed of a generated level, for the rewarded continue on the game over
// screen (gameover.js). Replaced when the next level starts.
function takeCheckpoint() {
  progress.checkpoint = {
    level: levelIndex + 1,
    gold,
    score,
    upgrades: { ...upgrades },
  };
  const seed = currentLevel().seed;
  if (seed !== undefined) progress.checkpoint.seed = seed;
}

// The run saved after a rewarded continue (continueFromCheckpoint in
// gameover.js): the lost level's checkpoint with
// START_LIVES_AFTER_CONTINUE lives, so closing the game during the
// continued level and opening it again offers "Continue from level X"
// (the shop before that level). The continue is already counted.
function checkpointRun() {
  const checkpoint = progress.checkpoint;
  return {
    level: checkpoint.level,
    gold: checkpoint.gold,
    lives: START_LIVES_AFTER_CONTINUE,
    score: checkpoint.score,
    upgrades: { ...checkpoint.upgrades },
    continuesUsed,
  };
}

// A level was completed or the game ended: update the records
function updateRecords() {
  progress.bestScore = Math.max(progress.bestScore, score);
  progress.highestLevel = Math.max(progress.highestLevel, levelIndex + 1);
}

// DEBUG "Clear save" (pause menu): forget records, run and tutorial.
// The current settings stay and are saved with the empty progress.
function clearSave() {
  progress.bestScore = 0;
  progress.highestLevel = 0;
  progress.campaignComplete = false;
  progress.run = null;
  tutorial.done = false;
  writeSave();
  if (DEBUG) console.log("[Save] cleared");
}

// A whole number between min and max, or null
function savedInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

// Put a loaded save into the game. Every value is checked; anything
// wrong or missing keeps its default.
function applySaveData(data) {
  const s = data.settings || {};
  if (typeof s.sound === "boolean") settings.sound = s.sound;
  if (typeof s.soundEffects === "boolean") settings.soundEffects = s.soundEffects;
  if (typeof s.engineSound === "boolean") settings.engineSound = s.engineSound;
  if (typeof s.leftHanded === "boolean") settings.leftHanded = s.leftHanded;
  if (s.controlType === "drag" || s.controlType === "cross") settings.controlType = s.controlType;

  progress.bestScore = savedInt(data.bestScore, 0, Number.MAX_SAFE_INTEGER) || 0;
  progress.highestLevel = savedInt(data.highestLevel, 0, 1e6) || 0;
  if (data.tutorialDone === true) tutorial.done = true;
  progress.campaignComplete = data.campaignComplete === true;
  progress.run = readSavedRun(data.run);
  // The checkpoint is only kept with the saved
  // run whose level it belongs to. Otherwise the one taken when level 1
  // was set up at start-up stays; a level always takes a new one anyway.
  const checkpoint = readSavedCheckpoint(data.checkpoint);
  if (checkpoint && progress.run && checkpoint.level === progress.run.level) {
    progress.checkpoint = checkpoint;
  }
}

// Saved shop upgrades (a run's or a checkpoint's), or null if a tier
// doesn't make sense
function readSavedUpgrades(saved) {
  const u = saved || {};
  const result = {
    bulletTier: savedInt(u.bulletTier, 0, SHOP.bullet.prices.length),
    speedTier: savedInt(u.speedTier, 0, SHOP.tankSpeed.prices.length),
    livesBought: savedInt(u.livesBought, 0, SHOP.extraLife.prices.length),
    hasArmor: u.hasArmor === true,
    baseSteelPending: u.baseSteelPending === true,
  };
  if ([result.bulletTier, result.speedTier, result.livesBought].includes(null)) return null;
  return result;
}

// The saved run, or null if there is none or it doesn't make sense
function readSavedRun(run) {
  if (!run || typeof run !== "object") return null;
  const result = {
    level: savedInt(run.level, 2, 1e6),
    gold: savedInt(run.gold, 0, 1e9),
    lives: savedInt(run.lives, 1, 99),
    score: savedInt(run.score, 0, Number.MAX_SAFE_INTEGER),
    upgrades: readSavedUpgrades(run.upgrades),
    continuesUsed: savedInt(run.continuesUsed, 0, 1e6) || 0,
  };
  if ([result.level, result.gold, result.lives, result.score, result.upgrades].includes(null)) return null;
  // Without endless mode there is nothing after the last level
  if (!GENERATED_MODE && !ENDLESS_ENABLED && result.level > LEVELS.length) return null;
  return result;
}

// The saved checkpoint, or null if there is none or it doesn't make sense
function readSavedCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") return null;
  const result = {
    level: savedInt(checkpoint.level, 1, 1e6),
    gold: savedInt(checkpoint.gold, 0, 1e9),
    score: savedInt(checkpoint.score, 0, Number.MAX_SAFE_INTEGER),
    upgrades: readSavedUpgrades(checkpoint.upgrades),
  };
  if (Object.values(result).includes(null)) return null;
  if (checkpoint.seed !== undefined) {  // generated levels only
    if (!Number.isInteger(checkpoint.seed)) return null;
    result.seed = checkpoint.seed;
  }
  return result;
}

// ---------------------------------------------------------------------
// Loading: once, when the game starts (init in game.js). A missing or
// broken save, or one that can't be used, starts the game fresh.
// ---------------------------------------------------------------------
function loadSaveAtStartup() {
  const data = parseSave(Save.load());
  if (DEBUG) console.log("[Save] loaded:", data ? JSON.stringify(data) : "nothing");
  try {
    if (data) applySaveData(data);
  } catch (e) {
    if (DEBUG) console.warn("Save data could not be used, starting fresh", e);
    progress.run = null;
  }
  Sound.refreshMute(); // the SOUND setting (audio.js)
  finishStartup();
}

// The start-up is over (the save is in): show the
// continue screen (a run was saved) or the "LEVEL 1" intro
function finishStartup() {
  resize(); // the left-handed setting moves the controls
  if (progress.run) {
    continuePrompt.selected = 0;
    setState(GAME_STATE.CONTINUE_PROMPT);
  } else {
    setState(GAME_STATE.LEVEL_INTRO); // level 1 is already set up
  }
}

// ---------------------------------------------------------------------
// Continue screen: "Continue from level X" (yellow) and "New game"
// ---------------------------------------------------------------------
const continuePrompt = { selected: 0 }; // button chosen with the keyboard

// Where the screen goes (overlayFrame in layout.js): from the top of the
// star plate to the bottom of the last button
function continuePromptFrame() {
  return overlayFrame(-8.6, 3.4);
}

function continuePromptButtons() {
  const { s, cx, cy } = continuePromptFrame();
  const width = s * 9;
  const height = buttonHeight(s * 1.6); // at least 48 px (layout.js)
  const x = cx - width / 2;
  const top = cy - s * 0.5;
  return [
    {
      label: "CONTINUE FROM LEVEL " + (progress.run ? progress.run.level : ""),
      primary: true,
      action: continueSavedRun,  // state.js
      x, y: top, width, height,
    },
    {
      label: "NEW GAME",
      primary: false,
      action: () => {
        progress.run = null;
        writeSave();
        newGame();               // state.js
      },
      x, y: top + height + s * 0.6, width, height,
    },
  ];
}

function continuePromptTap(x, y) {
  for (const b of continuePromptButtons()) {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      Sound.play("uiTap");
      b.action();
      return;
    }
  }
}

// Up/Down choose, Enter or Space press
function continuePromptKeyDown(event) {
  const code = event.code;
  if (!["ArrowUp", "ArrowDown", "Enter", "Space"].includes(code)) return;
  event.preventDefault();
  if (code === "ArrowUp" || code === "ArrowDown") {
    continuePrompt.selected = 1 - continuePrompt.selected;
    scrollOverlayTo(continuePromptButtons()[continuePrompt.selected]); // input.js
  } else if (!event.repeat) {
    Sound.play("uiTap");
    continuePromptButtons()[continuePrompt.selected].action();
  }
}

// The font size (at most "size") at which bold text fits in maxWidth
function fitTextSize(text, size, maxWidth) {
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  const width = ctx.measureText(text).width;
  return width > maxWidth ? size * maxWidth / width : size;
}

function drawContinuePrompt() {
  const { s, cx, cy } = continuePromptFrame();

  drawMetalBackground(); // same dark metal as the shop (ui.js)

  // The gold star plate, the title (large, gold) and the subtitle on a
  // metal plate, each shrunk if needed so it fits on one line inside the
  // playfield width on narrow phones, and the best score on a small
  // framed strip (ui.js)
  const maxWidth = s * (GRID_COLS - 1);
  drawStarEmblem(cx, cy - s * 7.1, s * 2.8, false);
  drawOutlinedText(GAME_TITLE.toUpperCase(), cx, cy - s * 4.6,
    fitTextSize(GAME_TITLE.toUpperCase(), s * 1.5, maxWidth), "#ffd75e");
  drawTitlePlate(GAME_SUBTITLE.toUpperCase(), cx, cy - s * 3.05, s * 0.65, "#ffffff", maxWidth);
  drawMessageStrip("BEST SCORE " + progress.bestScore, cx, cy - s * 1.7, s * 0.45, "#c9ced6", maxWidth);

  // Keyboard players see which button Enter will press
  const showSelection = showKeyboardFocus(); // input.js
  continuePromptButtons().forEach((b, i) => {
    drawMenuButton(b, showSelection && i === continuePrompt.selected); // gameover.js
  });
}
