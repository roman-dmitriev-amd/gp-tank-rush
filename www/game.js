// =====================================================================
//  Game - the update step, the game loop, system pause and start-up
//
//  Loaded last: everything else (see the script list in index.html) is
//  already there when init() runs.
// =====================================================================

// ---------------------------------------------------------------------
// Update: everything that changes each frame
// ---------------------------------------------------------------------
// Game time in seconds (stops while paused); used for blinking effects
let gameTime = 0;

function update(deltaSeconds) {
  stateTimer += deltaSeconds;
  gameTime += deltaSeconds;

  switch (gameState) {
    case GAME_STATE.WORLD_INTRO:
      // Show "World 2: Jungle" for a moment, then "LEVEL X"
      if (stateTimer >= WORLD_INTRO_TIME) setState(GAME_STATE.LEVEL_INTRO);
      break;

    case GAME_STATE.LEVEL_INTRO:
      // Show "LEVEL X" for a moment, then start playing
      if (stateTimer >= LEVEL_INTRO_TIME) setState(GAME_STATE.PLAYING);
      break;

    case GAME_STATE.PLAYING:
      updatePlayer(deltaSeconds);
      updateSpawning(deltaSeconds);
      updateEnemies(deltaSeconds);
      updateBullets(deltaSeconds);
      updateCoins(deltaSeconds);
      updatePowerUp(deltaSeconds);
      updateEffects(deltaSeconds);
      updateExplosions(deltaSeconds);
      updateShake(deltaSeconds);     // feedback.js
      updateLevelEnd(deltaSeconds);
      updateTutorial(deltaSeconds);  // level 1 hints
      break;

    case GAME_STATE.SHOP:
      updateShop(deltaSeconds);  // only the shop screen's animations
      break;

    case GAME_STATE.LEVEL_SUMMARY:
    case GAME_STATE.CAMPAIGN_COMPLETE:
    case GAME_STATE.LOST:
      // Everything is frozen; only let the last explosions finish (and
      // the game over screen's ad message run out)
      updateExplosions(deltaSeconds);
      updateShake(deltaSeconds);
      gameOverScreen.messageTime -= deltaSeconds;
      break;
  }
}

// ---------------------------------------------------------------------
// Game loop (runs about 60 times per second)
// ---------------------------------------------------------------------
let lastTime = 0;
let frameRequest = null;

function loop(time) {
  // Time since the last frame, in seconds. Capped so tanks do not
  // "jump" after a slow frame.
  const deltaSeconds = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  // While the pause menu is open (or a rewarded ad loads or plays),
  // nothing moves and no timer counts (all timers are counted in
  // update), but we keep drawing the menu. A rewarded ad's answer is
  // taken here, so never while the app is hidden.
  if (!isPaused()) update(deltaSeconds);
  updateAdWait(deltaSeconds);
  updateEngineSound();
  draw();

  frameRequest = requestAnimationFrame(loop);
}

function startLoop() {
  if (frameRequest !== null) return; // already running
  frameRequest = requestAnimationFrame((time) => {
    lastTime = time; // start fresh so the first step is not huge
    frameRequest = requestAnimationFrame(loop);
  });
}

function stopLoop() {
  if (frameRequest !== null) cancelAnimationFrame(frameRequest);
  frameRequest = null;
}

// ---------------------------------------------------------------------
// Pause / resume from outside the game (the menu is in pause.js)
// The app went to the background, the screen turned off or the tab was
// hidden: EVERYTHING stops (the game loop, input, sound) and the game is
// saved, since the player may not come back. During a level the pause
// menu opens too, so coming back never drops the player straight into
// the action: they press RESUME themselves.
// ---------------------------------------------------------------------
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    openPauseMenu(true); // without the tap sound; does nothing outside a level
    setSystemPause(true);
    writeSave();
  } else {
    setSystemPause(false);
  }
});

// ---------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------
// The loading screen: the metal background (ui.js) with the gold star
// plate and "LOADING..." on a title plate under it
function showLoadingScreen() {
  const s = field.tileSize;
  const cx = view.width / 2;
  const cy = view.height / 2;
  drawMetalBackground();
  drawStarEmblem(cx, cy - s * 1.2, s * 3, false);
  drawTitlePlate("LOADING...", cx, cy + s * 1.4, s * 0.7, "#ffffff", view.width - s);
}

function init() {
  // 1. Set up a fresh game (level 1), size everything and show the
  //    loading screen until the save is loaded
  checkLevels();
  layoutSelfTest();
  newGame();
  setState(GAME_STATE.LOADING);
  resize();
  showLoadingScreen();

  // 2. Read the save (save.js): then the continue screen shows (a run
  //    was saved) or the "LEVEL 1" intro starts
  document.title = GAME_TITLE + ": " + GAME_SUBTITLE;
  loadSaveAtStartup();

  // 3. On the next frame, start the loop
  requestAnimationFrame(() => {
    if (isSystemPaused()) return; // hidden already: showing the app starts the loop
    draw();
    startLoop();
  });
}

init();
