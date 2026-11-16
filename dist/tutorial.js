// =====================================================================
//  Tutorial hints.
//
//  Level 1 (until the player finishes it once): three short hints, each
//  shown when it makes sense:
//    1. how to move   - about a second after the level starts
//    2. how to fire   - once the player has moved
//    3. protect base  - once the player has fired
//
//  A hint uses one message slot ("toast") that fades in and out.
//  Everything counts game time, so it stops on pause. The timings
//  (FIRST_HINT_DELAY, HINT_TIME, TOAST_FADE_IN, TOAST_FADE_OUT) are in
//  config.js.
// =====================================================================

const tutorial = {
  done: false,      // true once level 1 was completed (hints never again)
  step: 0,          // which hint comes next (0, 1, 2; 3 = all shown)
  delay: 0,         // counts down to the first hint
  moved: 0,         // tiles the player has driven this level
  fired: false,     // has the player fired yet?
  lastX: null,      // player position last frame (to measure driving)
  lastY: null,
};

let toast = null;             // { text, age, duration } or null

// A level starts: hints from the beginning (level 1)
function resetTutorialForLevel() {
  tutorial.step = 0;
  tutorial.delay = FIRST_HINT_DELAY;
  tutorial.moved = 0;
  tutorial.fired = false;
  tutorial.lastX = null;
  tutorial.lastY = null;
  toast = null;
}

// Level 1 was completed: no more hints, ever (saved by save.js)
function tutorialLevelCompleted() {
  if (levelIndex === 0) tutorial.done = true;
}

function tutorialNoteFired() {
  tutorial.fired = true;
}

function hintsActive() {
  return levelIndex === 0 && !tutorial.done;
}

// The hint texts match the device and the control side setting
function isTouchDevice() {
  return navigator.maxTouchPoints > 0;
}

function moveHintText() {
  if (!isTouchDevice()) return "Use the arrow keys to move";
  if (settings.controlType === "drag") return "Drag anywhere to move";
  return settings.leftHanded ? "Drag on the right to move" : "Drag on the left to move";
}

function fireHintText() {
  return isTouchDevice() ? "Tap the button to fire" : "Press Space to fire";
}

// Called every frame while playing
function updateTutorial(deltaSeconds) {
  updateToast(deltaSeconds);
  if (!hintsActive()) return;

  trackPlayerDriving();
  if (toast) return; // the next hint waits until this one has faded

  if (tutorial.step === 0) {
    tutorial.delay -= deltaSeconds;
    if (tutorial.delay <= 0) showHint(moveHintText());
  } else if (tutorial.step === 1 && tutorial.moved >= 1) {
    showHint(fireHintText());
  } else if (tutorial.step === 2 && tutorial.fired) {
    showHint("Protect your base!");
  }
}

function showHint(text) {
  toast = { text, age: 0, duration: HINT_TIME };
  tutorial.step += 1;
}

// Add up how far the player drives (jumps, like a respawn, don't count)
function trackPlayerDriving() {
  if (!player.alive) {
    tutorial.lastX = null;
    return;
  }
  if (tutorial.lastX !== null) {
    const distance = Math.abs(player.x - tutorial.lastX) + Math.abs(player.y - tutorial.lastY);
    if (distance < 1) tutorial.moved += distance;
  }
  tutorial.lastX = player.x;
  tutorial.lastY = player.y;
}

function updateToast(deltaSeconds) {
  if (!toast) return;
  toast.age += deltaSeconds;
  if (toast.age >= toast.duration) toast = null;
}

// ---------------------------------------------------------------------
// Drawing: hints in the lower middle of the playfield as it is on
// screen (turned in landscape; the text itself is never turned)
// ---------------------------------------------------------------------
function drawTutorial() {
  if (!toast) return;
  const s = field.tileSize;
  const rect = fieldRect(); // game.js
  const cx = rect.x + rect.width / 2;

  // Fade in quickly, stay, fade out at the end
  const fadeIn = Math.min(1, toast.age / TOAST_FADE_IN);
  const fadeOut = Math.min(1, (toast.duration - toast.age) / TOAST_FADE_OUT);
  ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));

  // On a small framed dark strip, like the other messages (ui.js)
  drawMessageStrip(toast.text, cx, rect.y + rect.height * 0.6, s * 0.65, "#ffffff", rect.width - s);

  ctx.globalAlpha = 1;
}
