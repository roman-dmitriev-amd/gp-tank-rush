// =====================================================================
//  Input - keyboard, touch and mouse
//
//  Keys, the joystick or D-pad, the fire button and the pointer events that
//  send taps to the screen that is showing.
// =====================================================================

// ---------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------

// --- Keyboard (for testing on a computer) ---
// Arrow keys are directions on screen (currentDirection turns them to
// the map's).
const heldKeys = [];  // arrow keys being held, last pressed is last
// Arrow keys let go of by a layout change while still held down: their
// key repeats are ignored until the key is released (releaseForNewLayout)
const cancelledKeys = new Set();
const KEY_TO_DIR = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// Keyboard players see which button Enter will press (an amber outline):
// on computers without a touch screen always, elsewhere once a key was
// pressed (until the next touch)
let keyboardUsed = false;

function showKeyboardFocus() {
  return keyboardUsed || !navigator.maxTouchPoints;
}

window.addEventListener("keydown", (event) => {
  if (isSystemPaused()) return;
  keyboardUsed = true;

  // The pause menu gets all keys while it's open (pause.js)
  if (pauseMenu.open) {
    pauseMenuKeyDown(event);
    return;
  }

  // Escape opens the pause menu (during a level)
  if (event.code === "Escape") {
    if (!event.repeat) openPauseMenu();
    return;
  }

  // The shop handles its own keys
  if (gameState === GAME_STATE.SHOP) {
    shopKeyDown(event);
    return;
  }

  // The title screen (title.js)
  if (gameState === GAME_STATE.TITLE) {
    titleScreenKeyDown(event);
    return;
  }

  // "CAMPAIGN COMPLETE" screen
  if (gameState === GAME_STATE.CAMPAIGN_COMPLETE) {
    campaignKeyDown(event);
    return;
  }

  // Game over screen
  if (gameState === GAME_STATE.LOST) {
    gameOverKeyDown(event);
    return;
  }

  // Not playing (intro or level summary): Space or Enter presses the
  // screen's button, if it has one. Nothing else works.
  if (!isPlaying()) {
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      if (!event.repeat) pressScreenButton();
    }
    return;
  }

  // DEBUG keys (only when DEBUG is true in config.js): P, O, I, L, N, B, H
  if (DEBUG && handleDebugKey(event)) return;

  // Space = fire (only on the first press, not when the key repeats)
  if (event.code === "Space") {
    event.preventDefault();
    fireKeyHeld = true;
    if (!event.repeat) playerFire();
    return;
  }

  const dir = KEY_TO_DIR[event.key];
  if (!dir) return;
  event.preventDefault(); // stop arrow keys from scrolling the page
  if (event.repeat && cancelledKeys.has(dir)) return;
  cancelledKeys.delete(dir);
  if (!heldKeys.includes(dir)) heldKeys.push(dir);
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") fireKeyHeld = false;
  const dir = KEY_TO_DIR[event.key];
  if (!dir) return;
  cancelledKeys.delete(dir);
  const index = heldKeys.indexOf(dir);
  if (index !== -1) heldKeys.splice(index, 1);
});

// --- Movement control ---
// It is drawn in the movement part of the control zone. Two types
// (settings.controlType, chosen in the settings):
//   "drag"   a drag can start anywhere on the screen, except the fire
//            button's part (and the pause button): steering is measured
//            from where the finger landed. The joystick is drawn in the
//            movement part: under the finger if it landed there,
//            otherwise as close to it as fits. Lift your finger and it
//            goes back to its faint resting place.
//   "cross"  fixed D-pad: hold a direction to drive; slide your finger
//            to another arrow to turn without lifting it.
// Both write the chosen direction into joystick.direction.
const joystick = {
  pointerId: null,   // which finger controls it (null = not in use)
  startX: 0,         // where that finger first touched (steering is measured from here)
  startY: 0,
  baseX: 0,          // center of the drawn joystick (in the movement part)
  baseY: 0,
  knobX: 0,          // where the drawn stick top is now
  knobY: 0,
  direction: null,   // "up" / "down" / "left" / "right" / null
};

// Joystick ring size: fits inside the movement control's square (so it
// never covers the HUD). Set with the layout.
function joystickRadius() {
  return controlZone.joystickRadius;
}

// May a touch here start steering? The D-pad only in the movement part;
// a drag anywhere (the fire part is checked before this)
function canStartMoveControl(x, y) {
  return settings.controlType === "drag" || isInsideRect(controlZone.move, x, y);
}

// A finger landed: start steering
function startMoveControl(x, y) {
  if (settings.controlType === "cross") {
    updateDpad(x, y);
    return;
  }
  // Drag: remember where the finger landed; draw the joystick there,
  // moved in if needed so the whole ring stays inside the movement part
  const part = controlZone.move;
  const radius = joystickRadius();
  joystick.startX = x;
  joystick.startY = y;
  joystick.baseX = clamp(x, part.x + radius, part.x + part.width - radius);
  joystick.baseY = clamp(y, part.y + radius, part.y + part.height - radius);
  updateJoystick(x, y);
}

// The steering finger moved
function moveMoveControl(x, y) {
  if (settings.controlType === "cross") updateDpad(x, y);
  else updateJoystick(x, y);
}

// --- D-pad ("cross" control type) ---
// The cross is square (all four buttons the same size), as big as fits
// in the movement control's square less the margin, and three buttons
// wide and tall ("thick" = one button), so the buttons meet around a
// square hub. Set with the layout (finishLayout).
function dpadLayout() {
  return controlZone.dpad;
}

// Where one D-pad button is drawn: from the hub out to the end of its arm
function dpadButtonRect(d, dir) {
  const t = d.thick;
  const armX = d.width / 2 - t / 2;  // length of the left and right arms
  const armY = d.height / 2 - t / 2; // length of the up and down arms
  if (dir === "up") return { x: d.x - t / 2, y: d.y - d.height / 2, width: t, height: armY };
  if (dir === "down") return { x: d.x - t / 2, y: d.y + t / 2, width: t, height: armY };
  if (dir === "left") return { x: d.x - d.width / 2, y: d.y - t / 2, width: armX, height: t };
  return { x: d.x + t / 2, y: d.y - t / 2, width: armX, height: t };
}

// The direction is whichever arrow the finger is nearest to: we only
// look at the angle from the center, so sliding between arrows just
// works, and every touch in the movement part counts (more than the
// drawn buttons, also between them). A small spot in the middle means
// "stop".
function updateDpad(x, y) {
  const d = dpadLayout();
  const dx = x - d.x;
  const dy = y - d.y;
  if (Math.hypot(dx, dy) < d.thick * CONTROLS.dpadDeadZone) {
    joystick.direction = null;
  } else if (Math.abs(dx) > Math.abs(dy)) {
    joystick.direction = dx > 0 ? "right" : "left";
  } else {
    joystick.direction = dy > 0 ? "down" : "up";
  }
}

// The finger is at (x, y): how far it moved from where it landed sets
// the direction, and the drawn stick top moves the same way
function updateJoystick(x, y) {
  const radius = joystickRadius();
  let dx = x - joystick.startX;
  let dy = y - joystick.startY;

  // Keep the knob inside the ring
  const distance = Math.hypot(dx, dy);
  if (distance > radius) {
    dx = (dx / distance) * radius;
    dy = (dy / distance) * radius;
  }
  joystick.knobX = joystick.baseX + dx;
  joystick.knobY = joystick.baseY + dy;

  // Small movements near the center do nothing (the "dead zone")
  if (distance < radius * CONTROLS.joystickDeadZone) {
    joystick.direction = null;
  } else if (Math.abs(dx) > Math.abs(dy)) {
    // Sideways is the bigger part of the drag
    joystick.direction = dx > 0 ? "right" : "left";
  } else {
    joystick.direction = dy > 0 ? "down" : "up";
  }
}

// --- Fire button (in the fire part of the control zone) ---
// Its place and size are set with the layout (resize). Touching
// anywhere in the fire part counts, so it's easy to hit with a thumb.
const fireButton = {
  x: 0,              // center
  y: 0,
  radius: 0,
  pointerId: null,   // which finger is pressing it
  pressed: false,
};

// Where the mouse, or the finger that touched last, is: for the buttons'
// hover and pressed looks (buttonPointerLook in ui.js). x and y in CSS
// pixels (-1 when there's none), "down" while it presses (a new screen
// or menu page starts with it up), "mouse" for a mouse.
const uiPointer = { id: null, x: -1, y: -1, down: false, mouse: false };

function forgetUiPointer() {
  uiPointer.down = false;
  uiPointer.x = -1;
  uiPointer.y = -1;
}

// Is a finger (or the mouse) dragging the shop or a menu to scroll it?
// Then no button looks pressed.
function isScrollDragging() {
  return Boolean((shop.pointer && shop.pointer.dragging) || (overlayScroll.pointer && overlayScroll.pointer.dragging));
}

// --- Pointer events (work for both touch and mouse) ---
// Nothing reacts while the app is hidden.
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (isSystemPaused()) return;
  const x = event.clientX;
  const y = event.clientY;
  if (event.pointerType === "touch") keyboardUsed = false;
  Object.assign(uiPointer, { id: event.pointerId, x, y, down: true, mouse: event.pointerType === "mouse" });

  // Pause menu open: only its buttons react (pause.js)
  if (pauseMenu.open) {
    overlayPointerDown(event, pauseMenuTap);
    return;
  }

  // The pause button (top-right, during a level)
  if (canOpenPauseMenu() && isInsidePauseButton(x, y)) {
    openPauseMenu();
    return;
  }

  // The shop handles its own taps and scrolling (shop.js)
  if (gameState === GAME_STATE.SHOP) {
    shopPointerDown(event.clientX, event.clientY, event.pointerId);
    try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* fine */ }
    return;
  }

  // The title screen (title.js)
  if (gameState === GAME_STATE.TITLE) {
    overlayPointerDown(event, titleScreenTap);
    return;
  }

  // "CAMPAIGN COMPLETE" screen
  if (gameState === GAME_STATE.CAMPAIGN_COMPLETE) {
    overlayPointerDown(event, campaignTap);
    return;
  }

  // Game over screen
  if (gameState === GAME_STATE.LOST) {
    overlayPointerDown(event, gameOverTap);
    return;
  }

  // Not playing (intro or level summary): only the screen's button reacts
  if (!isPlaying()) {
    overlayPointerDown(event, screenButtonTap);
    return;
  }

  // During play: the fire part fires; steering starts in the movement
  // part (with the drag control anywhere else too, see
  // canStartMoveControl); other touches do nothing
  if (isInsideRect(controlZone.fire, x, y) && fireButton.pointerId === null) {
    fireButton.pointerId = event.pointerId;
    fireButton.pressed = true;
    playerFire();
  } else if (canStartMoveControl(x, y) && joystick.pointerId === null) {
    joystick.pointerId = event.pointerId;
    startMoveControl(x, y);
  } else {
    return; // this touch is not for us
  }

  // Keep getting events for this finger even if it moves far away
  try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not supported, fine */ }
});

canvas.addEventListener("pointermove", (event) => {
  if (isSystemPaused()) return;
  if (event.pointerType === "mouse" || event.pointerId === uiPointer.id) {
    Object.assign(uiPointer, { x: event.clientX, y: event.clientY, mouse: event.pointerType === "mouse" });
  }
  if (gameState === GAME_STATE.SHOP) {
    shopPointerMove(event.clientX, event.clientY, event.pointerId);
    return;
  }
  const p = overlayScroll.pointer;
  if (p && event.pointerId === p.id) {
    const dy = event.clientY - p.startY;
    if (Math.abs(dy) > SHOP_DRAG_START) p.dragging = true;  // same distance as the shop
    if (p.dragging) overlayScroll.y = clamp(p.startScroll - dy, 0, overlayScroll.max);
    return;
  }
  if (event.pointerId === joystick.pointerId) {
    event.preventDefault();
    moveMoveControl(event.clientX, event.clientY);
  }
});

// Mouse wheel scrolls the shop's card list, or a menu that doesn't fit
// (handy on a computer)
canvas.addEventListener("wheel", (event) => {
  if (isSystemPaused()) return;
  if (gameState === GAME_STATE.SHOP) {
    event.preventDefault();
    shopWheel(event.deltaY);
  } else if (overlayScroll.max > 0) {
    event.preventDefault();
    overlayScroll.y = clamp(overlayScroll.y + event.deltaY, 0, overlayScroll.max);
  }
}, { passive: false });

// A finger or click on a menu or end screen: "tap(x, y)" handles its
// buttons. A screen that scrolls (landscape) waits until the finger
// lifts, since it may drag to scroll instead; one that fits reacts
// right away, as always.
function overlayPointerDown(event, tap) {
  if (overlayScroll.max <= 0) {
    tap(event.clientX, event.clientY);
    return;
  }
  overlayScroll.pointer = { id: event.pointerId, startY: event.clientY, startScroll: overlayScroll.y, dragging: false, tap };
  try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* not supported, fine */ }
}

// The level summary's CONTINUE button (intros have no button)
// (a tap anywhere first shows a summary that is still counting)
function screenButtonTap(x, y) {
  if (skipSummaryShow()) return;
  if (isInsideScreenButton(x, y)) pressScreenButton();
}

// Scroll a menu (if it scrolls) so the button "b" chosen with the
// keyboard is in view
function scrollOverlayTo(b) {
  if (overlayScroll.max <= 0) return;
  const o = controlZone.overlay;
  if (b.y < o.top) overlayScroll.y -= o.top - b.y;
  if (b.y + b.height > o.bottom) overlayScroll.y += b.y + b.height - o.bottom;
  overlayScroll.y = clamp(overlayScroll.y, 0, overlayScroll.max);
}

function releasePointer(event) {
  // (A pause let go of every finger already, setSystemPause)
  if (isSystemPaused()) return;
  if (event.pointerId === uiPointer.id) {
    uiPointer.down = false;
    if (!uiPointer.mouse) forgetUiPointer(); // a lifted finger hovers nowhere
  }
  // Lifting the finger in the shop can be a tap (pointercancel can't)
  if (gameState === GAME_STATE.SHOP) {
    if (event.type === "pointerup") shopPointerUp(event.clientX, event.clientY, event.pointerId);
    else shop.pointer = null;
  }
  // The same for a menu that scrolls
  const p = overlayScroll.pointer;
  if (p && event.pointerId === p.id) {
    overlayScroll.pointer = null;
    if (event.type === "pointerup" && !p.dragging) p.tap(event.clientX, event.clientY);
  }
  if (event.pointerId === joystick.pointerId) {
    joystick.pointerId = null;
    joystick.direction = null;
  }
  if (event.pointerId === fireButton.pointerId) {
    fireButton.pointerId = null;
    fireButton.pressed = false;
  }
}
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
// The mouse left the window: no button is hovered
canvas.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") forgetUiPointer();
});

// Is FIRE held down right now (the button or the Space key)? For the
// HOLD TO FIRE setting (tanks.js).
let fireKeyHeld = false;

function fireHeld() {
  return fireButton.pressed || fireKeyHeld;
}

function releaseAllInput() {
  fireKeyHeld = false;
  heldKeys.length = 0;
  joystick.pointerId = null;
  joystick.direction = null;
  fireButton.pointerId = null;
  fireButton.pressed = false;
}

// The direction on the map the player wants right now (or null). Keys,
// joystick and cross all give a direction on screen; in landscape the
// playfield is turned, so it's turned back here (directionOnMap).
function currentDirection() {
  // The most recently pressed key wins, otherwise use the joystick
  const onScreen = heldKeys.length > 0 ? heldKeys[heldKeys.length - 1] : joystick.direction;
  return directionOnMap(onScreen);
}

// --- Stop the page from scrolling, zooming or showing menus ---
// (CSS "touch-action: none" does most of this, these are extra safety
// for older phones, especially iPhones.)
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchstart", (e) => {
  if (e.touches.length > 1) e.preventDefault(); // no pinch-zoom
}, { passive: false });
document.addEventListener("gesturestart", (e) => e.preventDefault()); // iOS pinch
document.addEventListener("dblclick", (e) => e.preventDefault());     // double-tap zoom
document.addEventListener("contextmenu", (e) => e.preventDefault());  // long-press menu
