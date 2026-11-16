// =====================================================================
//  Saving - settings, records and the run in progress.
//
//  This file has:
//    - "Save": stores ONE small JSON string. Inside YouTube Playables
//      (ytgame.IN_PLAYABLES_ENV) it uses ONLY ytgame.game.saveData /
//      loadData; localStorage only when the game runs outside Playables
//      (locally). No other storage (sessionStorage, cookies, IndexedDB).
//    - loading at start-up: YouTube rejects saveData until loadData has
//      succeeded, so nothing is saved before that (saves wait), and the
//      game loop takes loadData's answer (updateSaveLoading), so it waits
//      while YouTube has the game paused
//    - "progress": best score, highest level and the run in progress,
//      and writeSave() which saves everything at once
//    - submitScore(): scores go to YouTube only once the save has loaded,
//      so the best score YouTube shows matches the saved one
//    - the "Continue from level X / New game" screen shown at start-up
//      when a run was saved
//
//  Saves only happen on events (shop opened, level done, game over,
//  setting changed, YouTube pause), never every frame.
//
//  Saved data (SAVE_VERSION 1):
//    { version, settings: { soundEffects, engineSound, leftHanded, controlType },
//      bestScore, highestLevel, tutorialDone, campaignComplete,
//      checkpoint: null or { level, gold, score, upgrades, seed },
//      run: null or { level, gold, lives, score, upgrades, continuesUsed } }
//  Saves from every version load: each field is checked on its own
//  (applySaveData), and one that is missing or wrong keeps its default.
//  Added later without a version change: campaignComplete,
//  settings.engineSound, checkpoint and run.continuesUsed (missing:
//  false, on, none, 0), and
//  settings.soundEffects, which replaced the overall settings.sound (an
//  older save's sound off turns the effects and the engine off).
//  run.level is the level the shop leads to (1-based). checkpoint is
//  how the run stood when the current level started (seed only for
//  generated levels), for the retries on the game over screen
//  (game.js). Change SAVE_VERSION when the format changes, and keep
//  reading the older versions.
// =====================================================================

const SAVE_VERSION = 1;

const Save = {
  // Use YouTube's storage only inside Playables (the SDK also loads
  // when the page is opened locally, but saving there doesn't work)
  useSdk() {
    return typeof ytgame !== "undefined" && ytgame.IN_PLAYABLES_ENV === true;
  },

  // Store the data object as one JSON string (at most SAVE.maxBytes).
  // Errors are only logged.
  save(data) {
    let text;
    try {
      text = JSON.stringify(data);
    } catch (e) {
      console.warn("Save: could not convert the data", e);
      return;
    }
    if (text.length * 2 > SAVE.maxBytes) { // a JavaScript string: 2 bytes per character
      console.warn("Save: too big (" + text.length + " characters), not saved");
      return;
    }
    if (this.useSdk()) {
      try {
        ytgame.game.saveData(text).catch((e) => console.warn("Save failed", e));
      } catch (e) {
        console.warn("Save failed", e);
      }
    } else {
      try {
        localStorage.setItem(SAVE.key, text);
      } catch (e) {
        console.warn("Save failed", e);
      }
    }
  },

  // Resolves to the saved JSON string ("" or null when nothing is
  // saved yet); rejects when it couldn't be read
  load() {
    try {
      if (this.useSdk()) return Promise.resolve(ytgame.game.loadData());
      return Promise.resolve(localStorage.getItem(SAVE.key));
    } catch (e) {
      return Promise.reject(e);
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
    console.warn("Save data is broken, starting fresh");
  }
  return null;
}

// ---------------------------------------------------------------------
// What is saved besides the settings (pause.js) and tutorial.done
// (tutorial.js)
// ---------------------------------------------------------------------
const progress = {
  loaded: false,     // loadData succeeded: saving and sending scores are
                     // allowed (before that YouTube rejects saves, and a
                     // save could replace the stored one)
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
// player just bought is kept too. Before the save has loaded nothing is
// written: the save waits ("saveWanted") and is written once loading
// worked; after a failed load, this tries loading again (not while
// YouTube has the game paused: no network calls then).
let saveWanted = false;

function writeSave() {
  if (gameState === GAME_STATE.SHOP) rememberRun();
  if (!progress.loaded) {
    saveWanted = true;
    if (saveLoading.failed && !isSystemPaused()) startLoadingSave();
    return;
  }
  saveWanted = false;
  Save.save(buildSaveData());
}

// Send the run's score to YouTube (game.js calls this right after
// updateRecords and writeSave). YouTube shows the best score ever sent,
// which must match the saved best score, so before the save has loaded
// the score waits (the highest one) and goes out once it has.
let scoreWaiting = null;

function submitScore(value) {
  if (progress.loaded) sdk.sendScore(value);
  else scoreWaiting = Math.max(scoreWaiting ?? 0, value);
}

// The run as it is in the shop: the next level, gold, lives, score,
// everything bought (permanent tiers, held armor and base steel) and the
// rewarded continues used (game.js)
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
// screen (game.js). Replaced when the next level starts.
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

// The run saved on game over while the rewarded continue is offered
// (loseGame in game.js): the lost level's checkpoint with
// START_LIVES_AFTER_CONTINUE lives, so closing the game there and
// opening it again offers "Continue from level X" (the shop before that
// level). That counts as one of the continues.
function checkpointRun() {
  const checkpoint = progress.checkpoint;
  return {
    level: checkpoint.level,
    gold: checkpoint.gold,
    lives: START_LIVES_AFTER_CONTINUE,
    score: checkpoint.score,
    upgrades: { ...checkpoint.upgrades },
    continuesUsed: continuesUsed + 1,
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
  if (typeof s.soundEffects === "boolean") {
    settings.soundEffects = s.soundEffects;
  } else if (s.sound === false) {
    // An older save with the old overall SOUND setting off: keep it quiet
    settings.soundEffects = false;
    settings.engineSound = false;
  }
  if (typeof s.engineSound === "boolean" && s.sound !== false) settings.engineSound = s.engineSound; // missing in older saves: stays on
  if (typeof s.leftHanded === "boolean") settings.leftHanded = s.leftHanded;
  if (s.controlType === "drag" || s.controlType === "cross") settings.controlType = s.controlType;

  progress.bestScore = savedInt(data.bestScore, 0, Number.MAX_SAFE_INTEGER) || 0;
  progress.highestLevel = savedInt(data.highestLevel, 0, 1e6) || 0;
  if (data.tutorialDone === true) tutorial.done = true;
  progress.campaignComplete = data.campaignComplete === true; // missing in older saves
  progress.run = readSavedRun(data.run);
  // The checkpoint (missing in older saves) is only kept with the saved
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
    continuesUsed: savedInt(run.continuesUsed, 0, 1e6) || 0, // missing in older saves
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
// Loading. startLoadingSave() asks for the save; its answer is only
// stored, and the game loop takes it (updateSaveLoading), so nothing
// happens while YouTube has the game paused. The start-up waits on the
// loading screen until the answer is there, or SAVE.loadTimeout seconds
// of unpaused time have passed: then the game starts fresh, and a save
// that comes later is merged in (mergeLateSave). A failed load is tried
// again at the next save (writeSave).
// ---------------------------------------------------------------------
const saveLoading = {
  busy: false,    // loadData was asked and hasn't answered yet
  answer: null,   // its answer, not taken yet: { ok, text }
  failed: false,  // the last load failed (try again at the next save)
  waited: 0,      // seconds the start-up has waited
};

function startLoadingSave() {
  if (saveLoading.busy || progress.loaded) return;
  saveLoading.busy = true;
  saveLoading.failed = false;
  Save.load().then(
    (text) => { saveLoading.answer = { ok: true, text }; },
    (e) => {
      console.warn("Load failed", e);
      saveLoading.answer = { ok: false };
    }
  );
}

// Every frame (game loop): take the load's answer, and end the start-up
// once it's there or waited long enough
function updateSaveLoading(deltaSeconds) {
  const answer = saveLoading.answer;
  if (answer) {
    saveLoading.answer = null;
    saveLoading.busy = false;
    if (answer.ok) useLoadedSave(answer.text);
    else saveLoading.failed = true;
  }
  if (gameState === GAME_STATE.LOADING) {
    saveLoading.waited += deltaSeconds;
    if (!saveLoading.busy || saveLoading.waited >= SAVE.loadTimeout) finishStartup();
  }
}

// loadData succeeded: put the save into the game (at start-up), or merge
// it (it came after the game had started fresh). Then saving is allowed:
// a save that waited is written, a score that waited is sent.
function useLoadedSave(text) {
  const data = parseSave(text);
  if (DEBUG) console.log("[Save] loaded:", data ? JSON.stringify(data) : "nothing");
  try {
    if (gameState === GAME_STATE.LOADING) {
      if (data) applySaveData(data);
    } else if (data) {
      mergeLateSave(data);
    }
  } catch (e) {
    console.warn("Save data could not be used, starting fresh", e);
    progress.run = null;
  }
  progress.loaded = true;
  if (saveWanted) writeSave();
  if (scoreWaiting !== null) {
    sdk.sendScore(scoreWaiting); // game.js
    scoreWaiting = null;
  }
}

// The save came after the game had started fresh: keep the better
// records (so the saved best score never goes down), this session's
// settings, and this session's run, or else the saved one, so it isn't
// lost (it's offered at the next start)
function mergeLateSave(data) {
  const now = {
    bestScore: progress.bestScore,
    highestLevel: progress.highestLevel,
    campaignComplete: progress.campaignComplete,
    tutorialDone: tutorial.done,
    checkpoint: progress.checkpoint,
    run: progress.run,
    settings: { ...settings },
  };
  applySaveData(data);
  progress.bestScore = Math.max(progress.bestScore, now.bestScore);
  progress.highestLevel = Math.max(progress.highestLevel, now.highestLevel);
  progress.campaignComplete = progress.campaignComplete || now.campaignComplete;
  tutorial.done = tutorial.done || now.tutorialDone;
  progress.checkpoint = now.checkpoint;
  if (now.run) progress.run = now.run;
  Object.assign(settings, now.settings);
}

// The start-up is over (the save is in, or it took too long): show the
// continue screen (a run was saved) or the "LEVEL 1" intro
function finishStartup() {
  resize(); // the left-handed setting moves the controls
  if (progress.run) {
    continuePrompt.selected = 0;
    setState(GAME_STATE.CONTINUE_PROMPT);
    sendGameReady(); // the buttons work right away
  } else {
    setState(GAME_STATE.LEVEL_INTRO); // level 1 is already set up
  }
}

// ---------------------------------------------------------------------
// Continue screen: "Continue from level X" (yellow) and "New game"
// ---------------------------------------------------------------------
const continuePrompt = { selected: 0 }; // button chosen with the keyboard

// Where the screen goes (overlayFrame in game.js): from the top of the
// star plate to the bottom of the last button
function continuePromptFrame() {
  return overlayFrame(-8.6, 3.4);
}

function continuePromptButtons() {
  const { s, cx, cy } = continuePromptFrame();
  const width = s * 9;
  const height = buttonHeight(s * 1.6); // at least 48 px (game.js)
  const x = cx - width / 2;
  const top = cy - s * 0.5;
  return [
    {
      label: "CONTINUE FROM LEVEL " + (progress.run ? progress.run.level : ""),
      primary: true,
      action: continueSavedRun,  // game.js
      x, y: top, width, height,
    },
    {
      label: "NEW GAME",
      primary: false,
      action: () => {
        progress.run = null;
        writeSave();
        newGame();               // game.js
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
    scrollOverlayTo(continuePromptButtons()[continuePrompt.selected]); // game.js
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
  const showSelection = showKeyboardFocus(); // game.js
  continuePromptButtons().forEach((b, i) => {
    drawMenuButton(b, showSelection && i === continuePrompt.selected); // game.js
  });
}
