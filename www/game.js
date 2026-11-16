// =====================================================================
//  Tank game - full-screen playfield, player tank, enemy tanks with
//  simple AI, shooting, breakable bricks, lives, levels, floating
//  joystick, fire button, keyboard controls and the main loop
//  hooks (loading, ready, pause/resume).
//
//  The level layouts live in levels.js (loaded before this file).
// =====================================================================

// ---------------------------------------------------------------------
// The numbers that tune the game (player and enemy speeds, lives,
// bullets, timers, the playfield size, the control zone...) are all in
// config.js. Here only the fixed places on the map.
// ---------------------------------------------------------------------

// The base and the player start are the same on every level: the base
// in the middle of the bottom row, the player two tiles to its left.
// (The list of enemies is set per level in levels.js.)
const BASE_TILE = { x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 1 };
const PLAYER_START = { x: BASE_TILE.x - 2, y: GRID_ROWS - 1 };

// Enemies appear at these tiles at the top (left, center, right)
const SPAWN_POINTS = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 12, y: 0 },
];

// (Wall materials - brick, concrete, metal - and their health are in
// materials.js. Each enemy type's speed, health, bullets, fire rate and
// points are in enemies.js.)

// Each direction as a step on the grid (x to the right, y downward)
const DIRECTIONS = {
  up:    { x: 0,  y: -1 },
  down:  { x: 0,  y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1,  y: 0 },
};

// ---------------------------------------------------------------------
// Screen and playfield size
// The canvas covers the whole screen. The layout depends only on the
// size of the window the game has (window.innerWidth x innerHeight),
// worked out again on every resize:
//   - portrait (narrower than tall): the control zone is a strip along
//     the bottom (CONTROL_ZONE in config.js), split into: movement |
//     HUD | fire; the playfield fills the space above it, scaled as big
//     as possible, keeping its shape, and centered.
//   - landscape (at least as wide as tall, LANDSCAPE in config.js): the
//     playfield uses the full height and is centered. The HUD and the
//     movement control stack in the side area on one side, the fire
//     button sits on the other. If the side areas are too narrow, the
//     controls are drawn see-through over the playfield's bottom
//     corners ("overlay") and the HUD is a slim strip above it.
// Everything is placed once per resize by computeLayout(); drawing only
// reads the result (field and controlZone).
// ---------------------------------------------------------------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const safeAreaElement = document.getElementById("safe-area");

const view = {
  width: 0,     // screen size in CSS pixels
  height: 0,
  safe: { top: 0, right: 0, bottom: 0, left: 0 }, // notch etc.
};

const field = {
  x: 0,            // where the playfield's top-left corner is on screen
  y: 0,
  tileSize: 0,     // size of one tile in CSS pixels
  cols: GRID_COLS, // tiles across and down on screen: GRID_COLS x GRID_ROWS,
  rows: GRID_ROWS, //   or the other way round when turned
  turned: false,   // landscape: the map is shown turned a quarter clockwise (mapToScreen)
};

// ---------------------------------------------------------------------
// Map and screen. The game's logic always works on the map as it is in
// levels.js: GRID_COLS wide, GRID_ROWS tall, x to the right, y down, the
// base at the bottom. In landscape the playfield is shown turned a
// quarter clockwise: the map's bottom (the base) on the left of the
// screen, its top (the enemy spawns) on the right, its left side at the
// top. Only places and directions turn: tiles, tanks and effects are
// still drawn upright (a tank facing up on the map is drawn facing
// right), so the light stays top-left and text is never turned.
// ---------------------------------------------------------------------

// Where a point on the map (x, y in tiles) is on screen, in pixels. All
// drawing on the playfield goes through this. "f" is the playfield
// (field, or another layout's in the self-test).
function mapToScreen(x, y, f = field) {
  const s = f.tileSize;
  if (!f.turned) return { x: f.x + x * s, y: f.y + y * s };
  return { x: f.x + (GRID_ROWS - y) * s, y: f.y + x * s };
}

// The top-left corner on screen of the one-tile square whose top-left
// is (x, y) on the map (a tile, a tank): the nearer of its two turned
// corners
function tileToScreen(x, y, f = field) {
  const a = mapToScreen(x, y, f);
  const b = mapToScreen(x + 1, y + 1, f);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
}

// Which tile of the grid on screen (column from the left, row from the
// top) shows the map tile (col, row)
function screenCell(col, row) {
  const cell = tileToScreen(col, row, { x: 0, y: 0, tileSize: 1, turned: field.turned });
  return { col: cell.x, row: cell.y };
}

// The playfield's rectangle on screen
function fieldRect(f = field) {
  return { x: f.x, y: f.y, width: f.tileSize * f.cols, height: f.tileSize * f.rows };
}

// The four directions, clockwise
const TURN_ORDER = ["up", "right", "down", "left"];

// A direction on the map as it looks on screen (map up is screen right
// when turned): for drawing tanks and the sides of tiles
function directionOnScreen(dir, turned = field.turned) {
  if (!turned || !dir) return dir;
  return TURN_ORDER[(TURN_ORDER.indexOf(dir) + 1) % 4];
}

// The other way round, for input: a direction on screen (joystick,
// cross, arrow keys) as the direction on the map it means (screen right
// is map up when turned)
function directionOnMap(dir, turned = field.turned) {
  if (!turned || !dir) return dir;
  return TURN_ORDER[(TURN_ORDER.indexOf(dir) + 3) % 4];
}

// The current layout (computeLayout): touch areas and drawn places as
// rectangles { x, y, width, height } in CSS pixels.
const controlZone = {
  mode: "portrait", // "portrait", "landscape" (controls beside the playfield) or "overlay" (over it)
  zone: null,       // portrait: the whole strip along the bottom (null in landscape)
  move: null,       // where a touch steers (the movement part; right when left-handed)
  fire: null,       // where a touch fires (the fire part; left when left-handed)
  moveBox: null,    // the square the joystick or cross is drawn in
  fireBox: null,    // the square the fire button is drawn in
  margin: 0,        // space kept free inside those squares (portrait: CONTROL_ZONE.margin)
  controlAlpha: 1,  // how visible the controls are (see-through in "overlay")
  hud: null,        // the HUD's part: the zone's middle, the top of the side area, or the strip
  hudLayout: null,  // the HUD display, its dark screen, the badge row (and the side HUD's font)
  dpad: null,       // the cross: center, size and button thickness (dpadLayout)
  joystickRadius: 0,
  pause: null,      // the pause button { x, y, size } (pause.js)
  overlay: null,    // where menus and end screens go (overlayFrame)
  shop: null,       // landscape: the shop's card grid (shopGridPlace in shop.js)
};

// The joystick ring's radius, as a share of its square
const JOYSTICK_SIZE = 0.42;

// The smallest menu button, in tiles: the pause menu's (pause.js). In
// landscape the menus are scaled so this is at least LANDSCAPE.minTouch.
const SMALLEST_MENU_BUTTON = 1.4;

// A button's height: never under LANDSCAPE.minTouch (48 px), so even on
// narrow phones in portrait (1.4 tiles are 37.8 px at 360 px wide) every
// button is a comfortable touch target
function buttonHeight(height) {
  return Math.max(height, LANDSCAPE.minTouch);
}

function isInsideRect(rect, x, y) {
  return rect !== null &&
    x >= rect.x && x <= rect.x + rect.width &&
    y >= rect.y && y <= rect.y + rect.height;
}

// Read the phone's safe-area sizes from the hidden helper element
function readSafeArea() {
  const style = getComputedStyle(safeAreaElement);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

// The window changed size (or a control setting changed): size the
// canvas and place everything again. The game itself goes on: nothing
// is reset, only touches and held keys are let go (their controls may
// have moved, and a direction on screen may now mean another one on the
// map).
// The window changed size while the app was hidden: nothing is drawn
// then (setting the canvas size would also clear it), so the resize is
// done when it shows again (setSystemPause in pause.js)
let resizeWaiting = false;

function resize() {
  if (isSystemPaused()) {
    resizeWaiting = true;
    return;
  }
  resizeWaiting = false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const sizeChanged = width !== view.width || height !== view.height;
  view.width = width;
  view.height = height;
  view.safe = readSafeArea();

  // On high-resolution phone screens, draw with more real pixels so
  // it does not look blurry.
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // draw in CSS pixels

  const layout = computeLayout(width, height, view.safe, ratio, settings.leftHanded);
  field.x = layout.field.x;
  field.y = layout.field.y;
  field.tileSize = layout.field.tileSize;
  field.cols = layout.field.cols;
  field.rows = layout.field.rows;
  field.turned = layout.field.turned;
  for (const key of Object.keys(controlZone)) controlZone[key] = layout[key];
  fireButton.x = layout.fireButton.x;
  fireButton.y = layout.fireButton.y;
  fireButton.radius = layout.fireButton.radius;

  if (sizeChanged) releaseForNewLayout();
  draw();
}

// Let go of every finger (the joystick, the fire button, scrolling) and
// every held arrow key. A key still held down is then ignored until it
// is let go and pressed again (its repeats don't steer).
function releaseForNewLayout() {
  for (const dir of heldKeys) cancelledKeys.add(dir);
  releaseAllInput();
  shop.pointer = null;
  overlayScroll.pointer = null;
  forgetUiPointer();
}

// The whole layout for a window "width" x "height" with safe areas
// "safe" and "ratio" device pixels per CSS pixel. Nothing else is read
// or changed, so the DEBUG self-test can try other sizes too.
function computeLayout(width, height, safe, ratio, leftHanded) {
  if (width < height) return portraitLayout(width, height, safe, ratio, leftHanded);
  return sideLayout(width, height, safe, ratio, leftHanded) ||
         overlayLayout(width, height, safe, ratio, leftHanded);
}

// The biggest tile size at which the playfield fits in "area" (but at
// most "maxTile"), and the playfield centered in it, turned (21 x 13
// tiles on screen) or not (13 x 21). On whole device pixels, so tile
// edges stay crisp and the cached pictures are copied without blurring.
// At least 1 pixel, in case the window has no size yet (hidden tab).
function fitField(area, ratio, turned, maxTile = Infinity) {
  const cols = turned ? GRID_ROWS : GRID_COLS;
  const rows = turned ? GRID_COLS : GRID_ROWS;
  const fitSize = Math.min(area.width / cols, area.height / rows);
  const tileSize = Math.min(maxTile, Math.max(1, Math.floor(fitSize * ratio)) / ratio);
  return {
    x: Math.round((area.x + (area.width - tileSize * cols) / 2) * ratio) / ratio,
    y: Math.round((area.y + (area.height - tileSize * rows) / 2) * ratio) / ratio,
    tileSize, cols, rows, turned,
  };
}

// The biggest square in the middle of a rectangle
function squareIn(rect) {
  const side = Math.min(rect.width, rect.height);
  return { x: rect.x + (rect.width - side) / 2, y: rect.y + (rect.height - side) / 2, width: side, height: side };
}

// A rectangle made bigger by "amount" on every side
function growRect(rect, amount) {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

// How far the metal frame around the playfield reaches out from it
// (paintFieldFrame in themes.js)
function fieldFrameWidth(tileSize) {
  return Math.max(2, tileSize * 0.08) + 2;
}

// The smallest square the movement control may get in landscape: the
// joystick ring in it (the smaller of joystick and cross) is then
// LANDSCAPE.minControl
function minControlBox() {
  return LANDSCAPE.minControl / (JOYSTICK_SIZE * 2);
}

// Portrait: the control zone along the bottom (above the phone's home
// bar), split into its three parts, and the playfield above it
function portraitLayout(width, height, safe, ratio, leftHanded) {
  const zoneHeight = height * CONTROL_ZONE.heightFraction;
  const zoneTop = height - safe.bottom - zoneHeight;
  const left = safe.left;
  const zoneWidth = width - safe.left - safe.right;
  const fieldPlace = fitField({ x: left, y: safe.top, width: zoneWidth, height: Math.max(0, zoneTop - safe.top) }, ratio, false);

  // Movement and fire parts are the same width; the HUD gets the rest.
  // The controls are the biggest squares in their parts, less the margin.
  const sideWidth = Math.min(zoneHeight * CONTROL_ZONE.sideWidth, zoneWidth * CONTROL_ZONE.maxSideFraction);
  const leftPart = { x: left, y: zoneTop, width: sideWidth, height: zoneHeight };
  const rightPart = { x: left + zoneWidth - sideWidth, y: zoneTop, width: sideWidth, height: zoneHeight };
  const move = leftHanded ? rightPart : leftPart;
  const fire = leftHanded ? leftPart : rightPart;
  const hud = { x: left + sideWidth, y: zoneTop, width: zoneWidth - sideWidth * 2, height: zoneHeight };
  const margin = zoneHeight * CONTROL_ZONE.margin;
  return finishLayout({
    mode: "portrait", width, height, safe, field: fieldPlace,
    zone: { x: left, y: zoneTop, width: zoneWidth, height: zoneHeight },
    move, fire, moveBox: squareIn(move), fireBox: squareIn(fire), margin, controlAlpha: 1,
    hud, hudLayout: portraitHudLayout(hud, margin),
  });
}

// Landscape with the HUD and the controls beside the playfield (turned,
// 21 x 13 tiles on screen). The playfield is as tall as the screen
// allows; if the controls and the HUD don't fit beside it, it gets one
// device pixel per tile smaller at a time, down to minFieldShare of that
// size. Returns null if they still don't fit (then: overlay controls).
function sideLayout(width, height, safe, ratio, leftHanded) {
  const sp = LANDSCAPE.spacing;
  const area = { x: safe.left, y: safe.top + sp, width: width - safe.left - safe.right, height: height - safe.top - safe.bottom - sp * 2 };
  const fullPixels = Math.round(fitField(area, ratio, true).tileSize * ratio);
  for (let pixels = fullPixels; pixels >= fullPixels * LANDSCAPE.minFieldShare; pixels--) {
    const layout = sideLayoutAt(width, height, safe, ratio, leftHanded, pixels / ratio);
    if (layout) return layout;
  }
  return null;
}

// The side layout with the playfield's tiles at most "maxTile" big: the
// movement control and the fire button in the bottom corners of the two
// side areas, the HUD (and the badge row) at the top of the movement
// side. Both stack in one column, centered in the side area but at most
// maxFieldGap control widths from the playfield. Returns null if they
// don't fit (the joystick would be smaller than minControl, or the HUD
// text smaller than hudFontMin).
function sideLayoutAt(width, height, safe, ratio, leftHanded, maxTile) {
  const L = LANDSCAPE;
  const sp = L.spacing;
  const top = safe.top + sp;
  const bottom = height - safe.bottom - sp;
  const fieldPlace = fitField({ x: safe.left, y: top, width: width - safe.left - safe.right, height: bottom - top }, ratio, true, maxTile);
  const s = fieldPlace.tileSize;
  const fieldLeft = fieldPlace.x - fieldFrameWidth(s);
  const fieldRight = fieldPlace.x + s * fieldPlace.cols + fieldFrameWidth(s);

  // The side areas reach from the screen's edge to the playfield's
  // frame; both use the narrower one's width, so they mirror
  const side = Math.min(fieldLeft - safe.left, width - safe.right - fieldRight);
  const control = Math.min(side - sp * 2, (height - safe.top - safe.bottom) * L.controlShare, L.controlMax);
  if (control < minControlBox()) return null;
  const controlTop = height - safe.bottom - Math.max(sp, height * L.bottomMargin) - control;
  const hudSize = sideHudSize(Math.min(side - sp * 2, L.hudMaxWidth), control, controlTop - sp - top);
  if (!hudSize) return null;

  const column = Math.max(control, hudSize.width);
  const gap = Math.max(sp, Math.min((side - column) / 2, control * L.maxFieldGap));
  const leftX = fieldLeft - gap - column / 2;   // middle of the left column
  const rightX = fieldRight + gap + column / 2; // and of the right one
  const moveX = leftHanded ? rightX : leftX;
  const fireX = leftHanded ? leftX : rightX;
  const box = (x) => ({ x: x - control / 2, y: controlTop, width: control, height: control });
  const hudLayout = placeSideHud(hudSize, moveX, top);

  // Touch areas: the side areas from halfway between the HUD and the
  // controls down to the bottom of the screen
  const hudBottom = hudLayout.badgeRow.y + hudLayout.badgeRow.height;
  const partTop = (hudBottom + controlTop) / 2;
  const leftPart = { x: 0, y: partTop, width: fieldLeft, height: height - partTop };
  const rightPart = { x: fieldRight, y: partTop, width: width - fieldRight, height: height - partTop };
  return finishLayout({
    mode: "landscape", width, height, safe, field: fieldPlace, zone: null,
    move: leftHanded ? rightPart : leftPart, fire: leftHanded ? leftPart : rightPart,
    moveBox: box(moveX), fireBox: box(fireX), margin: 0, controlAlpha: 1,
    hud: { x: moveX - column / 2, y: top, width: column, height: hudBottom - top }, hudLayout,
  });
}

// Landscape when the side areas are too narrow even with the playfield
// a little smaller (16:9 phones, nearly square windows): a slim HUD
// strip along the top, the playfield
// (turned) under it, and the controls drawn see-through over its bottom
// corners
function overlayLayout(width, height, safe, ratio, leftHanded) {
  const L = LANDSCAPE;
  const sp = L.spacing;
  const stripHeight = clamp((height - safe.top - safe.bottom) * L.stripShare, L.stripMin, L.stripMax);
  const strip = { x: safe.left + sp, y: safe.top + sp, width: width - safe.left - safe.right - sp * 2, height: stripHeight };
  const top = strip.y + stripHeight + sp;
  const fieldPlace = fitField({ x: strip.x, y: top, width: strip.width, height: height - safe.bottom - sp - top }, ratio, true);
  const s = fieldPlace.tileSize;
  const fieldWidth = s * fieldPlace.cols;
  const fieldHeight = s * fieldPlace.rows;

  // A share of the playfield's shorter side, at least the smallest
  // allowed, but the two must fit side by side
  const control = Math.min(Math.max(Math.min(fieldWidth, fieldHeight) * L.overlayControlShare, minControlBox()),
                           (fieldWidth - sp * 3) / 2, L.controlMax);
  const boxY = fieldPlace.y + fieldHeight - sp - control;
  const leftBox = { x: fieldPlace.x + sp, y: boxY, width: control, height: control };
  const rightBox = { x: fieldPlace.x + fieldWidth - sp - control, y: boxY, width: control, height: control };
  const moveBox = leftHanded ? rightBox : leftBox;
  const fireBox = leftHanded ? leftBox : rightBox;
  return finishLayout({
    mode: "overlay", width, height, safe, field: fieldPlace, zone: null,
    move: growRect(moveBox, sp / 2), fire: growRect(fireBox, sp / 2),
    moveBox, fireBox, margin: 0, controlAlpha: L.overlayAlpha,
    hud: strip, hudLayout: stripHudLayout(strip),
  });
}

// What every layout gets from its control squares and playfield: the
// cross, the joystick's and fire button's size, the pause button, where
// menus go and (landscape) the shop's card grid
function finishLayout(layout) {
  const move = rectCenter(layout.moveBox);
  const dpadSize = Math.max(3, layout.moveBox.width - layout.margin * 2);
  layout.dpad = { x: move.x, y: move.y, width: dpadSize, height: dpadSize, thick: dpadSize / 3 };
  layout.joystickRadius = layout.moveBox.width * JOYSTICK_SIZE;
  const fire = rectCenter(layout.fireBox);
  layout.fireButton = { x: fire.x, y: fire.y, radius: Math.max(1, layout.fireBox.width / 2 - layout.margin) };
  layout.pause = placePauseButton(layout); // pause.js
  layout.overlay = overlayPlace(layout);
  layout.shop = layout.mode === "portrait" ? null : shopGridPlace(layout); // shop.js
  return layout;
}

// Where menus and end screens go (see overlayFrame). Portrait: over the
// playfield, in tiles. Landscape: centered on the screen, in a unit big
// enough for LANDSCAPE.minTouch buttons (but no wider than the screen).
function overlayPlace(layout) {
  const f = layout.field;
  const s = f.tileSize;
  if (layout.mode === "portrait") {
    return { unit: s, cx: f.x + (s * f.cols) / 2, cy: f.y + (s * f.rows) / 2 };
  }
  const sp = LANDSCAPE.spacing;
  const left = layout.safe.left + sp;
  const right = layout.width - layout.safe.right - sp;
  const unit = Math.min(Math.max(uprightTileSize(layout), LANDSCAPE.minTouch / SMALLEST_MENU_BUTTON),
                        (right - left) / GRID_COLS);
  return { unit, cx: (left + right) / 2, left, right, top: layout.safe.top + sp, bottom: layout.height - layout.safe.bottom - sp };
}

// The tile size menus and the shop are scaled from in landscape: a tile
// of the playfield as if it stood upright (GRID_ROWS tiles down the
// screen), so they keep their size although the turned playfield's
// tiles are bigger
function uprightTileSize(layout) {
  const room = layout.height - layout.safe.top - layout.safe.bottom - LANDSCAPE.spacing * 2;
  return Math.min(layout.field.tileSize, room / GRID_ROWS);
}

// Space kept free around the D-pad, the fire button and the HUD inside
// their parts of the control zone
function controlMargin() {
  return controlZone.margin;
}

// Middle of a rectangle (used for the D-pad and the joystick hint)
function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// Every size change (also rotating a phone, or the browser bar coming
// and going) resizes. The observer catches sizes that settle a moment
// after the resize event.
window.addEventListener("resize", resize);
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => resize()).observe(canvas);

// ---------------------------------------------------------------------
// Overlay screens (level summary, game over, campaign complete, the
// continue screen and the pause menu) are laid out around a middle
// point in units of "s", as if over the playfield. Portrait: they sit
// over the playfield with s = the tile size. Landscape: they are
// centered on the screen with s = controlZone.overlay.unit; one that is
// then taller than the screen scrolls (a drag or the mouse wheel).
// ---------------------------------------------------------------------
const overlayScroll = {
  y: 0,          // pixels scrolled
  max: 0,        // how far the screen showing can scroll (0 = it fits)
  pointer: null, // the finger dragging: { id, startY, startScroll, dragging }
};

// The place of an overlay screen whose content reaches "top" tiles above
// its middle line and "bottom" tiles below it: { s, cx, cy }
function overlayFrame(top, bottom) {
  const o = controlZone.overlay;
  if (controlZone.mode === "portrait") {
    overlayScroll.max = 0;
    return { s: o.unit, cx: o.cx, cy: o.cy };
  }
  const s = o.unit;
  const content = (bottom - top) * s;
  const room = o.bottom - o.top;
  overlayScroll.max = Math.max(0, content - room);
  overlayScroll.y = clamp(overlayScroll.y, 0, overlayScroll.max);
  const contentTop = overlayScroll.max > 0 ? o.top - overlayScroll.y : o.top + (room - content) / 2;
  return { s, cx: o.cx, cy: contentTop - top * s };
}

// A new screen starts unscrolled (its first frame sets "max" again), and
// a finger still down from the last one doesn't press its buttons
function resetOverlayScroll() {
  overlayScroll.y = 0;
  overlayScroll.max = 0;
  overlayScroll.pointer = null;
  uiPointer.down = false;
}

// The unit the menus are drawn in (frames on panels scale with it)
function uiUnit() {
  return controlZone.overlay ? controlZone.overlay.unit : field.tileSize;
}

// ---------------------------------------------------------------------
// Two-column panels in landscape: the pause menu's main page (pause.js),
// the level summary and the game over screen. A framed panel,
// LANDSCAPE.panelWidth units wide (at most panelShare of the screen's
// width, else one column, see isTwoColumnLayout), centered, with its
// title plate on top and two columns under it. If it is taller than panelShare
// of the screen's height, text and spacing get smaller together, down to
// panelMinScale of their size (text never under minText, buttons never
// under minTouch). Only if it still doesn't fit does it scroll like the
// other screens. Worked out from the screen size whenever it's drawn or
// tapped, so a resize or a turn of the phone just moves it.
// ---------------------------------------------------------------------
// Only where the panel gets its full width: in a nearly square window
// (600x600, 520x500) two columns would be too narrow for the text at
// minText, so those keep the one-column screens (they fit the taller
// window)
function isTwoColumnLayout() {
  if (controlZone.mode === "portrait") return false;
  const o = controlZone.overlay;
  return o.unit * LANDSCAPE.panelWidth <= Math.min(view.width * LANDSCAPE.panelShare, o.right - o.left);
}

// Sizes at scale k (1 = normal): lengths in menu units times k, text and
// touch targets never under the minimums
function panelSizes(k) {
  const u = controlZone.overlay.unit * k;
  return {
    len: (units) => units * u,
    text: (units) => Math.max(LANDSCAPE.minText, units * u),
    touch: (units) => Math.max(LANDSCAPE.minTouch, units * u),
  };
}

// The panel and its two columns, for a screen's "build(z, panel)": it
// places its content with the sizes "z" in "panel" (x, width, the
// content's top "top", its columns "left" and "right" as { x, width })
// and returns the content's height. The left column gets "split" of the
// columns' width; "width" (pixels) replaces the usual panel width.
// Returns the build's layout with panel.y and panel.height set.
function fitTwoColumnPanel(build, { split = 0.5, width = controlZone.overlay.unit * LANDSCAPE.panelWidth } = {}) {
  const o = controlZone.overlay;
  const share = LANDSCAPE.panelShare;
  const fits = Math.min(view.height * share, o.bottom - o.top);
  const place = (k, top) => {
    const z = panelSizes(k);
    const titleSize = z.text(0.8);
    const plate = titleSize * 1.8;              // the title plate's height (drawTitlePlate)
    const pad = o.unit * 0.35 + z.len(0.4);      // the frame (drawFramedPanel) and space inside it
    const gap = z.len(0.6);                      // between the columns
    const columns = width - pad * 2 - gap;
    const panel = { x: o.cx - width / 2, y: top + plate / 2, width, titleSize };
    panel.top = panel.y + plate / 2 + z.len(0.3);
    panel.left = { x: panel.x + pad, width: columns * split };
    panel.right = { x: panel.x + pad + columns * split + gap, width: columns * (1 - split) };
    const layout = build(z, panel);
    panel.height = panel.top - panel.y + layout.height + pad;
    layout.panel = panel;
    layout.total = plate / 2 + panel.height;    // from the top of the title plate
    return layout;
  };

  // The biggest scale that fits, in steps of 1%
  let k = 1;
  while (k > LANDSCAPE.panelMinScale + 0.001 && place(k, 0).total > fits) k -= 0.01;
  k = Math.max(k, LANDSCAPE.panelMinScale);
  const total = place(k, 0).total;

  // Centered; scrolls only if it's taller than the screen at the smallest scale
  const room = o.bottom - o.top;
  overlayScroll.max = Math.max(0, total - room);
  overlayScroll.y = clamp(overlayScroll.y, 0, overlayScroll.max);
  const top = overlayScroll.max > 0 ? o.top - overlayScroll.y : o.top + (room - total) / 2;
  const layout = place(k, top);
  layout.scale = k;
  return layout;
}

// The font size (at most "size", at least LANDSCAPE.minText) at which
// every row [label, value, coin] fits on one line "width" wide (label,
// a gap, a coin if set, the value)
function panelRowFont(rows, width, size) {
  let fit = size;
  for (const [label, value, coin] of rows) {
    ctx.font = "bold " + Math.round(size) + "px sans-serif";
    const needed = ctx.measureText(label).width + ctx.measureText(value).width + size * (coin ? 2.2 : 0.8);
    if (needed > width) fit = Math.min(fit, size * width / needed);
  }
  return Math.max(LANDSCAPE.minText, fit);
}

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
  const endless = ENDLESS_ENABLED && index >= LEVELS.length;
  if (!GENERATED_MODE && !endless) return LEVELS[index];
  if (!generatedLevels[index]) {
    generatedLevels[index] = GENERATED_MODE ? generatedRunLevel(index) : endlessLevel(index);
  }
  return generatedLevels[index];
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

// The material at this tile (OUTSIDE if it's off the playfield)
function materialAt(col, row) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return OUTSIDE;
  return MATERIALS[map[row][col].material];
}

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
  // While a continue is offered the run stays saved from the lost
  // level's checkpoint (save.js), otherwise it's over
  progress.run = canOfferContinue() ? checkpointRun() : null;
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
  spawnTimer = 0;
  nextSpawnPoint = 0;
  logEnemySpeeds();

  bullets = [];
  explosions.length = 0;
  scorchMarks.length = 0;

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

  // Continue screen at start-up (save.js)
  if (gameState === GAME_STATE.CONTINUE_PROMPT) {
    continuePromptKeyDown(event);
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
  const dir = KEY_TO_DIR[event.key];
  if (!dir) return;
  cancelledKeys.delete(dir);
  const index = heldKeys.indexOf(dir);
  if (index !== -1) heldKeys.splice(index, 1);
});

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
  if (Math.hypot(dx, dy) < d.thick * 0.3) {
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
  if (distance < radius * 0.25) {
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

  // Continue screen at start-up (save.js)
  if (gameState === GAME_STATE.CONTINUE_PROMPT) {
    overlayPointerDown(event, continuePromptTap);
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
function screenButtonTap(x, y) {
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

// --- Screen button ("Continue" on the level summary) ---
// Its size and place are set in layoutScreenButton().
const screenButton = { x: 0, y: 0, width: 0, height: 0 };

// Can the button be used yet? (Short wait after the screen appears.)
function screenButtonReady() {
  return gameState === GAME_STATE.LEVEL_SUMMARY && stateTimer >= BUTTON_DELAY;
}

function isInsideScreenButton(x, y) {
  layoutScreenButton(); // make sure it matches the current screen size
  const b = screenButton;
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

// Shop before the next level; after level 20: "CAMPAIGN COMPLETE"
function pressScreenButton() {
  if (!screenButtonReady()) return;
  Sound.play("uiTap");
  if (reachedCampaignEnd()) showCampaignComplete();
  else openShop();
}

// --- Game over screen: "Continue" and "Start over" ---
// "Continue" asks ads.js for a rewarded ad (showRewardedAd; for now a
// stub that gives the reward at once, with no ad). If the player earns
// the reward, the lost level starts again from its checkpoint (save.js).
// The button shows from level 2 on (level 1's checkpoint is the same as
// "Start over") and while the run has continues left
// (REWARDED_CONTINUES_PER_RUN, null = no limit). Texts: UI_TEXT.gameOver.
const gameOverScreen = {
  selected: 0,         // button chosen with the keyboard
  waitingForAd: false, // the ad was asked for, no answer yet (game paused, buttons off, muted)
  adWaitTime: 0,       // seconds waited, not counting system pauses (AD_WAIT_LIMIT)
  adRequest: 0,        // counts the requests, so a late answer is ignored
  adAnswer: null,      // the ad's answer, taken by the game loop: { request, failure }
  message: "",         // UI_TEXT.gameOver.adNotAvailable / noReward
  messageTime: 0,      // seconds the message still shows
};

function showGameOver() {
  gameOverScreen.selected = 0;
  gameOverScreen.messageTime = 0;
  setState(GAME_STATE.LOST);
}

// Is there a limit on the continues per run? REWARDED_CONTINUES_PER_RUN
// null (or Infinity) means no limit; continuesUsed is counted anyway.
function hasContinueLimit() {
  return Number.isFinite(REWARDED_CONTINUES_PER_RUN);
}

// Continues left in this run (Infinity without a limit)
function continuesLeft() {
  if (!hasContinueLimit()) return Infinity;
  return Math.max(0, REWARDED_CONTINUES_PER_RUN - continuesUsed);
}

// Can the lost run go on from its checkpoint? (Also decides whether the
// run stays saved on game over, see loseGame.)
function canOfferContinue() {
  const checkpoint = progress.checkpoint;
  return checkpoint !== null && checkpoint.level > 1 && continuesLeft() > 0;
}

// Where the game over screen goes (overlayFrame): it reaches from the
// top of the broken star plate to the bottom of the last button
function gameOverFrame() {
  return overlayFrame(-6.3, canOfferContinue() ? 7.5 : 4.9);
}

// The buttons, the same size, stacked under the panel (landscape: in
// its right column, gameOverColumns), with room between them for the
// ad line
function gameOverButtons() {
  if (isTwoColumnLayout()) return gameOverColumns().buttons;
  const { s, cx, cy } = gameOverFrame();
  const width = s * 9;
  const height = buttonHeight(s * 1.6);
  const x = cx - width / 2;
  const top = cy + s * 3.2;
  return gameOverButtonItems().map((b, i) => ({ ...b, x, y: top + i * (height + s), width, height }));
}

// What the buttons are, each with a smaller second line: the gold
// "Continue" (if offered), then "Start over"
// (gold when it's the only one, in the top place)
function gameOverButtonItems() {
  const text = UI_TEXT.gameOver;
  const buttons = [];
  if (canOfferContinue()) {
    buttons.push({
      label: text.retry.replace("{level}", progress.checkpoint.level),
      sub: text.retrySub.replace("{level}", progress.checkpoint.level),
      adBadge: false, // true draws the small play-triangle plate (ui.js), for a real ad later
      action: requestContinueAd,
    });
  }
  buttons.push({
    label: text.startOver,
    sub: text.startOverSub,
    adBadge: false,
    action: () => {
      progress.run = null; // a new run replaces the saved one
      writeSave();
      newGame();
    },
  });
  return buttons.map((b, i) => ({ ...b, primary: i === 0 }));
}

// Same short wait as the other end screens, and off while an ad loads
// or plays
function gameOverButtonsReady() {
  return stateTimer >= BUTTON_DELAY && !gameOverScreen.waitingForAd;
}

function gameOverTap(x, y) {
  if (!gameOverButtonsReady()) return;
  for (const b of gameOverButtons()) {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      Sound.play("uiTap");
      b.action();
      return;
    }
  }
}

// Up/Down choose, Enter or Space press
function gameOverKeyDown(event) {
  const code = event.code;
  if (!["ArrowUp", "ArrowDown", "Enter", "Space"].includes(code)) return;
  event.preventDefault();
  const buttons = gameOverButtons();
  const over = gameOverScreen;
  if (code === "ArrowUp" || code === "ArrowDown") {
    const step = code === "ArrowUp" ? buttons.length - 1 : 1;
    over.selected = (Math.min(over.selected, buttons.length - 1) + step) % buttons.length;
    scrollOverlayTo(buttons[over.selected]);
  } else if (!event.repeat && gameOverButtonsReady()) {
    Sound.play("uiTap");
    buttons[Math.min(over.selected, buttons.length - 1)].action();
  }
}

// "Continue" pressed: ask ads.js for the rewarded ad (only ever from
// this button). Until it answers the game is paused (isPaused,
// pause.js), the buttons are off and all sound is muted. The answer is
// taken by the game loop (updateAdWait), so one that comes while the
// app is hidden waits until it shows again.
function requestContinueAd() {
  const over = gameOverScreen;
  over.waitingForAd = true;
  over.adWaitTime = 0;
  over.messageTime = 0;
  over.adAnswer = null;
  over.adRequest += 1;
  const request = over.adRequest;
  Sound.setAdPlaying(true);
  Promise.resolve().then(showRewardedAd).then( // ads.js; a throw counts as "not available"
    (rewarded) => { over.adAnswer = { request, failure: rewarded ? "" : UI_TEXT.gameOver.noReward }; },
    (error) => {
      if (DEBUG) console.warn("Rewarded ad failed", error);
      over.adAnswer = { request, failure: UI_TEXT.gameOver.adNotAvailable };
    }
  );
}

// The ad answered (or AD_WAIT_LIMIT passed): continue, or show why
// not for AD_MESSAGE_TIME seconds and keep the buttons (no continue
// used). An answer after giving up is ignored.
function finishContinueAd(request, failure) {
  const over = gameOverScreen;
  if (request !== over.adRequest || !over.waitingForAd) return;
  over.waitingForAd = false;
  Sound.setAdPlaying(false);
  if (failure) {
    over.message = failure;
    over.messageTime = AD_MESSAGE_TIME;
    return;
  }
  continueFromCheckpoint();
}

// Called every frame (also while the game is paused for the ad): take
// the ad's answer, or give up on an ad that never answers, so "Start
// over" can't stay off for good. The loop stops during system pauses,
// so those don't count.
function updateAdWait(deltaSeconds) {
  const over = gameOverScreen;
  if (!over.waitingForAd) return;
  const answer = over.adAnswer;
  if (answer) {
    over.adAnswer = null;
    finishContinueAd(answer.request, answer.failure);
    return;
  }
  over.adWaitTime += deltaSeconds;
  if (over.adWaitTime >= AD_WAIT_LIMIT) finishContinueAd(over.adRequest, UI_TEXT.gameOver.adNotAvailable);
}

// The reward: play the lost level again from its checkpoint - the same
// map and enemies, a repaired base, and the gold, score and upgrades
// (held armor and base steel too) it started with - with
// START_LIVES_AFTER_CONTINUE lives. No shop: the "LEVEL X" intro, then
// play.
function continueFromCheckpoint() {
  const checkpoint = progress.checkpoint;
  continuesUsed += 1;
  lives = START_LIVES_AFTER_CONTINUE;
  score = checkpoint.score;
  gold = checkpoint.gold;
  upgrades = { ...freshUpgrades(), ...checkpoint.upgrades };
  player.armorPiercing = upgrades.bulletTier >= 3;
  applyUpgradesToPlayer();
  startLevel(checkpoint.level - 1); // same level, so a DEBUG "H" level stays too
}

// --- "CAMPAIGN COMPLETE" screen (after the last hand-made level) ---
// Shown once per run. Without endless mode the run ends here, so it is
// shown every time and has only "Play again".
function reachedCampaignEnd() {
  if (isLastLevel()) return true;
  return !GENERATED_MODE && levelIndex === LEVELS.length - 1 && !campaignShown;
}

const campaignScreen = { selected: 0 }; // button chosen with the keyboard

function showCampaignComplete() {
  campaignShown = true;
  progress.campaignComplete = true;        // save.js
  if (isLastLevel()) progress.run = null;  // nothing to continue without endless mode
  updateRecords();
  writeSave();
  campaignScreen.selected = 0;
  setState(GAME_STATE.CAMPAIGN_COMPLETE);
}

// Where "CAMPAIGN COMPLETE" goes (overlayFrame): from the top of the
// star plate to the bottom of the last button
function campaignFrame() {
  return overlayFrame(-7.4, ENDLESS_ENABLED ? 4.1 : 1.9);
}

// The buttons, stacked under the middle of the map (landscape: in the
// right column, campaignColumns)
function campaignButtons() {
  if (isTwoColumnLayout()) return campaignColumns().buttons;
  const { s, cx, cy } = campaignFrame();
  const width = s * 9;
  const height = buttonHeight(s * 1.6);
  const x = cx - width / 2;
  const top = cy + s * 0.2;
  return campaignButtonItems().map((b, i) => ({ ...b, x, y: top + i * (height + s * 0.6), width, height }));
}

// What the buttons are: "Continue to Endless" (only with ENDLESS_ENABLED,
// gold) and "Play again" (gold when it's the only one)
function campaignButtonItems() {
  const buttons = [];
  if (ENDLESS_ENABLED) buttons.push({ label: "CONTINUE TO ENDLESS", action: openShop });
  buttons.push({
    label: "PLAY AGAIN",
    action: () => {
      progress.run = null; // a new run replaces the saved one
      writeSave();
      newGame();
    },
  });
  return buttons.map((b, i) => ({ ...b, primary: i === 0 }));
}

// Same short wait as the other end screens
function campaignButtonsReady() {
  return stateTimer >= BUTTON_DELAY;
}

function campaignTap(x, y) {
  if (!campaignButtonsReady()) return;
  for (const b of campaignButtons()) {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      Sound.play("uiTap");
      b.action();
      return;
    }
  }
}

// Up/Down choose, Enter or Space press
function campaignKeyDown(event) {
  const code = event.code;
  if (!["ArrowUp", "ArrowDown", "Enter", "Space"].includes(code)) return;
  event.preventDefault();
  const buttons = campaignButtons();
  if (code === "ArrowUp" || code === "ArrowDown") {
    campaignScreen.selected = (campaignScreen.selected + 1) % buttons.length;
    scrollOverlayTo(buttons[campaignScreen.selected]);
  } else if (!event.repeat && campaignButtonsReady()) {
    Sound.play("uiTap");
    buttons[campaignScreen.selected].action();
  }
}

function releaseAllInput() {
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
      gameOverScreen.messageTime -= deltaSeconds;
      break;
  }
}

// ---------------------------------------------------------------------
// Moving tanks (shared by the player and enemies)
// ---------------------------------------------------------------------

// Is a 1x1 tank at (x, y) touching any tile whose material passes
// test(material)?
function tankTouchesTile(x, y, test) {
  // A tiny margin so a tank exactly next to a wall is not "inside" it
  const e = 0.001;
  const left = Math.floor(x + e);
  const right = Math.floor(x + 1 - e);
  const top = Math.floor(y + e);
  const bottom = Math.floor(y + 1 - e);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      if (test(materialAt(col, row))) return true;
    }
  }
  return false;
}

// Is a 1x1 tank at (x, y) touching any tile that blocks tanks?
// (Walls, water and the edge of the map.)
function tankHitsWall(x, y) {
  return tankTouchesTile(x, y, (material) => material.blocksTank);
}

// The material under the tank's center (decides sand / ice effects)
function materialUnderTank(tank) {
  return materialAt(Math.floor(tank.x + 0.5), Math.floor(tank.y + 0.5));
}

// Do two 1x1 tanks at these positions overlap?
function tanksOverlap(x1, y1, x2, y2) {
  const e = 0.001;
  return Math.abs(x1 - x2) < 1 - e && Math.abs(y1 - y2) < 1 - e;
}

// Would "tank" bump into another tank by moving to (x, y)?
// We only block moves that get CLOSER to the other tank. That way two
// tanks that somehow ended up overlapping can still drive apart.
function tankHitsTank(tank, x, y) {
  for (const other of allTanks()) {
    if (other === tank) continue;
    if (!tanksOverlap(x, y, other.x, other.y)) continue;
    const distanceBefore = Math.abs(tank.x - other.x) + Math.abs(tank.y - other.y);
    const distanceAfter = Math.abs(x - other.x) + Math.abs(y - other.y);
    if (distanceAfter < distanceBefore) return true;
  }
  return false;
}

// Corner assist: if the tank is trying to drive into a wall but is
// only a little off from lining up with a gap (up to CORNER_ASSIST_RANGE
// of a tile, config.js), slide it sideways toward the gap. Uses this
// frame's movement, so it's as fast as driving. Returns true if it slid.
function cornerAssist(tank, dir, distance) {
  const vertical = dir === "up" || dir === "down";
  const across = vertical ? tank.x : tank.y;  // position across the movement
  const target = Math.round(across);          // nearest lined-up position
  const offset = target - across;
  if (offset === 0 || Math.abs(offset) > CORNER_ASSIST_RANGE) return false;

  // Is there really a gap? Lined up, could it move forward?
  const step = DIRECTIONS[dir];
  const testX = vertical ? target : tank.x + step.x * distance;
  const testY = vertical ? tank.y + step.y * distance : target;
  if (tankHitsWall(testX, testY)) return false;

  // Slide sideways toward the gap
  const slide = Math.sign(offset) * Math.min(Math.abs(offset), distance);
  const newX = vertical ? tank.x + slide : tank.x;
  const newY = vertical ? tank.y : tank.y + slide;
  if (tankHitsWall(newX, newY) || tankHitsTank(tank, newX, newY)) return false;

  tank.x = newX;
  tank.y = newY;
  return true;
}

// Turn the tank to "dir" and drive forward for this frame.
// Returns true if it was blocked (by the edge, a wall or a tank).
function moveTank(tank, dir, deltaSeconds) {
  // When turning a corner (from up/down to left/right or back), snap
  // the tank to the nearest half tile. This keeps it lined up with
  // the grid, like in the classic 8-bit tank games.
  // (Skip the snap if it would push us into another tank.)
  const wasVertical = tank.facing === "up" || tank.facing === "down";
  const isVertical = dir === "up" || dir === "down";
  if (wasVertical !== isVertical) {
    const snappedX = Math.round(tank.x * 2) / 2;
    const snappedY = Math.round(tank.y * 2) / 2;
    if (!tankHitsTank(tank, snappedX, snappedY)) {
      tank.x = snappedX;
      tank.y = snappedY;
    }
  }

  tank.facing = dir; // rotate to face the way we move

  // Slower on sand (speedFactor of the tile under the tank)
  const speedFactor = materialUnderTank(tank).speedFactor || 1;
  return pushTank(tank, dir, tank.speed * speedFactor * deltaSeconds, true);
}

// Move the tank "distance" tiles in "dir" without turning it.
// Used for driving (moveTank) and for sliding on ice. Corner assist
// is only used when driving. Returns true if it was blocked.
function pushTank(tank, dir, distance, useCornerAssist) {
  // Work out where the tank wants to go
  const step = DIRECTIONS[dir];
  const wantedX = tank.x + step.x * distance;
  const wantedY = tank.y + step.y * distance;

  // Keep it inside the playfield
  let newX = clamp(wantedX, 0, GRID_COLS - 1);
  let newY = clamp(wantedY, 0, GRID_ROWS - 1);
  let blocked = newX !== wantedX || newY !== wantedY;

  // Blocked by a wall, but almost lined up with a gap? Slide toward
  // the gap instead of getting stuck on the corner.
  if (useCornerAssist && tankHitsWall(newX, newY) && cornerAssist(tank, dir, distance)) return false;

  // If that spot is inside a wall, stop right in front of the wall
  // instead. Walls sit on whole tiles, so we round to a whole tile on
  // the side we came from.
  if (tankHitsWall(newX, newY)) {
    if (dir === "right") newX = Math.floor(newX);
    if (dir === "left")  newX = Math.ceil(newX);
    if (dir === "down")  newY = Math.floor(newY);
    if (dir === "up")    newY = Math.ceil(newY);
    blocked = true;
  }

  // Another tank in the way? Then don't move at all this frame.
  if (tankHitsTank(tank, newX, newY)) {
    newX = tank.x;
    newY = tank.y;
    blocked = true;
  }

  tank.x = newX;
  tank.y = newY;
  return blocked;
}

// Ice: a tank on ice keeps sliding the way it was driving for
// TERRAIN.iceSlideTime seconds after it stops, slowing down. If it
// turns, it drives the new way at once while the old slide fades out.
// Call this every frame after moving; "steeredDir" is the direction
// it drove this frame (null if it didn't).
function updateIceSlide(tank, steeredDir, deltaSeconds) {
  if (!materialUnderTank(tank).slippery) {
    tank.slideTimer = 0; // off the ice: no sliding
    return;
  }

  // Still sliding in an older direction (or not steering at all)?
  if (tank.slideTimer > 0 && tank.slideDir !== steeredDir) {
    const fade = tank.slideTimer / TERRAIN.iceSlideTime; // 1 -> 0
    const hit = pushTank(tank, tank.slideDir, tank.speed * fade * deltaSeconds, false);
    tank.slideTimer = hit ? 0 : tank.slideTimer - deltaSeconds;
  }

  // Driving: remember this direction for the next slide (a new
  // direction takes over once the old slide is over)
  if (steeredDir && (steeredDir === tank.slideDir || tank.slideTimer <= 0)) {
    tank.slideDir = steeredDir;
    tank.slideTimer = TERRAIN.iceSlideTime;
  }
}

// ---------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------
function updatePlayer(deltaSeconds) {
  // Dead: wait, then come back with a few safe seconds.
  // If there's no free spot right now, spawnPlayer() fails and we
  // simply try again next frame.
  if (!player.alive) {
    player.respawnTimer -= deltaSeconds;
    if (player.respawnTimer <= 0) spawnPlayer();
    return;
  }

  player.invincibleTimer = Math.max(0, player.invincibleTimer - deltaSeconds);

  const dir = currentDirection();
  if (dir) moveTank(player, dir, deltaSeconds);
  updateIceSlide(player, dir, deltaSeconds);
}

// The engine sound (audio.js) runs while the player drives during play.
// It stops on pause, in menus and end screens and when the tank is
// destroyed (audio.js also checks the sound settings). Called every
// frame, even while paused.
function updateEngineSound() {
  const driving = isPlaying() && !isPaused() && player.alive && currentDirection() !== null;
  Sound.setEngine(driving, driving ? enginePitch() : 0);
}

// Engine pitch (1 = normal): a little higher with each tank speed
// upgrade, lower on sand, higher on ice (ENGINE_SOUND in config.js)
function enginePitch() {
  const ground = materialUnderTank(player);
  let pitch = 1 + upgrades.speedTier * ENGINE_SOUND.pitchPerSpeedTier;
  if ((ground.speedFactor || 1) < 1) pitch *= ENGINE_SOUND.sandPitch;
  if (ground.slippery) pitch *= ENGINE_SOUND.icePitch;
  return pitch;
}

// Is (x, y) a good place for the player to appear?
// Not inside a wall and not on top of an enemy.
function isSpawnSpotFree(x, y) {
  if (tankHitsWall(x, y)) return false;
  return !enemies.some((e) => tanksOverlap(e.x, e.y, x, y));
}

// Find the free tile closest to the start position (null if none)
function findPlayerSpawnSpot() {
  const start = PLAYER_START;
  if (isSpawnSpotFree(start.x, start.y)) return { x: start.x, y: start.y };

  let best = null;
  let bestDistance = Infinity;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (!isSpawnSpotFree(col, row)) continue;
      const distance = Math.abs(col - start.x) + Math.abs(row - start.y);
      if (distance < bestDistance) {
        best = { x: col, y: row };
        bestDistance = distance;
      }
    }
  }
  return best;
}

// Put the player on the map with a few safe (blinking) seconds.
// Returns false if there was no free spot.
function spawnPlayer() {
  const spot = findPlayerSpawnSpot();
  if (!spot) return false;
  player.x = spot.x;
  player.y = spot.y;
  player.facing = "up";
  player.slideTimer = 0;
  player.alive = true;
  player.respawnTimer = 0;
  player.invincibleTimer = INVINCIBLE_TIME;
  return true;
}

function playerFire() {
  if (isPaused() || !isPlaying() || !player.alive) return;
  fireBullet(player, playerBulletSpeed()); // faster with the bullet upgrade
  tutorialNoteFired();
}

// The player's armor (from the shop) took a hit: it breaks, the
// player survives
function breakArmor() {
  upgrades.hasArmor = false;
  Sound.play("armorBreak");
  explosions.push({
    x: player.x + 0.5, y: player.y + 0.5, size: 1, age: 0,
    duration: ARMOR_BREAK_TIME, kind: "armorBreak",
  });
}

function destroyPlayer() {
  addTankBlast(player);
  Sound.play("explosion");
  player.alive = false;
  lives -= 1;
  levelStats.livesLost += 1;
  if (lives <= 0) {
    loseGame();
  } else {
    player.respawnTimer = RESPAWN_DELAY;
  }
}

// ---------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Would the enemy drive straight into something it can never get
// through (water or the edge of the map) by going "dir"? Walls that
// bullets can break are fine: enemies drive at them and shoot.
function enemyDirectionClosed(enemy, dir) {
  const step = DIRECTIONS[dir];
  const aheadX = enemy.x + step.x * 0.5;  // half a tile ahead
  const aheadY = enemy.y + step.y * 0.5;
  return tankTouchesTile(aheadX, aheadY, (m) => m.blocksTank && m.health === null);
}

// Pick a random direction, using ENEMY_DIRECTION_WEIGHTS so "down"
// comes up more often. "avoid" (optional) is a direction we don't want,
// e.g. the one that just got us stuck. Directions that run straight
// into water are skipped too (unless nothing else is left).
function randomEnemyDirection(enemy, avoid) {
  let choices = Object.keys(ENEMY_DIRECTION_WEIGHTS).filter((d) => d !== avoid);
  const open = choices.filter((d) => !enemyDirectionClosed(enemy, d));
  if (open.length > 0) choices = open;
  let total = 0;
  for (const d of choices) total += ENEMY_DIRECTION_WEIGHTS[d];
  let roll = Math.random() * total;
  for (const d of choices) {
    roll -= ENEMY_DIRECTION_WEIGHTS[d];
    if (roll < 0) return d;
  }
  return choices[0];
}

// Spawn a new enemy now and then, if there's room
function updateSpawning(deltaSeconds) {
  const levelEnemies = currentLevel().enemies;
  if (enemiesSpawned >= levelEnemies.length) return;   // all used up
  if (enemies.length >= MAX_ENEMIES_ON_SCREEN) return; // screen is full

  spawnTimer -= deltaSeconds;
  if (spawnTimer > 0) return;

  // Try the spawn points in turn, starting with the next one in line.
  // Skip a point if a tank is standing on it.
  for (let i = 0; i < SPAWN_POINTS.length; i++) {
    const index = (nextSpawnPoint + i) % SPAWN_POINTS.length;
    const point = SPAWN_POINTS[index];
    const blocked = allTanks().some((t) => tanksOverlap(t.x, t.y, point.x, point.y));
    if (blocked) continue;

    // The next enemy in the level's list decides the type
    const type = ENEMY_TYPES[levelEnemies[enemiesSpawned]] || ENEMY_TYPES.basic;
    const enemy = createTank(point.x, point.y, "down", enemySpeed(type), type.colors);
    enemy.type = type;
    enemy.typeName = ENEMY_TYPES[levelEnemies[enemiesSpawned]] ? levelEnemies[enemiesSpawned] : "basic";
    enemy.look = type.look;
    enemy.health = type.health;
    enemy.flashTimer = 0;        // > 0 while flashing white after a hit
    // Every Nth enemy blinks and drops a power-up when destroyed
    enemy.carriesPowerUp = (enemiesSpawned + 1) % POWERUPS.flashingEnemyEvery === 0;
    enemy.wantedDir = "down";
    enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    enemy.fireTimer = enemyFireDelay(type);
    enemies.push(enemy);
    enemiesSpawned += 1;
    nextSpawnPoint = (index + 1) % SPAWN_POINTS.length;
    spawnTimer = ENEMY_SPAWN_DELAY;
    return;
  }
  // Every spawn point was blocked: try again next frame
}

// Simple AI: drive, turn now and then (or when stuck), shoot at random
function updateEnemies(deltaSeconds) {
  for (const enemy of enemies) {
    enemy.flashTimer = Math.max(0, enemy.flashTimer - deltaSeconds);

    // Clock power-up: enemies can't move or shoot
    if (isEffectActive("clock") || debugFreezeEnemies) continue;

    // Time to pick a new direction?
    // (We store it in "wantedDir"; moveTank does the actual turning,
    // so the tank snaps to the grid properly.)
    enemy.turnTimer -= deltaSeconds;
    if (enemy.turnTimer <= 0) {
      enemy.wantedDir = randomEnemyDirection(enemy);
      enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    }

    // Drive; if something is in the way, pick another direction
    const drivenDir = enemy.wantedDir;
    const blocked = moveTank(enemy, drivenDir, deltaSeconds);
    updateIceSlide(enemy, drivenDir, deltaSeconds);
    if (blocked) {
      enemy.wantedDir = randomEnemyDirection(enemy, enemy.wantedDir);
      enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    }

    // Time to shoot?
    enemy.fireTimer -= deltaSeconds;
    if (enemy.fireTimer <= 0) {
      fireBullet(enemy, enemy.type.bulletSpeed);
      enemy.fireTimer = enemyFireDelay(enemy.type);
    }
  }
}

// A player bullet hit this enemy: take away 1 health. If some is left,
// flash white (and maybe change color); otherwise it's destroyed.
function hitEnemy(enemy) {
  enemy.health -= 1;
  if (enemy.health <= 0) {
    destroyEnemy(enemy);
    return;
  }
  Sound.play("heavyHit"); // hit, but it has health left (a metal clank)
  enemy.flashTimer = ENEMY_HIT_FLASH_TIME;
  const damaged = enemy.type.damagedColors;
  if (damaged && damaged[enemy.health]) enemy.colors = damaged[enemy.health];
}

function destroyEnemy(enemy) {
  addTankBlast(enemy);
  Sound.play("explosion");
  enemies = enemies.filter((e) => e !== enemy);
  enemiesDestroyed += 1;
  levelStats.enemiesDestroyed += 1;
  score += enemy.type.points;
  dropCoin(enemy);
  if (enemy.carriesPowerUp) dropPowerUp();

  // Last one? Start the short countdown to the level summary.
  if (enemiesDestroyed >= currentLevel().enemies.length) levelEndTimer = LEVEL_END_DELAY;
}

// ---------------------------------------------------------------------
// Coins (gold dropped by destroyed enemies)
// Amounts and timings are in config.js (ECONOMY).
// ---------------------------------------------------------------------
let coins = []; // each one: { x, y, gold, age }

function dropCoin(enemy) {
  const value = ECONOMY.enemyGold[enemy.typeName] || 0;
  if (value <= 0) return;
  coins.push({ x: enemy.x, y: enemy.y, gold: value, age: 0 });
}

function updateCoins(deltaSeconds) {
  for (const coin of coins) coin.age += deltaSeconds;

  // Picked up by the player driving over it (close enough = touching)
  if (player.alive) {
    for (const coin of coins) {
      if (Math.abs(coin.x - player.x) < 0.7 && Math.abs(coin.y - player.y) < 0.7) {
        gold += coin.gold;
        levelStats.coinGold += coin.gold;
        Sound.play("coin");
        coin.age = Infinity; // mark as gone
      }
    }
  }

  // Remove coins that were picked up or ran out of time
  coins = coins.filter((coin) => coin.age < ECONOMY.coinLifetime);
}

// After the last enemy: wait a little (or until all coins are taken),
// then end the level
function updateLevelEnd(deltaSeconds) {
  if (levelEndTimer === null || !isPlaying()) return;
  levelEndTimer -= deltaSeconds;
  if (levelEndTimer <= 0 || coins.length === 0) finishLevel();
}

// ---------------------------------------------------------------------
// Power-ups on the field
// The types (look + effect) are in powerups.js, the numbers in
// config.js (POWERUPS). Only one power-up can be on the map at a time.
// ---------------------------------------------------------------------
let powerUp = null; // { type, col, row, age } or null

// Pick a random type using the chances in config.js. A type whose
// canDrop() says no right now is re-rolled.
function rollPowerUpType() {
  const names = Object.keys(POWERUPS.types);
  for (let tries = 0; tries < 20; tries++) {
    let total = 0;
    for (const name of names) total += POWERUPS.types[name].chance;
    let roll = Math.random() * total;
    let picked = names[names.length - 1];
    for (const name of names) {
      roll -= POWERUPS.types[name].chance;
      if (roll < 0) { picked = name; break; }
    }
    const canDrop = POWERUP_TYPES[picked].canDrop;
    if (!canDrop || canDrop()) return picked;
  }
  return null; // nothing could drop (very unlikely)
}

// Is there a tank on (or partly on) this tile?
function tileHasTank(col, row) {
  return allTanks().some((t) => tanksOverlap(t.x, t.y, col, row));
}

// Drop a random power-up on a random free tile: one a tank can drive
// on (no wall, water or base), not hidden under forest, and without a
// tank on it. It replaces any power-up already on the map.
function dropPowerUp() {
  const type = rollPowerUpType();
  if (!type) return;

  const freeTiles = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const material = materialAt(col, row);
      if (!material.blocksTank && material.layer !== "overlay" && !tileHasTank(col, row)) {
        freeTiles.push([col, row]);
      }
    }
  }
  if (freeTiles.length === 0) return;

  const [col, row] = freeTiles[Math.floor(Math.random() * freeTiles.length)];
  powerUp = { type, col, row, age: 0 };
}

function updatePowerUp(deltaSeconds) {
  if (!powerUp) return;
  powerUp.age += deltaSeconds;
  if (powerUp.age >= POWERUPS.lifetime) {
    powerUp = null; // too late, it's gone
    return;
  }

  // Picked up by the player driving over it
  if (player.alive &&
      Math.abs(powerUp.col - player.x) < 0.7 &&
      Math.abs(powerUp.row - player.y) < 0.7) {
    const type = powerUp.type;
    powerUp = null;
    Sound.play("powerUp", 0, type); // each type ends on its own note
    activatePowerUp(type);
  }
}

// ---------------------------------------------------------------------
// Power-up effects
// Instant ones (no duration in config.js) just run onPickup.
// Timed ones get a timer in activeEffects; picking up the same type
// again resets the timer to the full duration.
// ---------------------------------------------------------------------
let activeEffects = {};  // type name -> seconds left
let effectFullTime = {}; // type name -> seconds it started with (for the HUD bar)

function isEffectActive(type) {
  return (activeEffects[type] || 0) > 0;
}

function activatePowerUp(type) {
  const def = POWERUP_TYPES[type];
  const duration = POWERUPS.types[type].duration;
  if (def.onPickup) def.onPickup();
  if (duration) startTimedEffect(type, duration); // instant ones are done
}

// Start a timed effect, or reset its timer if it's already running
function startTimedEffect(type, duration) {
  const def = POWERUP_TYPES[type];
  const alreadyActive = isEffectActive(type);
  activeEffects[type] = duration;
  effectFullTime[type] = duration;
  if (!alreadyActive && def.onStart) def.onStart();
}

function updateEffects(deltaSeconds) {
  for (const type of Object.keys(activeEffects)) {
    const def = POWERUP_TYPES[type];
    activeEffects[type] -= deltaSeconds;
    if (activeEffects[type] > 0) {
      if (def.onTick) def.onTick(activeEffects[type]);
    } else {
      delete activeEffects[type];
      if (def.onEnd) def.onEnd();
    }
  }
}

// End every effect right away (when a level is finished)
function endAllEffects() {
  for (const type of Object.keys(activeEffects)) {
    delete activeEffects[type];
    const def = POWERUP_TYPES[type];
    if (def.onEnd) def.onEnd();
  }
}

// ---------------------------------------------------------------------
// Bullets
// Each tank may have only tank.maxBullets flying at a time (1, or 2-3
// for the player with the bullet upgrade).
// x and y are the bullet's CENTER, in tiles.
// ---------------------------------------------------------------------
let bullets = [];

function fireBullet(tank, speed) {
  const flying = bullets.filter((b) => b.owner === tank && !b.dead).length;
  if (flying >= tank.maxBullets) return; // already enough in the air
  const step = DIRECTIONS[tank.facing];
  const bullet = {
    // Start at the tip of the cannon (center of tank + half a tile)
    x: tank.x + 0.5 + step.x * 0.5,
    y: tank.y + 0.5 + step.y * 0.5,
    dir: tank.facing,
    speed,
    damage: bulletDamage(tank),
    owner: tank,
    dead: false,
  };
  bullets.push(bullet);
  Sound.play(tank === player ? "playerShot" : "enemyShot");
}

// How much damage this tank's bullets do to walls.
// Only the player can have armor-piercing bullets.
function bulletDamage(tank) {
  if (tank === player && player.armorPiercing) return ARMOR_PIERCING_DAMAGE;
  return BULLET_DAMAGE;
}

function removeBullet(bullet) {
  bullet.dead = true; // thrown away at the end of updateBullets()
}

function updateBullets(deltaSeconds) {
  // Move all bullets in small steps, checking for hits after each
  // step, so fast bullets can't skip over a brick, a tank or each other.
  const fastest = Math.max(PLAYER_BULLET_SPEED, ...bullets.map((b) => b.speed));
  const stepCount = Math.ceil((fastest * deltaSeconds) / 0.2);
  const stepTime = deltaSeconds / stepCount;

  for (let i = 0; i < stepCount; i++) {
    for (const bullet of bullets) {
      if (bullet.dead) continue;
      const step = DIRECTIONS[bullet.dir];
      bullet.x += step.x * bullet.speed * stepTime;
      bullet.y += step.y * bullet.speed * stepTime;
      checkBulletHits(bullet);
    }
    checkBulletsHitEachOther();
  }

  // Throw away bullets that are finished
  bullets = bullets.filter((b) => !b.dead);
}

function checkBulletHits(bullet) {
  // Left the playfield? Then it's gone.
  if (bullet.x < 0 || bullet.x > GRID_COLS || bullet.y < 0 || bullet.y > GRID_ROWS) {
    removeBullet(bullet);
    return;
  }

  if (bulletHitsWall(bullet)) {
    removeBullet(bullet);
    return;
  }

  const fromPlayer = bullet.owner === player;

  // Player bullet hits an enemy: it loses 1 health (maybe destroyed)
  if (fromPlayer) {
    for (const enemy of enemies) {
      if (pointInTank(bullet.x, bullet.y, enemy)) {
        removeBullet(bullet);
        hitEnemy(enemy);
        return;
      }
    }
  }

  // Enemy bullet hits the player (enemy bullets fly through other
  // enemies, like in the classic game)
  if (!fromPlayer && player.alive && pointInTank(bullet.x, bullet.y, player)) {
    removeBullet(bullet);
    // Safe while blinking after a respawn, or with the shield power-up
    // Shop armor takes the hit instead (and breaks)
    if (player.invincibleTimer <= 0 && !isEffectActive("shield")) {
      if (upgrades.hasArmor) breakArmor();
      else destroyPlayer();
    } else {
      Sound.play("metalHit"); // the shield (or respawn blink) blocked it
    }
  }
}

function pointInTank(x, y, tank) {
  return x > tank.x && x < tank.x + 1 && y > tank.y && y < tank.y + 1;
}

// Two bullets from different tanks that touch cancel each other out
function checkBulletsHitEachOther() {
  for (let a = 0; a < bullets.length; a++) {
    for (let b = a + 1; b < bullets.length; b++) {
      const one = bullets[a];
      const two = bullets[b];
      if (one.dead || two.dead || one.owner === two.owner) continue;
      if (Math.abs(one.x - two.x) < 0.3 && Math.abs(one.y - two.y) < 0.3) {
        removeBullet(one);
        removeBullet(two);
      }
    }
  }
}

// Check the tiles under the bullet. The bullet is a little wide, so if
// it flies right between two walls, it hits BOTH, just like in the
// classic game. Returns true if the bullet hit something.
function bulletHitsWall(bullet) {
  const halfWidth = 0.15;
  const goingSideways = bullet.dir === "left" || bullet.dir === "right";

  // Two check points: on each side of the bullet's path
  const points = goingSideways
    ? [[bullet.x, bullet.y - halfWidth], [bullet.x, bullet.y + halfWidth]]
    : [[bullet.x - halfWidth, bullet.y], [bullet.x + halfWidth, bullet.y]];

  let hit = false;
  let lastCol = null;
  let lastRow = null;
  for (const [px, py] of points) {
    const col = Math.floor(px);
    const row = Math.floor(py);
    // Both points can be on the same tile: only hit it once
    if (col === lastCol && row === lastRow) continue;
    lastCol = col;
    lastRow = row;
    if (hitTile(col, row, bullet)) hit = true;
  }
  return hit;
}

// A bullet reached tile (col, row). Works the same for every material,
// using its settings from materials.js. Returns true if the bullet is
// stopped here.
function hitTile(col, row, bullet) {
  const material = materialAt(col, row);
  if (!material.blocksBullet) return false;  // flies right over it

  // The base: any hit destroys it (once)
  if (material.isBase) {
    if (!baseDestroyed) destroyBase(col, row);
    return true;
  }

  // Too strong for this bullet (or can't be destroyed at all):
  // the bullet bounces off with a little spark
  if (material.health === null || bullet.damage < material.minDamageToHurt) {
    addSpark(bullet.x, bullet.y);
    Sound.play("metalHit");
    return true;
  }

  // Otherwise the wall takes the bullet's damage; at 0 it's gone
  const cell = map[row][col];
  if (cell.baseWall && bullet.owner !== player) levelStats.baseWallDamaged = true;
  cell.health -= bullet.damage;
  const destroyed = cell.health <= 0;
  // brick, concrete or metal (materials.js); a brick that breaks has its own sound
  Sound.play((destroyed && material.destroySound) || material.hitSound || "metalHit");
  if (destroyed) {
    setTile(col, row, "empty");
    addExplosion(col + 0.5, row + 0.5);
  }
  return true;
}

// The base got hit: show it as rubble with a big explosion and end
// the game right away, no matter how many lives are left.
function destroyBase(col, row) {
  baseDestroyed = true;
  map[row][col].health = 0;   // drawn as rubble from now on
  const gold = BASE_LOOK.gold, plate = BASE_LOOK.plate;
  addBlast(col + 0.5, row + 0.5, [gold[1], plate[0], plate[1], gold[2]], BLAST_LOOKS.baseSize);
  Sound.play("baseDestroyed");
  loseGame();
}

// ---------------------------------------------------------------------
// Explosions (just for looks)
// ---------------------------------------------------------------------
// Each one: { x, y, size, age, duration, spark }, plus a "kind" for
// the armor break and tank blasts (addBlast).
// A "spark" is the tiny flash when a bullet bounces off a wall.
const explosions = [];

// size 1 = brick explosion, bigger numbers = bigger boom
function addExplosion(x, y, size = 1) {
  explosions.push({ x, y, size, age: 0, duration: EXPLOSION_TIME, spark: false });
}

function addSpark(x, y) {
  explosions.push({ x, y, size: 0.4, age: 0, duration: SPARK_TIME, spark: true });
}

// Scorch marks left on the ground by blasts: { x, y, size, age, variant }
const scorchMarks = [];
let blastCount = 0; // seeds each blast's random, so no two look the same

// A tank (or the base) blowing up: fire, smoke, sparks and pieces in
// "pieceColors" (4 colors) flying off, plus a scorch mark on the
// ground. Every particle's path is picked here with seeded random and
// worked out from the blast's age when drawn (drawBlast), so there's
// nothing to update. Numbers are in BLAST_LOOKS (config.js).
function addBlast(x, y, pieceColors, size = 1) {
  const looks = BLAST_LOOKS;
  blastCount += 1;
  const random = makeRandom(blastCount * 7919);
  const between = (min, max) => min + random() * (max - min);
  const boom = {
    x, y, size, age: 0, duration: looks.time, kind: "blast",
    fire: [], smoke: [], debris: [], sparks: [],
  };

  // Fire clouds: a big white-hot one in the middle, smaller and cooler
  // ones pushed outward, each starting a little later
  for (let i = 0; i < looks.firePuffs; i++) {
    const first = i === 0;
    boom.fire.push({
      cooled: first ? 0 : between(0.3, 0.7), // how far it starts toward dark red (0-2)
      angle: (i / (looks.firePuffs - 1)) * Math.PI * 2 + between(0, 0.8), // spread around
      distance: first ? 0 : between(0.3, 0.6),
      delay: first ? 0 : between(0.02, 0.12),
      life: first ? 0.6 : between(0.45, 0.65),
      startRadius: first ? 0.4 : between(0.22, 0.3),
      endRadius: first ? 0.8 : between(0.5, 0.65),
    });
  }

  // Smoke: comes up as the fire cools and drifts off slowly
  for (let i = 0; i < looks.smokePuffs; i++) {
    const delay = between(0.15, 0.3);
    boom.smoke.push({
      angle: between(0, Math.PI * 2),
      distance: between(0.25, 0.55),
      delay,
      life: Math.min(between(0.8, 1.1), looks.time - delay),
      endRadius: between(0.8, 1.05),
    });
  }

  // Pieces of the tank: thrown up and out, spinning, then they land
  for (let i = 0; i < looks.debris; i++) {
    boom.debris.push({
      angle: (i / looks.debris) * Math.PI * 2 + between(0, 0.6),
      speed: between(2.4, 4.4),
      flight: between(0.45, 0.7),
      turn: between(0, Math.PI),
      spin: between(-14, 14),
      width: between(0.08, 0.15),
      height: between(0.05, 0.1),
      color: pieceColors[i % pieceColors.length],
    });
  }

  // Sparks: fast and short-lived
  for (let i = 0; i < looks.sparks; i++) {
    boom.sparks.push({
      angle: between(0, Math.PI * 2),
      speed: between(5, 9),
      life: between(0.25, 0.5),
    });
  }

  explosions.push(boom);
  scorchMarks.push({ x, y, size, age: 0, variant: blastCount % 3 });
  if (scorchMarks.length > looks.maxScorchMarks) scorchMarks.shift();
}

// A tank's blast, with pieces in its colors
function addTankBlast(tank) {
  const c = tank.colors;
  addBlast(tank.x + 0.5, tank.y + 0.5, [c.body, c.turret, c.track, c.body]);
}

function updateExplosions(deltaSeconds) {
  // Go backwards so removing items doesn't skip any
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].age += deltaSeconds;
    if (explosions[i].age >= explosions[i].duration) explosions.splice(i, 1);
  }
  for (let i = scorchMarks.length - 1; i >= 0; i--) {
    scorchMarks[i].age += deltaSeconds;
    if (scorchMarks[i].age >= BLAST_LOOKS.scorchTime) scorchMarks.splice(i, 1);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function draw() {
  // The shop is a full screen of its own (shop.js)
  if (gameState === GAME_STATE.SHOP) {
    drawShop();
    return;
  }

  // Start-up screens: waiting for the save, or "Continue?" (save.js)
  if (gameState === GAME_STATE.LOADING) {
    showLoadingScreen();
    return;
  }
  if (gameState === GAME_STATE.CONTINUE_PROMPT) {
    drawContinuePrompt();
    return;
  }

  // The theme's dark background over the whole screen (behind the
  // control zone), then the themed margins around the playfield and the
  // page color behind the canvas (themes.js)
  ctx.fillStyle = currentTheme().screen;
  ctx.fillRect(0, 0, view.width, view.height);
  drawMargins();
  updatePageBackground();

  drawField();        // ground, then "ground" and "solid" tiles
  drawCoins();
  drawPowerUp();

  // Tanks: nothing of them is drawn under forest ("overlay" tiles)...
  ctx.save();
  clipToOverlayTiles(false);
  drawEnemies();
  drawPlayer();
  ctx.restore();

  drawBullets();
  drawAmbient();        // the theme's snow etc. (themes.js), under forest
  drawTiles("overlay"); // forest, over tanks and bullets

  // ...except that coins in the forest are drawn on top of it, so they
  // can be found, and the tanks show faintly on top of it (the enemies
  // fainter than the player)
  ctx.save();
  clipToOverlayTiles(true);
  drawCoins();
  ctx.globalAlpha = TERRAIN.forestEnemyAlpha;
  if (TERRAIN.forestEnemyAlpha > 0) drawEnemies();
  ctx.globalAlpha = TERRAIN.forestPlayerAlpha;
  drawPlayer();
  ctx.restore();

  drawExplosions();
  drawControlPanel();
  drawHud();

  // What goes on top depends on the game state
  if (isPlaying()) {
    drawLevelEndHint();
    drawTutorial();
    drawControls();
  } else if (gameState === GAME_STATE.WORLD_INTRO) {
    drawWorldIntro();
  } else if (gameState === GAME_STATE.LEVEL_INTRO) {
    drawLevelIntro();
  } else if (gameState === GAME_STATE.LEVEL_SUMMARY) {
    drawLevelSummary();
  } else if (gameState === GAME_STATE.CAMPAIGN_COMPLETE) {
    drawCampaignComplete();
  } else {
    drawEndScreen();
  }

  // Pause button, or the pause menu over everything (pause.js)
  if (pauseMenu.open) drawPauseMenu();
  else if (canOpenPauseMenu()) drawPauseButton();
}

// The gold coin picture, "size" pixels wide (paintCoin in powerups.js)
function coinPicture(size) {
  return cachedPicture("coin" + size, size, size, (c) => paintCoin(c, size));
}

// Coins on the map: the cached coin turning slowly (squeezed sideways,
// so it looks like it spins) over a soft pulsing gold glow. Each coin
// has its own timing. Blinks during its last seconds.
function drawCoins() {
  const s = field.tileSize;
  const look = PICKUP_LOOKS;
  const size = s * look.coinSize;
  const picture = coinPicture(size);
  for (const coin of coins) {
    const timeLeft = ECONOMY.coinLifetime - coin.age;
    if (timeLeft < ECONOMY.coinBlinkTime && Math.floor(coin.age * look.blinkRate) % 2 === 1) continue;

    const { x: cx, y: cy } = mapToScreen(coin.x + 0.5, coin.y + 0.5);
    const phase = coin.x * 1.7 + coin.y * 2.3;
    drawGlow(cx, cy, look.coin[1], look.glowSize * 0.8,
             look.glowAlpha * pulse(look.pulseSpeed, look.pulseAmount, phase));
    const turn = 0.35 + 0.65 * Math.abs(Math.cos(gameTime * look.coinSpinSpeed + phase));
    ctx.drawImage(picture, cx - (size * turn) / 2, cy - size / 2, size * turn, size);
  }
}

// While waiting to end the level, tell the player to grab the coins:
// "ALL ENEMIES DESTROYED" on a title plate and "Grab the coins!" on a
// small framed strip under it (ui.js), near the top of the playfield as
// it is on screen (the text is never turned)
function drawLevelEndHint() {
  if (levelEndTimer === null) return;
  const s = field.tileSize;
  const rect = fieldRect();
  const cx = rect.x + rect.width / 2;
  const maxWidth = rect.width - s * 3; // leaves room for the pause button
  drawTitlePlate("ALL ENEMIES DESTROYED", cx, rect.y + s * 1.3, s * 0.55, "#7ee081", maxWidth);
  drawMessageStrip("Grab the coins!", cx, rect.y + s * 2.5, s * 0.5, "#f5c542", maxWidth);
}

function drawField() {
  const s = field.tileSize;

  // Ground tiles in the theme's look (themes.js), then big soft patches
  // across them so the ground doesn't look tiled
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const at = tileToScreen(col, row);
      drawGround(at.x, at.y, s, col, row);
    }
  }
  drawGroundShade();

  // Floor tiles (water, sand, ice), scorch marks from blasts, the walls'
  // shadows, then the walls, all under the tanks. The vignette darkens
  // the corners of all that.
  drawTiles("ground");
  drawScorchMarks();
  drawWallShadows();
  drawTiles("solid");
  drawVignette();

  // Border around the whole playfield
  const rect = fieldRect();
  ctx.strokeStyle = currentTheme().border;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2);
}

// ---------------------------------------------------------------------
// Cached pictures. Things that take many drawing steps (ground, bricks,
// tanks, shadows, vignette) are painted once into a small offscreen
// canvas and copied with drawImage every frame. They are painted at the
// tile size times devicePixelRatio, so they stay sharp, and all of them
// are thrown away when that or the screen size changes (resize).
// ---------------------------------------------------------------------
let pictures = {};       // painted pictures, by key
let picturesSize = "";   // tile size in real pixels and screen size they were painted for

// The picture for "key", width x height CSS pixels. The first time it's
// needed, paint(c, scale) paints it on context c in CSS pixels (scale =
// real pixels per CSS pixel). "scale" can be given for pictures that
// are meant to be stretched (1 = one real pixel per CSS pixel).
function cachedPicture(key, width, height, paint, scale) {
  const ratio = window.devicePixelRatio || 1;
  // (The screen size too, so full-screen pictures of old sizes don't pile up)
  const size = field.tileSize * ratio + "@" + view.width + "x" + view.height;
  if (size !== picturesSize) {
    pictures = {};
    picturesSize = size;
  }
  if (!pictures[key]) {
    const pixelScale = scale || ratio;
    const picture = document.createElement("canvas");
    picture.width = Math.max(1, Math.round(width * pixelScale));
    picture.height = Math.max(1, Math.round(height * pixelScale));
    const c = picture.getContext("2d");
    c.scale(picture.width / width, picture.height / height);
    paint(c, picture.width / width);
    pictures[key] = picture;
  }
  return pictures[key];
}

// A soft shadow under something the size of a tile with its top-left at
// (x, y): a black square "size" tiles wide with a blurred edge, moved
// right and down (the light comes from the top-left). Works with the
// current globalAlpha (faded tanks get faded shadows). "tile" is the
// tile size in pixels (the playfield's, unless given).
function drawSoftShadow(x, y, size, alpha, tile) {
  const s = tile || field.tileSize;
  const side = size * s;
  const pad = VISUALS.shadowBlur * s * 2; // room for the blurred edge
  const box = side + pad * 2;
  const picture = cachedPicture("shadow" + size + (tile ? "@" + tile : ""), box, box, (c, scale) => {
    // Only the square's canvas shadow lands on the picture: the square
    // itself is drawn off to the left (shadowBlur and shadowOffset are
    // in real pixels, not affected by c.scale)
    c.shadowColor = "#000000";
    c.shadowBlur = VISUALS.shadowBlur * s * scale;
    c.shadowOffsetX = box * 2 * scale;
    c.fillStyle = "#000000";
    c.fillRect(pad - box * 2, pad, side, side);
  });

  const corner = (s - side) / 2 - pad + VISUALS.shadowOffset * s;
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(picture, x + corner, y + corner, box, box);
  ctx.globalAlpha = before;
}

// Tiles whose material has "castsShadow" (materials.js) throw a soft
// shadow onto the floor to the bottom-right, so they look raised. The
// shadows stay inside the playfield.
function drawWallShadows() {
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = map[row][col];
      if (!MATERIALS[cell.drawAs || cell.material].castsShadow) continue;
      const at = tileToScreen(col, row);
      drawSoftShadow(at.x, at.y, 1, VISUALS.wallShadowAlpha);
    }
  }
  ctx.restore();
}

// Darker corners on the playfield, in the theme's screen color: a small
// picture with a soft round fade, stretched over the whole playfield as
// it is on screen (turned or not).
function drawVignette() {
  if (VISUALS.vignetteAlpha <= 0) return;
  const color = currentTheme().screen;
  const size = 64;
  const picture = cachedPicture("vignette" + color, size, size, (c) => {
    const middle = size / 2;
    const fade = c.createRadialGradient(middle, middle, middle * 0.75, middle, middle, middle * 1.45);
    fade.addColorStop(0, withAlpha(color, 0));
    fade.addColorStop(1, withAlpha(color, VISUALS.vignetteAlpha));
    c.fillStyle = fade;
    c.fillRect(0, 0, size, size);
  });
  const rect = fieldRect();
  ctx.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
}

// Limit drawing (until ctx.restore()) to the tiles of the "overlay"
// layer (inside = true) or to everywhere else (inside = false).
function clipToOverlayTiles(inside) {
  const s = field.tileSize;
  ctx.beginPath();
  if (!inside) ctx.rect(0, 0, view.width, view.height); // the whole screen
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (materialAt(col, row).layer === "overlay") {
        const at = tileToScreen(col, row);
        ctx.rect(at.x, at.y, s, s);
      }
    }
  }
  // "evenodd": with the whole screen added, the tiles become holes
  ctx.clip("evenodd");
}

// Draw every map tile whose material is on this layer ("ground",
// "solid" or "overlay", see materials.js). Each material draws itself
// with its own draw function from materials.js, upright at the tile's
// place on screen.
function drawTiles(layer) {
  const s = field.tileSize;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = map[row][col];
      // "drawAs" lets a tile look like another material for a moment
      // (used by the fortify power-up's warning blink)
      const material = MATERIALS[cell.drawAs || cell.material];
      if (!material.draw || material.layer !== layer) continue;
      const at = tileToScreen(col, row);
      material.draw(at.x, at.y, s, cell, col, row);
    }
  }
}

// Which look the player's tank has: "shield" (blue, pulsing glow),
// "armor" (silver, a steady glow) or "normal" (gold). The
// shield wins when both are on. In the shield's last seconds the tank
// switches between blue and the look it goes back to (armor or normal).
function playerLook() {
  const after = upgrades.hasArmor ? "armor" : "normal";
  const shieldLeft = activeEffects.shield || 0;
  if (shieldLeft <= 0) return after;
  const blinking = shieldLeft < PLAYER_LOOKS.shieldWarningTime &&
    Math.floor(shieldLeft / PLAYER_LOOKS.shieldBlinkTime) % 2 === 1;
  return blinking ? after : "shield";
}

function drawPlayer() {
  if (!player.alive) return;
  // While invincible, blink: visible for 0.1s, hidden for 0.1s
  if (player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 10) % 2 === 1) return;

  const { x: cx, y: cy } = mapToScreen(player.x + 0.5, player.y + 0.5);
  const looks = PLAYER_LOOKS;
  const look = playerLook();
  if (look === "shield") {
    drawGlow(cx, cy, looks.shieldGlow, looks.glowSize,
             looks.shieldGlowAlpha * pulse(looks.pulseSpeed, looks.pulseAmount, 0));
    drawTank(player, looks.shield);
  } else if (look === "armor") {
    drawGlow(cx, cy, looks.armorGlow, looks.glowSize, looks.armorGlowAlpha);
    drawTank(player, looks.armor);
  } else {
    drawTank(player);
  }
}

// A number that goes smoothly up and down between 1 - amount and 1, for
// pulsing glows ("phase" shifts it, so not everything pulses together)
function pulse(speed, amount, phase) {
  return 1 - amount * (0.5 + 0.5 * Math.sin(gameTime * speed + phase));
}

// A soft round glow of "color", "size" tiles wide, centered on (cx, cy):
// a cached picture drawn at this opacity (so pulsing only changes alpha)
function drawGlow(cx, cy, color, size, alpha) {
  const width = size * field.tileSize;
  const picture = cachedPicture("glow" + color + size, width, width, (c) => {
    softPatch(c, width / 2, width / 2, width / 2, color, 1);
  });
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(picture, cx - width / 2, cy - width / 2, width, width);
  ctx.globalAlpha = before;
}

// Enemies look faded while the clock power-up has frozen them (on top
// of any fading already set, like under the forest)
function drawEnemies() {
  const before = ctx.globalAlpha;
  if (isEffectActive("clock") || debugFreezeEnemies) ctx.globalAlpha = before * 0.5;
  for (const enemy of enemies) drawTank(enemy);
  ctx.globalAlpha = before;
}

// A round pickup badge for a power-up type, "size" pixels wide,
// centered on (cx, cy). Painted once (paintBadge in powerups.js) and
// copied after that.
function drawBadge(type, cx, cy, size) {
  const picture = cachedPicture("badge" + type + size, size, size, (c) => paintBadge(c, size, type));
  ctx.drawImage(picture, cx - size / 2, cy - size / 2, size, size);
}

// The power-up on the map: its badge floating gently up and down over a
// pulsing glow in its color. Blinks during its last seconds on the map.
function drawPowerUp() {
  if (!powerUp) return;
  const look = PICKUP_LOOKS;
  const timeLeft = POWERUPS.lifetime - powerUp.age;
  if (timeLeft < POWERUPS.blinkTime && Math.floor(powerUp.age * look.blinkRate) % 2 === 1) return;
  const s = field.tileSize;
  const { x: cx, y: cy } = mapToScreen(powerUp.col + 0.5, powerUp.row + 0.5);
  drawGlow(cx, cy, POWERUP_TYPES[powerUp.type].color, look.glowSize,
           look.glowAlpha * pulse(look.pulseSpeed, look.pulseAmount, 0));
  const bob = Math.sin(gameTime * look.bobSpeed) * look.bobHeight * s;
  drawBadge(powerUp.type, cx, cy + bob, s * look.badgeSize);
}

// Active timed power-ups in the HUD, side by side around centerX: a
// small badge each, with a bar under it that shrinks as the time runs
// out. (The shop's armor is an upgrade badge under the display.)
function drawEffectTimers(types, centerX, y, size) {
  const gap = size * 0.25;
  const barHeight = Math.max(2, size * 0.14);
  const totalWidth = types.length * size + (types.length - 1) * gap;
  let x = centerX - totalWidth / 2 + size / 2;

  for (const type of types) {
    drawBadge(type, x, y - barHeight / 2, size * 0.85);

    // Countdown bar under the icon
    const fraction = activeEffects[type] / effectFullTime[type];
    const barY = y + size * 0.42;
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(x - size / 2, barY, size, barHeight);
    ctx.fillStyle = POWERUP_TYPES[type].color;
    ctx.fillRect(x - size / 2, barY, size * fraction, barHeight);
    x += size + gap;
  }
}

function drawBullets() {
  const s = field.tileSize;
  for (const bullet of bullets) {
    const at = mapToScreen(bullet.x, bullet.y);
    ctx.beginPath();
    ctx.arc(at.x, at.y, s * 0.1, 0, Math.PI * 2);
    // Player bullets are white, enemy bullets are a bit red
    // Player bullets are white (orange when armor-piercing), enemy
    // bullets are a bit red
    if (bullet.owner !== player) ctx.fillStyle = "#ffb3a6";
    else ctx.fillStyle = bullet.damage >= ARMOR_PIERCING_DAMAGE ? "#ff9a2e" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
  }
}

// Each explosion is a few circles that grow and fade out (tank and base
// blasts have their own look, drawBlast). A spark is a small burst of
// short bright lines. Nothing is drawn outside the playfield.
function drawExplosions() {
  const s = field.tileSize;
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const boom of explosions) {
    if (boom.kind === "blast") {
      drawBlast(boom);
      continue;
    }
    const progress = boom.age / boom.duration; // 0 = start, 1 = end
    const { x: cx, y: cy } = mapToScreen(boom.x, boom.y);
    const size = s * boom.size;

    ctx.globalAlpha = 1 - progress; // fade out

    // Armor breaking: pieces of the silver ring flying outward, and
    // silver sparks flying out faster between them
    if (boom.kind === "armorBreak") {
      ctx.strokeStyle = PLAYER_LOOKS.armorRing;
      ctx.lineWidth = Math.max(2, s * 0.08);
      const radius = s * (0.55 + progress * 0.5);
      for (let i = 0; i < 8; i++) {
        const start = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + Math.PI / 10);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + 0.3;
        const inner = s * (0.5 + progress * 0.9);
        const outer = inner + s * 0.14 * (1 - progress);
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      }
      ctx.stroke();
      continue;
    }

    if (boom.spark) {
      ctx.strokeStyle = "#fff6b0";
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const inner = size * 0.15;
        const outer = size * (0.4 + progress * 0.4);
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      }
      ctx.stroke();
      continue;
    }

    ctx.fillStyle = "#ff8a1f";      // orange outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.25 + progress * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe066";      // yellow middle
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.15 + progress * 0.25), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";      // white hot center
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.1 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore(); // also puts globalAlpha back
}

// How far something thrown at "speed" (tiles per second) has gone after
// "time" seconds, slowed down by "drag" (bigger = stops sooner)
function glide(speed, drag, time) {
  return speed * (1 - Math.exp(-drag * time)) / drag;
}

// 0 to 1, fast at first and slowing down toward the end
function easeOut(p) {
  return 1 - (1 - p) * (1 - p);
}

// One tank or base blast (addBlast), worked out from its age: warm
// light on the ground, smoke, the pieces flying out from under the
// fireball, the fireball, a flash, sparks and the shock ring. Fire and
// smoke clouds are cached pictures that are only moved, scaled and
// faded.
function drawBlast(boom) {
  const looks = BLAST_LOOKS;
  const s = field.tileSize;
  const t = boom.age;
  const unit = s * boom.size;  // a tile, bigger for the base's blast
  // (Its smoke drifts and pieces fly the same way on screen whether the
  // playfield is turned or not, like the light)
  const { x: cx, y: cy } = mapToScreen(boom.x, boom.y);

  // Warm light on the ground, added to the colors under it
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "lighter";
  if (t < looks.glowTime) {
    drawGlow(cx, cy, looks.glow, looks.glowSize * boom.size, looks.glowAlpha * (1 - t / looks.glowTime));
  }
  ctx.globalCompositeOperation = "source-over";

  // Smoke: grows, spreads and drifts a little to the top-right
  const smoke = cachedPicture("blastSmoke", s, s, (c) => paintPuff(c, s, looks.smoke, looks.smoke, looks.smoke));
  for (const puff of boom.smoke) {
    const p = (t - puff.delay) / puff.life;
    if (p <= 0 || p >= 1) continue;
    const grow = easeOut(p);
    const x = cx + (Math.cos(puff.angle) * puff.distance * grow + 0.25 * p) * unit;
    const y = cy + (Math.sin(puff.angle) * puff.distance * grow - 0.15 * p) * unit;
    const radius = (0.3 + (puff.endRadius - 0.3) * grow) * unit;
    const fade = p < 0.2 ? p / 0.2 : Math.min(1, (1 - p) / 0.6);
    ctx.globalAlpha = looks.smokeAlpha * fade;
    ctx.drawImage(smoke, x - radius, y - radius, radius * 2, radius * 2);
  }

  drawBlastPieces(boom, cx, cy, unit);

  // Fire clouds: they grow, move out and cool from white-hot (stage 0)
  // to dark red (stage 2). The hotter stage is drawn first and the next
  // one over it, stronger as it cools. The outer clouds go first, so
  // the hot middle one is on top.
  const fire = [0, 1, 2].map((i) =>
    cachedPicture("blastFire" + i, s, s, (c) => paintPuff(c, s, ...looks.fire[i])));
  for (let i = boom.fire.length - 1; i >= 0; i--) {
    const puff = boom.fire[i];
    const p = (t - puff.delay) / puff.life;
    if (p <= 0 || p >= 1) continue;
    const grow = easeOut(p);
    const x = cx + Math.cos(puff.angle) * puff.distance * grow * unit;
    const y = cy + Math.sin(puff.angle) * puff.distance * grow * unit;
    const radius = (puff.startRadius + (puff.endRadius - puff.startRadius) * grow) * unit;
    const fade = p < 0.1 ? p / 0.1 : Math.min(1, (1 - p) / 0.4);
    const cooling = Math.min(2, puff.cooled + p * 2);
    const stage = Math.min(1, Math.floor(cooling));
    ctx.globalAlpha = fade;
    ctx.drawImage(fire[stage], x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = fade * (cooling - stage);
    ctx.drawImage(fire[stage + 1], x - radius, y - radius, radius * 2, radius * 2);
  }

  // The flash and the sparks are light: added to what's under them
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  if (t < looks.flashTime) {
    drawGlow(cx, cy, looks.flash, looks.flashSize * boom.size, 1 - t / looks.flashTime);
  }
  ctx.strokeStyle = looks.spark;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.lineCap = "round";
  for (const spark of boom.sparks) {
    if (t >= spark.life) continue;
    // A short streak from where it was a moment ago to where it is now
    const head = glide(spark.speed, 5, t) * unit;
    const tail = glide(spark.speed, 5, Math.max(0, t - 0.05)) * unit;
    const dx = Math.cos(spark.angle);
    const dy = Math.sin(spark.angle);
    ctx.globalAlpha = 1 - t / spark.life;
    ctx.beginPath();
    ctx.moveTo(cx + dx * tail, cy + dy * tail);
    ctx.lineTo(cx + dx * head, cy + dy * head);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.globalCompositeOperation = "source-over";

  // Shock ring: grows fast, thins and fades
  if (t < looks.ringTime) {
    const p = t / looks.ringTime;
    ctx.globalAlpha = 0.7 * (1 - p);
    ctx.strokeStyle = looks.ring;
    ctx.lineWidth = Math.max(1, s * 0.1 * (1 - p));
    ctx.beginPath();
    ctx.arc(cx, cy, (0.3 + (looks.ringSize - 0.3) * easeOut(p)) * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The blast's pieces: thrown up and out of the fireball, spinning, then
// they land and lie still. Higher up = bigger, with the shadow further
// to the bottom-right. They fade out over the blast's last third.
function drawBlastPieces(boom, cx, cy, unit) {
  const t = boom.age;
  const fadeStart = BLAST_LOOKS.time * 0.65;
  const alpha = t < fadeStart ? 1 : (BLAST_LOOKS.time - t) / (BLAST_LOOKS.time - fadeStart);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000000";
  for (const piece of boom.debris) {
    const flying = Math.min(t, piece.flight);
    const distance = glide(piece.speed, 3, flying) * unit;
    const x = cx + Math.cos(piece.angle) * distance;
    const y = cy + Math.sin(piece.angle) * distance;
    const height = Math.sin((Math.PI * flying) / piece.flight);
    const scale = (1 + 0.6 * height) * unit;
    const turn = piece.turn + piece.spin * flying;
    const shadow = (0.04 + 0.25 * height) * unit;

    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = "#000000";
    turnedRectPath(x + shadow, y + shadow, piece.width * scale, piece.height * scale, turn);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = piece.color;
    turnedRectPath(x, y, piece.width * scale, piece.height * scale, turn);
    ctx.fill();
    ctx.stroke();
  }
}

// Path of a w x h rectangle centered on (x, y), turned by "angle"
function turnedRectPath(x, y, w, h, angle) {
  const ax = (Math.cos(angle) * w) / 2;  // half the width, turned
  const ay = (Math.sin(angle) * w) / 2;
  const bx = (-Math.sin(angle) * h) / 2; // half the height, turned
  const by = (Math.cos(angle) * h) / 2;
  ctx.beginPath();
  ctx.moveTo(x - ax - bx, y - ay - by);
  ctx.lineTo(x + ax - bx, y + ay - by);
  ctx.lineTo(x + ax + bx, y + ay + by);
  ctx.lineTo(x - ax + bx, y - ay + by);
  ctx.closePath();
}

// A soft round cloud as wide as the picture, for the blast's fire and
// smoke: three soft lumps in the "outer" color make the edge bumpy, and
// over them one blob goes from "middle" in the center through "inner"
// to "outer", fading out at the edge.
function paintPuff(c, width, middle, inner, outer) {
  const lumps = [[0.34, 0.38, 0.28], [0.66, 0.4, 0.27], [0.5, 0.68, 0.27]]; // x, y, radius (parts of the width)
  for (const [x, y, r] of lumps) {
    const lump = c.createRadialGradient(x * width, y * width, 0, x * width, y * width, r * width);
    lump.addColorStop(0, withAlpha(outer, 0.7));
    lump.addColorStop(1, withAlpha(outer, 0));
    c.fillStyle = lump;
    c.fillRect(0, 0, width, width);
  }
  const mid = width / 2;
  const blob = c.createRadialGradient(mid, mid, 0, mid, mid, mid);
  blob.addColorStop(0, withAlpha(middle, 1));
  blob.addColorStop(0.35, withAlpha(inner, 1));
  blob.addColorStop(0.72, withAlpha(outer, 0.9));
  blob.addColorStop(0.88, withAlpha(outer, 0.45));
  blob.addColorStop(1, withAlpha(outer, 0));
  c.fillStyle = blob;
  c.fillRect(0, 0, width, width);
}

// Scorch marks left by blasts (addBlast), on the floor under walls and
// tanks. They fade out over their last seconds and stay inside the
// playfield.
function drawScorchMarks() {
  if (scorchMarks.length === 0) return;
  const looks = BLAST_LOOKS;
  const s = field.tileSize;
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const mark of scorchMarks) {
    const width = looks.scorchSize * mark.size * s;
    const picture = cachedPicture("scorch" + mark.variant + "," + mark.size, width, width,
      (c) => paintScorch(c, width, mark.variant));
    const left = looks.scorchTime - mark.age;
    const at = mapToScreen(mark.x, mark.y);
    ctx.globalAlpha = looks.scorchAlpha * Math.min(1, left / looks.scorchFade);
    ctx.drawImage(picture, at.x - width / 2, at.y - width / 2, width, width);
  }
  ctx.restore();
}

// A scorch mark "width" wide (3 looks): soot thickest in the middle,
// blotches around it, soot rays thrown out by the blast and a few
// burnt specks
function paintScorch(c, width, variant) {
  const random = makeRandom(variant * 7717 + 13);
  const mid = width / 2;
  softPatch(c, mid, mid, width * 0.34, "#000000", 0.8);
  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2;
    const distance = width * (0.08 + random() * 0.14);
    softPatch(c, mid + Math.cos(angle) * distance, mid + Math.sin(angle) * distance,
              width * (0.1 + random() * 0.1), "#000000", 0.5);
  }
  // Rays: thin dark wedges pointing outward
  c.fillStyle = "rgba(0, 0, 0, 0.4)";
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + random() * 0.5;
    const spread = 0.05 + random() * 0.06;
    const inner = width * 0.12;
    const length = width * (0.3 + random() * 0.17);
    c.beginPath();
    c.moveTo(mid + Math.cos(angle - spread) * inner, mid + Math.sin(angle - spread) * inner);
    c.lineTo(mid + Math.cos(angle) * length, mid + Math.sin(angle) * length);
    c.lineTo(mid + Math.cos(angle + spread) * inner, mid + Math.sin(angle + spread) * inner);
    c.closePath();
    c.fill();
  }
  c.fillStyle = "rgba(0, 0, 0, 0.55)";
  for (let i = 0; i < 10; i++) {
    const angle = random() * Math.PI * 2;
    const distance = width * (0.15 + random() * 0.3);
    c.beginPath();
    c.arc(mid + Math.cos(angle) * distance, mid + Math.sin(angle) * distance,
          width * (0.008 + random() * 0.012), 0, Math.PI * 2);
    c.fill();
  }
}

// Normal tank shape (the player uses this; enemy types can change it)
const NORMAL_LOOK = { width: 1, turret: 1, barrel: 1 };

// A tank with a soft shadow under it. Its picture (one per look, colors
// and direction) is painted once by paintTank and copied after that.
// On the playfield it points the way its map direction looks on screen
// (turned with the playfield in landscape).
// "lookColors" (optional) replaces its colors, e.g. the player's shield
// or armor look (PLAYER_LOOKS).
// "place" (optional, e.g. the shop's preview) draws it elsewhere:
// { x, y, size } in pixels instead of on its tile, as it faces.
function drawTank(tank, lookColors, place) {
  const s = place ? place.size : field.tileSize; // the tank is one tile big
  // White for a moment after being hit, otherwise its own colors
  // Power-up carriers blink white all the time
  const carrierBlink = tank.carriesPowerUp && Math.floor(gameTime * 6) % 2 === 1;
  const colors = tank.flashTimer > 0 || carrierBlink ? FLASH_COLORS : lookColors || tank.colors;
  const look = tank.look || NORMAL_LOOK;
  const at = place || tileToScreen(tank.x, tank.y);
  const facing = place ? tank.facing : directionOnScreen(tank.facing);

  drawSoftShadow(at.x, at.y, VISUALS.tankShadowSize, VISUALS.tankShadowAlpha, place ? s : undefined);

  const key = "tank" + look.width + "," + look.turret + "," + look.barrel +
    colors.body + colors.track + colors.turret + colors.outline + facing + (place ? s : "");
  const picture = cachedPicture(key, s, s, (c) => paintTank(c, s, look, colors, facing));
  ctx.drawImage(picture, at.x, at.y, s, s);
}

// A point given for a tank pointing up (around its center), turned to
// "facing" (a quarter turn clockwise for "right", and so on)
function turnPoint(x, y, facing) {
  if (facing === "right") return { x: -y, y: x };
  if (facing === "down") return { x: -x, y: -y };
  if (facing === "left") return { x: y, y: -x };
  return { x, y };
}

// The same for a rectangle (quarter turns keep it a rectangle)
function turnRect(left, top, width, height, facing) {
  const a = turnPoint(left, top, facing);
  const b = turnPoint(left + width, top + height, facing);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

// Paint a tank seen from above on context c (a tile-sized picture):
// dark tracks with tread lines, a square hull, a short thick cannon and
// a round turret. The shapes are laid out pointing up and turned to
// "facing" before painting, so the light always comes from the top-left
// (light top/left edges, dark bottom/right edges, a shine on the turret).
// Sizes are tile fractions; "look" makes it slimmer or bulkier.
function paintTank(c, s, look, colors, facing) {
  const outline = colors.outline;
  const edge = Math.max(1, s * 0.035); // width of the light and dark edges
  c.translate(s / 2, s / 2);            // (0, 0) = the tank's center
  c.lineWidth = Math.max(1, s * 0.03);
  c.lineJoin = "round";
  c.strokeStyle = outline;

  // A plain rectangle, turned to "facing"
  function plain(left, top, width, height, color) {
    const r = turnRect(left * s, top * s, width * s, height * s, facing);
    c.fillStyle = color;
    c.fillRect(r.x, r.y, r.w, r.h);
    return r;
  }
  // A rectangle with light top/left and dark bottom/right edges
  function block(left, top, width, height, color) {
    const r = plain(left, top, width, height, color);
    c.fillStyle = mixColors(color, "#ffffff", 0.3);
    c.fillRect(r.x, r.y, r.w, edge);
    c.fillRect(r.x, r.y, edge, r.h);
    c.fillStyle = mixColors(color, outline, 0.45);
    c.fillRect(r.x, r.y + r.h - edge, r.w, edge);
    c.fillRect(r.x + r.w - edge, r.y, edge, r.h);
    return r;
  }

  const width = look.width;

  // Tracks: dark, with lighter tread lines across, then an outline
  const outer = 0.43 * width;  // outside edge of the tracks
  const inner = 0.28 * width;  // inside edge
  const tread = mixColors(colors.track, "#ffffff", 0.22);
  const treadThickness = Math.max(1, s * 0.025) / s;
  for (const left of [-outer, inner]) {
    const r = block(left, -0.44, outer - inner, 0.88, colors.track);
    for (let i = 1; i < 8; i++) {
      plain(left, -0.44 + i * 0.11 - treadThickness / 2, outer - inner, treadThickness, tread);
    }
    c.strokeRect(r.x, r.y, r.w, r.h);
  }

  // Hull: a square plate between the tracks, a darker engine deck at the back
  const hullHalf = 0.29 * width;
  const hull = block(-hullHalf, -0.34, hullHalf * 2, 0.68, colors.body);
  c.strokeRect(hull.x, hull.y, hull.w, hull.h);
  plain(-hullHalf * 0.6, 0.2, hullHalf * 1.2, 0.08, mixColors(colors.body, outline, 0.35));

  // Cannon: short and thick, with a wider muzzle at the tip
  const barrelColor = mixColors(colors.turret, outline, 0.25);
  const barrelHalf = 0.065 * look.barrel;
  const barrel = block(-barrelHalf, -0.42, barrelHalf * 2, 0.45, barrelColor);
  c.strokeRect(barrel.x, barrel.y, barrel.w, barrel.h);
  const muzzle = block(-barrelHalf * 1.4, -0.48, barrelHalf * 2.8, 0.09, barrelColor);
  c.strokeRect(muzzle.x, muzzle.y, muzzle.w, muzzle.h);

  // Round turret, shaded like a ball lit from the top-left
  const radius = 0.17 * look.turret * s;
  const center = turnPoint(0, 0.03 * s, facing);
  const shine = c.createRadialGradient(center.x - radius * 0.4, center.y - radius * 0.4, radius * 0.1,
                                       center.x, center.y, radius);
  shine.addColorStop(0, mixColors(colors.turret, "#ffffff", 0.4));
  shine.addColorStop(0.55, colors.turret);
  shine.addColorStop(1, mixColors(colors.turret, outline, 0.4));
  c.beginPath();
  c.arc(center.x, center.y, radius, 0, Math.PI * 2);
  c.fillStyle = shine;
  c.fill();
  c.stroke();

  // Small hatch on the turret, a bit to the back
  const hatch = turnPoint(0.04 * look.turret * s, (0.03 + 0.06 * look.turret) * s, facing);
  c.beginPath();
  c.arc(hatch.x, hatch.y, 0.045 * look.turret * s, 0, Math.PI * 2);
  c.fillStyle = mixColors(colors.turret, outline, 0.35);
  c.fill();
}

// Where the HUD goes (set with the layout): a framed display ("face"
// is the dark screen inside the frame) and the row for the upgrade
// badges. The row's room is kept even while it's empty, so the display
// doesn't move when a badge shows up.
function hudLayout() {
  return controlZone.hudLayout;
}

// Portrait: in the middle part of the control zone, the display with the
// badge row under it. The display is at most 0.6 times as tall as it is
// wide; both are centered up and down.
function portraitHudLayout(hud, margin) {
  const width = hud.width - margin * 2;
  const height = hud.height - margin * 2;
  const rowHeight = Math.min(height * CONTROL_ZONE.badgeRowShare, CONTROL_ZONE.badgeRowMax);
  const displayHeight = Math.max(0, Math.min(height - rowHeight - margin, width * 0.6));
  const total = displayHeight + margin + rowHeight;
  const display = { x: hud.x + margin, y: hud.y + (hud.height - total) / 2, width, height: displayHeight };
  const frame = Math.max(3, Math.min(width, displayHeight) * 0.07);
  const face = {
    x: display.x + frame, y: display.y + frame,
    width: display.width - frame * 2, height: display.height - frame * 2,
  };
  const badgeRow = { x: display.x, y: display.y + displayHeight + margin, width, height: rowHeight };
  return { display, face, badgeRow };
}

// --- Landscape HUD in the side area ---
// A framed display at the top of the side area, with the badge row
// under it. It has two arrangements, and uses the one with the bigger
// text:
//   one column      two columns
//   LV 3            LV 3      (heart) 3
//   SCORE           SCORE     (coin) 85
//   120             120       (tank) 10
//   (heart) 3          [effect timers]
//   (coin) 85
//   (tank) 10
//   [effect timers]
// Sizes of the dark screen inside the frame, in font sizes (padding
// included). The row heights are in drawSideHudText.
const SIDE_HUD = {
  1: { width: 5.4, height: 10.4 },
  2: { width: 10.4, height: 6.6 },
};

// The side HUD's size: the biggest font (from hudFontMax down to
// hudFontMin) at which the display fits maxWidth and, with the badge row
// under it, "room" pixels of height. The display is as wide as its text
// needs, but at least minWidth (the control's width). Null if nothing fits.
function sideHudSize(maxWidth, minWidth, room) {
  const L = LANDSCAPE;
  let best = null;
  for (const columns of [1, 2]) {
    const em = SIDE_HUD[columns];
    for (let font = L.hudFontMax; font >= L.hudFontMin; font -= 0.5) {
      const frame = Math.max(3, Math.round(font * 0.6));
      const needed = em.width * font + frame * 2;
      if (needed > maxWidth) continue;
      const width = Math.max(minWidth, needed);
      const height = em.height * font + frame * 2;
      const rowHeight = badgeRowHeight(width);
      if (height + L.spacing + rowHeight > room) continue;
      if (!best || font > best.font) best = { columns, font, frame, width, height, rowHeight };
      break;
    }
  }
  return best;
}

// The badge row's height for a row "width" pixels wide: all the badges
// fit side by side, and at most badgeRowMax
function badgeRowHeight(width) {
  const count = UPGRADE_BADGES.length;
  return Math.min(width / (count + (count - 1) * BADGE_ROW.gap), CONTROL_ZONE.badgeRowMax);
}

// The side HUD's rectangles (sideHudSize), centered on x = centerX,
// from y = top down
function placeSideHud(size, centerX, top) {
  const display = { x: centerX - size.width / 2, y: top, width: size.width, height: size.height };
  const badgeRow = { x: display.x, y: top + size.height + LANDSCAPE.spacing, width: size.width, height: size.rowHeight };
  return { display, face: growRect(display, -size.frame), badgeRow, columns: size.columns, font: size.font };
}

// The HUD strip (overlay layout): a framed display along the strip for
// one row of text, and the badge row at its right end
function stripHudLayout(strip) {
  const count = UPGRADE_BADGES.length;
  const rowWidth = strip.height * (count + (count - 1) * BADGE_ROW.gap);
  const display = { x: strip.x, y: strip.y, width: strip.width - rowWidth - LANDSCAPE.spacing, height: strip.height };
  const badgeRow = { x: display.x + display.width + LANDSCAPE.spacing, y: strip.y, width: rowWidth, height: strip.height };
  return { display, face: growRect(display, -Math.max(3, strip.height * 0.12)), badgeRow };
}

// The HUD's counters, each "icon number": lives, gold, enemies left
function hudCounters() {
  const enemiesLeft = currentLevel().enemies.length - enemiesDestroyed;
  return [
    { icon: drawLifeIcon, text: String(lives), color: PLAYER_COLORS.body },
    { icon: drawCoinIcon, text: String(gold), color: "#f5c542" },
    { icon: drawEnemyIcon, text: String(enemiesLeft), color: ENEMY_TYPES.basic.colors.turret },
  ];
}

// The HUD: a dark display in a metal frame (cached) with the text drawn
// on it, and the upgrade badges in their row. Portrait: in the middle
// part of the control zone; landscape: at the top of the side area;
// overlay: a strip above the playfield.
function drawHud() {
  drawDebugTags();

  const layout = hudLayout();
  const display = layout.display;
  const face = layout.face;
  if (face.width <= 0 || face.height <= 0) return;
  const frame = cachedPicture("display" + display.width + "x" + display.height, display.width, display.height,
    (c) => paintFramedScreen(c, display.width, display.height, face.x - display.x));
  ctx.drawImage(frame, display.x, display.y, display.width, display.height);
  drawHudUpgradeBadges(layout.badgeRow);

  if (controlZone.mode === "portrait") {
    drawPortraitHudText(face, controlZone.hud);
  } else {
    // A short line in the theme's accent color just above the display
    drawAccentLine(display.x + display.width * 0.3, display.x + display.width * 0.7,
                   display.y - LANDSCAPE.spacing / 2);
    if (controlZone.mode === "landscape") drawSideHudText(layout);
    else drawStripHudText(face);
  }
}

// A short line in the theme's accent color (along the top of the HUD)
function drawAccentLine(left, right, y) {
  ctx.strokeStyle = currentTheme().accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Portrait HUD text, two rows:
//   LV 1      [effect timers]      SCORE 120
//   (heart) 3     (coin) 85     (tank) 10
// Everything is sized from one font size, which shrinks if the rows
// don't fit (narrow screens), so it never spills onto the controls.
function drawPortraitHudText(face, hud) {
  const pad = Math.min(face.width, face.height) * 0.1;
  const left = face.x + pad;
  const right = face.x + face.width - pad;
  const width = right - left;
  if (width <= 0) return;

  const effects = hudEffects();
  const row1Left = "LV " + (levelIndex + 1);
  const row1Right = "SCORE " + score;
  const row2 = hudCounters();

  // Widths at a given font size (icons are "size * 1.2" wide)
  const measure = (size) => {
    ctx.font = "bold " + size + "px sans-serif";
    const gap = size;
    const textWidth = (t) => ctx.measureText(t).width;
    const effectsWidth = effects.length ? effects.length * size * 1.5 + gap : 0;
    const row1 = textWidth(row1Left) + gap + effectsWidth + textWidth(row1Right);
    const row2Width = row2.reduce((sum, item) => sum + size * 1.5 + textWidth(item.text), 0) + gap * 2;
    return Math.max(row1, row2Width);
  };

  // Start from a size that fits the screen's height, shrink to fit the width
  let size = Math.min(face.height * 0.27, 24);
  size = Math.max(6, Math.floor(size * Math.min(1, width / measure(size))));
  ctx.font = "bold " + size + "px sans-serif";
  ctx.textBaseline = "middle";

  const centerY = face.y + face.height / 2;
  const row1Y = centerY - size * 0.85;
  const row2Y = centerY + size * 0.85;

  // A short line in the theme's accent color along the top of the panel
  drawAccentLine(hud.x + hud.width * 0.3, hud.x + hud.width * 0.7, hud.y + 1);

  // Row 1: level on the left (accent color), score on the right,
  // effects between
  ctx.fillStyle = currentTheme().accent;
  ctx.textAlign = "left";
  ctx.fillText(row1Left, left, row1Y);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText(row1Right, right, row1Y);
  const leftEnd = left + ctx.measureText(row1Left).width;
  const rightStart = right - ctx.measureText(row1Right).width;
  drawEffectTimers(effects, (leftEnd + rightStart) / 2, row1Y, size * 1.2);

  // Row 2: three "icon number" items: left, middle, right
  ctx.font = "bold " + size + "px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  row2.forEach((item, i) => {
    const itemWidth = size * 1.5 + ctx.measureText(item.text).width;
    const x = i === 0 ? left : i === 1 ? (left + right - itemWidth) / 2 : right - itemWidth;
    item.icon(x + size * 0.6, row2Y, size * 1.6);
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, x + size * 1.5, row2Y);
  });
}

// Landscape HUD text in its column(s) (see SIDE_HUD), at the font size
// set with the layout; a text that has grown too wide (a big score) is
// drawn smaller
function drawSideHudText(layout) {
  const face = layout.face;
  const f = layout.font;
  const pad = f * 0.5;
  const twoColumns = layout.columns === 2;
  const columnWidth = twoColumns ? (face.width - pad * 3) / 2 : face.width - pad * 2;
  const leftX = face.x + pad;
  const rightX = leftX + columnWidth + pad;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const text = (value, x, y, size, color) => {
    ctx.font = "bold " + Math.round(fitTextSize(value, size, columnWidth)) + "px sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const counter = (item, x, y) => {
    item.icon(x + f * 0.6, y, f * 1.6);
    ctx.font = "bold " + Math.round(fitTextSize(item.text, f, columnWidth - f * 1.5)) + "px sans-serif";
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, x + f * 1.5, y);
  };

  // Rows from the top, each { height (in font sizes), draw at its middle y }
  const counters = hudCounters();
  const rows = [
    { height: 1.4, draw: (y) => text("LV " + (levelIndex + 1), leftX, y, f, currentTheme().accent) },
    { height: twoColumns ? 1.4 : 1.0, draw: (y) => text("SCORE", leftX, y, f * 0.6, "#c9ced6") },
    { height: 1.4, draw: (y) => text(String(score), leftX, y, f, "#ffffff") },
  ];
  if (twoColumns) {
    counters.forEach((item, i) => {
      const draw = rows[i].draw;
      rows[i].draw = (y) => { draw(y); counter(item, rightX, y); };
    });
  } else {
    for (const item of counters) rows.push({ height: 1.4, draw: (y) => counter(item, leftX, y) });
  }
  rows.push({ height: 1.6, draw: (y) => drawEffectTimers(hudEffects(), face.x + face.width / 2, y, f * 1.1) });

  let y = face.y + f * 0.4;
  for (const row of rows) {
    row.draw(y + (row.height * f) / 2);
    y += row.height * f;
  }
}

// HUD strip text (overlay layout), one row spread across the strip:
//   LV 1   [effect timers]   SCORE 120   (heart) 3   (coin) 85   (tank) 10
// at a font size that fits the strip's height, smaller if the row
// doesn't fit its width
function drawStripHudText(face) {
  const pad = face.height * 0.25;
  const width = face.width - pad * 2;
  if (width <= 0) return;
  const effects = hudEffects();
  const counters = hudCounters();
  const level = "LV " + (levelIndex + 1);
  const scoreText = "SCORE " + score;

  // The pieces' widths at a font size (counters: icon and number)
  const widths = (size) => {
    ctx.font = "bold " + size + "px sans-serif";
    const list = [ctx.measureText(level).width];
    if (effects.length) list.push(effects.length * size * 1.5);
    list.push(ctx.measureText(scoreText).width);
    for (const item of counters) list.push(size * 1.5 + ctx.measureText(item.text).width);
    return list;
  };
  const total = (list, size) => list.reduce((sum, w) => sum + w, 0) + size * (list.length - 1);
  let size = Math.min(face.height * 0.6, LANDSCAPE.hudFontMax);
  size = Math.max(6, Math.floor(size * Math.min(1, width / total(widths(size), size))));
  const list = widths(size);
  const gap = (width - total(list, size)) / (list.length - 1) + size; // spread out to fill the row

  const y = face.y + face.height / 2;
  let x = face.x + pad;
  let i = 0;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "bold " + size + "px sans-serif";
  ctx.fillStyle = currentTheme().accent;
  ctx.fillText(level, x, y);
  x += list[i++] + gap;
  if (effects.length) {
    drawEffectTimers(effects, x + list[i] / 2, y, size * 1.2);
    x += list[i++] + gap;
    ctx.font = "bold " + size + "px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(scoreText, x, y);
  x += list[i++] + gap;
  for (const item of counters) {
    item.icon(x + size * 0.6, y, size * 1.6);
    ctx.fillStyle = item.color;
    ctx.fillText(item.text, x + size * 1.5, y);
    x += list[i++] + gap;
  }
}

// Effects shown on the HUD display: the timed power-ups that are running
function hudEffects() {
  return Object.keys(activeEffects);
}

// --- Upgrade badges (UPGRADE_BADGES in shop.js) ---
// A row under the HUD display, and the same badges with their names in
// the pause menu (pause.js). Each badge is a cached picture per tier
// and size (paintUpgradeBadge); a change makes it flash brighter for
// BADGE_ROW.flashTime by drawing the same picture again on top.

// What each badge showed when the HUD last drew it (its tier, 0 = no
// badge), the tier before that, and when it changed (gameTime). This is
// checked as the HUD is drawn, not when an upgrade changes, so a badge
// bought in the shop (which covers the HUD) flashes when the HUD shows
// again.
const badgeSeen = {};
for (const badge of UPGRADE_BADGES) badgeSeen[badge.id] = { tier: 0, before: 0, changedAt: -Infinity };

// The badges for the HUD row: the ones held, and one just lost (armor
// broken, base steel used) for as long as it flashes, fading out.
// Each: { badge, tier, flash (0-1), alpha }
function hudUpgradeBadges() {
  const shown = [];
  for (const badge of UPGRADE_BADGES) {
    const seen = badgeSeen[badge.id];
    const tier = badge.tier();
    if (tier !== seen.tier) {
      seen.before = seen.tier;
      seen.tier = tier;
      seen.changedAt = gameTime;
    }
    const t = (gameTime - seen.changedAt) / BADGE_ROW.flashTime; // 0 to 1 while flashing
    const flash = t < 1 ? Math.sin(Math.PI * t) : 0;               // up and back down
    if (tier > 0) shown.push({ badge, tier, flash, alpha: 1 });
    else if (t < 1 && seen.before > 0) shown.push({ badge, tier: seen.before, flash, alpha: 1 - t });
  }
  return shown;
}

// The badges the player holds now (pause menu), as { badge, tier }
function heldUpgradeBadges() {
  return UPGRADE_BADGES.filter((badge) => badge.tier() > 0).map((badge) => ({ badge, tier: badge.tier() }));
}

// The HUD's badge row, centered in "row". The badge size fits all the
// badges at once, so a new one doesn't make the others smaller. Nothing
// is drawn while the player holds none.
function drawHudUpgradeBadges(row) {
  const shown = hudUpgradeBadges();
  if (shown.length === 0) return;
  const count = UPGRADE_BADGES.length;
  const size = Math.floor(Math.min(row.height, row.width / (count + (count - 1) * BADGE_ROW.gap)));
  if (size < 6) return;
  const gap = size * BADGE_ROW.gap;
  const total = shown.length * size + (shown.length - 1) * gap;
  const left = row.x + (row.width - total) / 2;
  const y = row.y + (row.height - size) / 2;
  shown.forEach((item, i) => {
    drawUpgradeBadge(item.badge, item.tier, left + i * (size + gap), y, size, item.flash, item.alpha);
  });
}

// One upgrade badge with its top-left at (x, y), "size" pixels square
// (on whole device pixels, so it stays sharp). "flash" (0-1) brightens
// it: the picture is added on top of itself ("lighter").
function drawUpgradeBadge(badge, tier, x, y, size, flash, alpha) {
  const ratio = window.devicePixelRatio || 1;
  const left = Math.round(x * ratio) / ratio;
  const top = Math.round(y * ratio) / ratio;
  const picture = cachedPicture("upgrade" + badge.id + tier + "_" + size, size, size,
    (c) => paintUpgradeBadge(c, size, badge, tier));
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  ctx.drawImage(picture, left, top, size, size);
  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = before * alpha * flash * BADGE_ROW.flashStrength;
    ctx.drawImage(picture, left, top, size, size);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = before;
}

// Small gold coin (HUD): the same coin picture as on the map
function drawCoinIcon(cx, cy, size) {
  const width = size * 0.5;
  ctx.drawImage(coinPicture(width), cx - width / 2, cy - width / 2, width, width);
}

// Small enemy tank seen from above (HUD): body with a turret
function drawEnemyIcon(cx, cy, size) {
  const colors = ENEMY_TYPES.basic.colors;
  const body = size * 0.5;
  ctx.fillStyle = colors.body;
  ctx.fillRect(cx - body / 2, cy - body / 2, body, body);
  ctx.fillStyle = colors.turret;
  ctx.fillRect(cx - body * 0.2, cy - body * 0.2, body * 0.4, body * 0.4);
  ctx.fillRect(cx - body * 0.07, cy - body * 0.75, body * 0.14, body * 0.55);
}

// Where the level summary goes (overlayFrame): from the top of its
// title plate to the bottom of the CONTINUE button
function summaryFrame() {
  return overlayFrame(-6.0, 6.7);
}

// Place the screen button under the level summary's panel (landscape:
// in its right column)
function layoutScreenButton() {
  if (isTwoColumnLayout()) {
    const b = summaryColumns().button;
    screenButton.x = b.x;
    screenButton.y = b.y;
    screenButton.width = b.width;
    screenButton.height = b.height;
    return;
  }
  const { s, cx, cy } = summaryFrame();
  screenButton.width = s * 6;
  screenButton.height = buttonHeight(s * 1.6);
  screenButton.x = cx - screenButton.width / 2;
  screenButton.y = cy + s * 5;
}

// The gold CONTINUE button on the level summary (ui.js): dimmed until
// it can be used
function drawScreenButton() {
  layoutScreenButton();
  const ready = screenButtonReady();
  ctx.globalAlpha = ready ? 1 : 0.35;
  drawUiButton(screenButton, "CONTINUE", true, false, ready);
  ctx.globalAlpha = 1;
}

// An engraved line across a panel (dark, with a faint light line under it)
function drawPanelDivider(left, right, y) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(left, Math.round(y) - 1, right - left, 1);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(left, Math.round(y), right - left, 1);
}

// One row on a panel: label on the left, value on the right, and a
// small coin before the value if "coin" is set
function drawPanelRow(label, value, left, right, y, size, labelColor, valueColor, coin) {
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = labelColor;
  ctx.fillText(label, left, y);
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.fillText(value, right, y);
  if (coin) {
    const coinSize = size * 1.05;
    const x = right - ctx.measureText(value).width - size * 0.35 - coinSize;
    ctx.drawImage(coinPicture(coinSize), x, y - coinSize / 2, coinSize, coinSize);
  }
}

// The summary's rows as [label, value, coin, labelColor, valueColor]:
// what you destroyed and the gold you got (earned bonuses in gold with a
// coin, missed ones greyed out with 0), and the two totals
function summaryRows() {
  const stats = levelStats;
  const rows = [
    ["Enemies destroyed", String(stats.enemiesDestroyed), false, "#ffffff", "#ffffff"],
    ["Gold from coins", "+" + stats.coinGold, true, "#e8dcc0", "#f5c542"],
  ];
  for (const bonus of stats.bonuses) {
    if (bonus.gold > 0) rows.push([bonus.label, "+" + bonus.gold, true, "#e8dcc0", "#f5c542"]);
    else rows.push([bonus.label, "0", false, "#8d929b", "#8d929b"]); // grey, still 4.5:1 on the panel
  }
  const totals = [
    ["Gold this level", "+" + stats.totalGold, true, "#ffe27a", "#ffe27a"],
    ["Your gold", String(gold), true, "#ffffff", "#ffffff"],
  ];
  return { rows, totals };
}

// Summary after each level: a framed panel with the title on a plate
// across its top edge, the table of what you destroyed and the gold
// you got, the totals on a faint gold strip, and the CONTINUE button
// (landscape: in two columns, drawSummaryColumns)
function drawLevelSummary() {
  if (isTwoColumnLayout()) {
    drawSummaryColumns();
    return;
  }
  const { s, cx, cy } = summaryFrame();
  const panel = { x: cx - s * (GRID_COLS / 2 - 0.6), y: cy - s * 5.2, width: s * (GRID_COLS - 1.2), height: s * 7.8 };
  const { rows, totals } = summaryRows();

  drawDimmer(0.7);
  const frame = drawFramedPanel(panel.x, panel.y, panel.width, panel.height);
  drawTitlePlate("LEVEL " + (levelIndex + 1) + " COMPLETE", cx, panel.y, s * 0.8, "#7ee081", panel.width - s * 0.4);

  const left = panel.x + frame + s * 0.45;
  const right = panel.x + panel.width - frame - s * 0.45;
  const size = s * 0.52;
  let y = cy - s * 4;
  const row = ([label, value, coin, labelColor, valueColor]) => {
    drawPanelRow(label, value, left, right, y, size, labelColor, valueColor, coin);
    y += s * 0.95;
  };

  rows.forEach(row);

  // Divider, then the totals on a faint gold strip
  drawPanelDivider(left, right, y - s * 0.45);
  y += s * 0.1;
  ctx.fillStyle = "rgba(245, 197, 66, 0.1)";
  ctx.fillRect(left - s * 0.2, y - s * 0.42, right - left + s * 0.4, s * 1.79);
  totals.forEach(row);

  drawScreenButton();
}

// Landscape: the summary in two columns (fitTwoColumnPanel): the rows on
// the left, one line each; on the right the totals on the faint gold
// strip and CONTINUE under them. Each column is centered in the height
// of the taller one. All rows use one font size that fits both columns.
function summaryColumns() {
  const { rows, totals } = summaryRows();
  return fitTwoColumnPanel((z, panel) => {
    const { left, right } = panel;
    const inset = z.len(0.2); // the strip reaches this far around the totals
    const font = Math.min(panelRowFont(rows, left.width, z.text(0.48)),
                          panelRowFont(totals, right.width - inset * 2, z.text(0.48)));
    const pitch = Math.max(z.len(0.78), font * 1.4);
    const leftHeight = rows.length * pitch;
    const strip = totals.length * pitch + inset;
    const buttonHeight = z.touch(1.6);
    const rightHeight = strip + z.len(0.45) + buttonHeight;

    const height = Math.max(leftHeight, rightHeight);
    const leftTop = panel.top + (height - leftHeight) / 2;
    const rightTop = panel.top + (height - rightHeight) / 2;
    return {
      height, font, rows, totals, inset,
      rowY: (i) => leftTop + pitch * (i + 0.5),
      totalY: (i) => rightTop + inset / 2 + pitch * (i + 0.5),
      strip: { x: right.x, y: rightTop, width: right.width, height: strip },
      button: { x: right.x, y: rightTop + strip + z.len(0.45), width: right.width, height: buttonHeight },
    };
  });
}

function drawSummaryColumns() {
  const m = summaryColumns();
  const p = m.panel;
  const left = p.left.x;

  drawDimmer(0.7);
  drawFramedPanel(p.x, p.y, p.width, p.height);
  drawTitlePlate("LEVEL " + (levelIndex + 1) + " COMPLETE", p.x + p.width / 2, p.y, p.titleSize, "#7ee081", p.width);

  m.rows.forEach(([label, value, coin, labelColor, valueColor], i) => {
    drawPanelRow(label, value, left, left + p.left.width, m.rowY(i), m.font, labelColor, valueColor, coin);
  });

  const strip = m.strip;
  ctx.fillStyle = "rgba(245, 197, 66, 0.1)";
  ctx.fillRect(strip.x, strip.y, strip.width, strip.height);
  m.totals.forEach(([label, value, coin, labelColor, valueColor], i) => {
    drawPanelRow(label, value, strip.x + m.inset, strip.x + strip.width - m.inset, m.totalY(i), m.font, labelColor, valueColor, coin);
  });

  drawScreenButton();
}

// "LEVEL X" shown over the map for a moment before the level starts
// (in the middle of the playfield, text never turned)
function drawLevelIntro() {
  const s = field.tileSize;
  const rect = fieldRect();
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, view.width, view.height);

  drawOutlinedText("LEVEL " + (levelIndex + 1), cx, cy - s * 0.9, s * 1.6, "#ffffff");
  drawOutlinedText(currentLevel().name, cx, cy + s * 0.4, s * 0.7, "#c9ced6");
  drawOutlinedText("GET READY", cx, cy + s * 1.4, s * 0.6, PLAYER_COLORS.body);
}

// "World 2: Jungle" shown over the new map when the theme changes
function drawWorldIntro() {
  const s = field.tileSize;
  const rect = fieldRect();
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const theme = currentTheme();

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, view.width, view.height);

  drawOutlinedText("World " + currentLevel().world + ": " + theme.name, cx, cy - s * 0.5, s * 1.2, theme.accent);
}

// Draw text with a dark outline so it's readable on anything
function drawOutlinedText(text, x, y, size, color) {
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = color;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

// Title and color for each end screen
const END_SCREEN_TITLES = {
  [GAME_STATE.LOST]: { text: "GAME OVER", color: "#ff4a3d" },
};

// A label with a big number under it, centered (scores on the end screens)
function drawPanelScore(label, value, cx, y, s) {
  drawOutlinedText(label, cx, y, s * 0.45, "#c9ced6");
  drawOutlinedText(value, cx, y + s * 0.85, s * 0.95, "#ffffff");
}

// End screen (lost): the broken star plate over a framed panel with
// "GAME OVER" on a plate across its top edge, why the game was lost
// (if it was the base), the final score, the records and the buttons
// (landscape: in two columns, drawGameOverColumns)
function drawEndScreen() {
  if (isTwoColumnLayout()) {
    drawGameOverColumns();
    return;
  }
  const { s, cx, cy } = gameOverFrame();
  const title = END_SCREEN_TITLES[gameState];
  const panel = { x: cx - s * (GRID_COLS / 2 - 1.2), y: cy - s * 2.6, width: s * (GRID_COLS - 2.4), height: s * 5.4 };

  drawDimmer(0.65);
  drawStarEmblem(cx, cy - s * 4.9, s * 2.6, true);
  const frame = drawFramedPanel(panel.x, panel.y, panel.width, panel.height);
  drawTitlePlate(title.text, cx, panel.y, s * 1.0, title.color, panel.width + s * 1.2);

  if (gameState === GAME_STATE.LOST && baseDestroyed) {
    drawOutlinedText("Your base was destroyed", cx, panel.y + s * 1.3, s * 0.5, "#ffd2c9");
  }
  drawPanelScore("FINAL SCORE", String(score), cx, panel.y + s * 2.1, s);

  // Records (save.js)
  const left = panel.x + frame + s * 0.45;
  const right = panel.x + panel.width - frame - s * 0.45;
  drawPanelDivider(left, right, panel.y + s * 3.55);
  drawPanelRow("BEST SCORE", String(progress.bestScore), left, right, panel.y + s * 4.05, s * 0.45, "#c9ced6", "#ffffff", false);
  drawPanelRow("HIGHEST LEVEL", String(progress.highestLevel), left, right, panel.y + s * 4.65, s * 0.45, "#c9ced6", "#ffffff", false);

  drawGameOverButtons();
}

// Landscape: the game over screen in two columns (fitTwoColumnPanel).
// Left: the broken star plate beside the final score, why the game was
// lost (if it was the base) and the records. Right: the buttons, with
// room under the ad button for the ad line. The right column is the
// wider one, so the buttons' second lines stay readable.
function gameOverColumns() {
  const items = gameOverButtonItems();
  return fitTwoColumnPanel((z, panel) => {
    // A two-line button's second line is a quarter of its height
    // (drawUiButtonTwoLines in ui.js), so it is at least minText * 4 tall
    const buttonHeight = Math.max(LANDSCAPE.minText * 4, z.touch(1.7));
    const statusFont = z.text(0.45);
    const gap = Math.max(z.len(0.9), statusFont * 1.8);
    const rightHeight = items.length * buttonHeight + (items.length - 1) * gap;

    const font = z.text(0.45);
    const pitch = Math.max(z.len(0.65), font * 1.35);
    const emblem = z.len(1.9);
    const scoreFont = z.text(0.95);
    const scoreBlock = Math.max(emblem, font * 1.3 + scoreFont * 1.2);
    const reason = gameState === GAME_STATE.LOST && baseDestroyed ? pitch : 0;
    const leftHeight = scoreBlock + z.len(0.15) + reason + z.len(0.3) + pitch * 2;

    const height = Math.max(leftHeight, rightHeight);
    const rightTop = panel.top + (height - rightHeight) / 2;
    const leftTop = panel.top + (height - leftHeight) / 2;
    const recordsTop = leftTop + scoreBlock + z.len(0.15) + reason + z.len(0.3);
    return {
      height, font, scoreFont, statusFont,
      buttons: items.map((b, i) => ({
        ...b, x: panel.right.x, y: rightTop + i * (buttonHeight + gap), width: panel.right.width, height: buttonHeight,
      })),
      emblem: { x: panel.left.x, y: leftTop + (scoreBlock - emblem) / 2, size: emblem },
      score: { left: panel.left.x + emblem + z.len(0.3), top: leftTop + (scoreBlock - font * 1.3 - scoreFont * 1.2) / 2 },
      reasonY: reason ? leftTop + scoreBlock + z.len(0.15) + reason / 2 : null,
      divider: recordsTop - z.len(0.15),
      records: [["BEST SCORE", progress.bestScore], ["HIGHEST LEVEL", progress.highestLevel]]
        .map(([label, value], i) => ({ label, value: String(value), y: recordsTop + pitch * (i + 0.5) })),
    };
  }, { split: 0.42 });
}

function drawGameOverColumns() {
  const m = gameOverColumns();
  const p = m.panel;
  const title = END_SCREEN_TITLES[gameState];
  const left = p.left.x;
  const right = p.left.x + p.left.width;

  drawDimmer(0.65);
  drawFramedPanel(p.x, p.y, p.width, p.height);
  drawTitlePlate(title.text, p.x + p.width / 2, p.y, p.titleSize, title.color, p.width);

  // The broken star plate, and beside it the final score
  const e = m.emblem;
  drawStarEmblem(e.x + e.size / 2, e.y + e.size / 2, e.size, true);
  const scoreX = (m.score.left + right) / 2;
  const scoreWidth = right - m.score.left;
  drawOutlinedText("FINAL SCORE", scoreX, m.score.top + m.font * 0.65,
    Math.max(LANDSCAPE.minText, fitTextSize("FINAL SCORE", m.font, scoreWidth)), "#c9ced6");
  drawOutlinedText(String(score), scoreX, m.score.top + m.font * 1.3 + m.scoreFont * 0.6,
    fitTextSize(String(score), m.scoreFont, scoreWidth), "#ffffff");

  if (m.reasonY !== null) {
    const text = "Your base was destroyed";
    drawOutlinedText(text, (left + right) / 2, m.reasonY, Math.max(LANDSCAPE.minText, fitTextSize(text, m.font, right - left)), "#ffd2c9");
  }

  // Records (save.js)
  drawPanelDivider(left, right, m.divider);
  for (const r of m.records) drawPanelRow(r.label, r.value, left, right, r.y, m.font, "#c9ced6", "#ffffff", false);

  drawGameOverButtons();
}

// "Retry level X" (if offered) and "Start over", two-line buttons
// (ui.js), dimmed until they can be used and while an ad loads or
// plays. Between them a line about the ad: the retries left (only with
// a limit and more than one left), "LOADING AD..." while waiting, or
// why there was no continue; otherwise nothing.
function drawGameOverButtons() {
  const over = gameOverScreen;
  const buttons = gameOverButtons();
  const ready = gameOverButtonsReady();

  ctx.globalAlpha = ready ? 1 : 0.35;
  buttons.forEach((b, i) => {
    drawUiButtonTwoLines(b, b.label, b.sub, b.primary, showKeyboardFocus() && i === over.selected, b.adBadge, ready);
  });
  ctx.globalAlpha = 1;

  if (!canOfferContinue()) return;
  const left = continuesLeft();
  let text = "";
  let color = "#c9ced6";
  if (over.waitingForAd) {
    text = UI_TEXT.gameOver.loadingAd;
    color = "#ffffff";
  } else if (over.messageTime > 0) {
    text = over.message;
    color = "#ff9a8a";
  } else if (hasContinueLimit() && left > 1) {
    text = UI_TEXT.gameOver.retriesLeft.replace("{left}", left);
  }
  if (!text) return;

  // Halfway between the two buttons (landscape: never under minText)
  const [first, second] = buttons;
  const y = (first.y + first.height + second.y) / 2;
  if (isTwoColumnLayout()) {
    const size = gameOverColumns().statusFont;
    drawOutlinedText(text, first.x + first.width / 2, y, Math.max(LANDSCAPE.minText, fitTextSize(text, size, first.width)), color);
  } else {
    const { s } = gameOverFrame();
    drawOutlinedText(text, first.x + first.width / 2, y, fitTextSize(text, s * 0.45, first.width), color);
  }
}

// "CAMPAIGN COMPLETE": the gold star plate over a framed panel with the
// title on a plate across its top edge and the total score, then the
// buttons (dimmed until they can be used)
function drawCampaignComplete() {
  if (isTwoColumnLayout()) {
    drawCampaignColumns();
    return;
  }
  const { s, cx, cy } = campaignFrame();
  const panel = { x: cx - s * (GRID_COLS / 2 - 1.2), y: cy - s * 3.6, width: s * (GRID_COLS - 2.4), height: s * 3.2 };

  drawDimmer(0.65);
  drawStarEmblem(cx, cy - s * 5.9, s * 2.8, false);
  drawFramedPanel(panel.x, panel.y, panel.width, panel.height);
  drawTitlePlate("CAMPAIGN COMPLETE", cx, panel.y, s * 0.85, "#ffd75e", panel.width + s * 1.2);
  drawPanelScore("TOTAL SCORE", String(score), cx, panel.y + s * 1.25, s);
  drawCampaignButtons();
}

// Landscape: "CAMPAIGN COMPLETE" in two columns (fitTwoColumnPanel):
// the gold star plate with the total score under it on the left, the
// buttons stacked on the right
function campaignColumns() {
  const items = campaignButtonItems();
  return fitTwoColumnPanel((z, panel) => {
    const buttonHeight = z.touch(1.6);
    const gap = z.len(0.6);
    const rightHeight = items.length * buttonHeight + (items.length - 1) * gap;
    const emblem = z.len(2.2);
    const font = z.text(0.45);
    const scoreFont = z.text(0.95);
    const leftHeight = emblem + z.len(0.25) + font * 1.3 + scoreFont * 1.2;

    const height = Math.max(leftHeight, rightHeight);
    const leftTop = panel.top + (height - leftHeight) / 2;
    const rightTop = panel.top + (height - rightHeight) / 2;
    return {
      height, font, scoreFont,
      emblem: { cx: panel.left.x + panel.left.width / 2, cy: leftTop + emblem / 2, size: emblem },
      scoreTop: leftTop + emblem + z.len(0.25),
      buttons: items.map((b, i) => ({
        ...b, x: panel.right.x, y: rightTop + i * (buttonHeight + gap), width: panel.right.width, height: buttonHeight,
      })),
    };
  }, { split: 0.45 });
}

function drawCampaignColumns() {
  const m = campaignColumns();
  const p = m.panel;
  const cx = m.emblem.cx;

  drawDimmer(0.65);
  drawFramedPanel(p.x, p.y, p.width, p.height);
  drawTitlePlate("CAMPAIGN COMPLETE", p.x + p.width / 2, p.y, p.titleSize, "#ffd75e", p.width);
  drawStarEmblem(cx, m.emblem.cy, m.emblem.size, false);
  drawOutlinedText("TOTAL SCORE", cx, m.scoreTop + m.font * 0.65, m.font, "#c9ced6");
  drawOutlinedText(String(score), cx, m.scoreTop + m.font * 1.3 + m.scoreFont * 0.6,
    fitTextSize(String(score), m.scoreFont, p.left.width), "#ffffff");
  drawCampaignButtons();
}

// The buttons, dimmed until they can be used. Keyboard players see
// which button Enter will press.
function drawCampaignButtons() {
  const ready = campaignButtonsReady();
  ctx.globalAlpha = ready ? 1 : 0.35;
  campaignButtons().forEach((b, i) => {
    drawMenuButton(b, showKeyboardFocus() && i === campaignScreen.selected, ready);
  });
  ctx.globalAlpha = 1;
}

// A menu button (ui.js): gold (primary) or steel, with an amber outline
// when it is chosen with the keyboard, and no hover or pressed look
// while it can't be used ("enabled" false). b has label, primary, x, y,
// width, height. Used by the continue screen (save.js) and "CAMPAIGN
// COMPLETE" (the game over screen has two-line buttons).
function drawMenuButton(b, selected, enabled = true) {
  drawUiButton(b, b.label, b.primary, selected, enabled);
}

// ---------------------------------------------------------------------
// Control panel: the metal panel behind the HUD and the controls, the
// joystick or D-pad, and the fire button. Every static part is painted
// once (cachedPicture, at the tile size times devicePixelRatio) and
// copied each frame; only what moves or is pressed changes: the
// joystick's position, which D-pad button or fire picture is shown.
// Colors are in config.js (CONTROL_LOOK). Light from the top-left.
// ---------------------------------------------------------------------

// (roundedRect, paintRivet and paintFramedScreen are in ui.js)

// The panel: from the top of the control zone to the bottom of the
// screen, full width, with its shadow on the playfield just above it.
// Only in portrait (in landscape the side areas are the margins' metal).
function drawControlPanel() {
  const zone = controlZone.zone;
  if (!zone) return;
  const shadow = Math.max(4, zone.height * 0.05);
  const height = view.height - zone.y;
  const tint = currentTheme().screen;
  const key = "panel" + view.width + "x" + height + tint;
  const picture = cachedPicture(key, view.width, height + shadow,
    (c) => paintControlPanel(c, view.width, height, shadow, tint));
  ctx.drawImage(picture, 0, zone.y - shadow, view.width, height + shadow);
}

// Dark metal (a little of the theme's color mixed in) with fine brushed
// lines, a lit bevel along the top edge, engraved seams between the
// three parts of the zone and small rivets
function paintControlPanel(c, width, height, shadow, tint) {
  const look = CONTROL_LOOK;
  const [top, middle, bottom] = look.panel.map((color) => mixColors(color, tint, look.panelTint));
  const random = makeRandom(5);

  const fade = c.createLinearGradient(0, 0, 0, shadow);
  fade.addColorStop(0, "rgba(0, 0, 0, 0)");
  fade.addColorStop(1, "rgba(0, 0, 0, " + look.panelShadow + ")");
  c.fillStyle = fade;
  c.fillRect(0, 0, width, shadow);
  c.translate(0, shadow); // (0, 0) = the panel's top-left

  const body = c.createLinearGradient(0, 0, 0, height);
  body.addColorStop(0, top);
  body.addColorStop(0.3, middle);
  body.addColorStop(1, bottom);
  c.fillStyle = body;
  c.fillRect(0, 0, width, height);

  // Brushed lines across
  for (let y = 0; y < height; y += 2) {
    c.fillStyle = random() < 0.5 ? "rgba(255, 255, 255, 0.035)" : "rgba(0, 0, 0, 0.08)";
    c.fillRect(0, y, width, 1);
  }

  // Seams on both sides of the HUD part: a dark line with a light one
  const hud = controlZone.hud;
  const seamTop = height * 0.06;
  for (const x of [hud.x, hud.x + hud.width]) {
    c.fillStyle = "rgba(0, 0, 0, 0.55)";
    c.fillRect(Math.round(x) - 1, seamTop, 1, height - seamTop);
    c.fillStyle = "rgba(255, 255, 255, 0.07)";
    c.fillRect(Math.round(x), seamTop, 1, height - seamTop);
  }

  // Top edge: a light bevel with a dark line under it
  const bevel = Math.max(1.5, height * 0.012);
  c.fillStyle = mixColors(top, "#ffffff", 0.35);
  c.fillRect(0, 0, width, bevel);
  c.fillStyle = "rgba(0, 0, 0, 0.6)";
  c.fillRect(0, bevel, width, 1);

  // Rivets near the top corners of each part (where the controls,
  // which are round or cross-shaped, leave room)
  const r = Math.max(1.5, controlZone.zone.height * 0.016);
  const inset = r * 3;
  for (const x of [inset, hud.x - inset, hud.x + inset, hud.x + hud.width - inset, hud.x + hud.width + inset, width - inset]) {
    paintRivet(c, x, bevel + inset, r, look.rivet);
  }
}

// The movement control and the fire button, in the control zone (see-
// through over the playfield in the overlay layout)
function drawControls() {
  ctx.globalAlpha = controlZone.controlAlpha;
  if (settings.controlType === "cross") drawDpad();
  else drawJoystick();
  drawFireButton();
  ctx.globalAlpha = 1;
}

// D-pad: a dark cross-shaped well with a hub in the middle, and four
// metal plates with arrows. The held one is shown pushed in and lit
// (its own cached picture, moved down-right by a pixel or two).
function drawDpad() {
  const d = dpadLayout();
  const held = joystick.pointerId !== null ? joystick.direction : null;
  const well = cachedPicture("dpadWell" + d.width + "x" + d.height, d.width, d.height,
    (c) => paintDpadWell(c, d.width, d.height, d.thick));
  ctx.drawImage(well, d.x - d.width / 2, d.y - d.height / 2, d.width, d.height);

  for (const dir of Object.keys(DIRECTIONS)) {
    const r = dpadButtonRect(d, dir);
    const pressed = dir === held;
    const key = "dpad" + dir + pressed + r.width + "x" + r.height;
    const picture = cachedPicture(key, r.width, r.height, (c) => paintDpadButton(c, r.width, r.height, dir, pressed));
    const push = pressed ? Math.max(1, Math.min(2, d.thick * 0.04)) : 0;
    ctx.drawImage(picture, r.x + push, r.y + push, r.width, r.height);
  }
}

// The cross-shaped well the D-pad buttons sit in, with the round hub
function paintDpadWell(c, width, height, thick) {
  const [light, middle, dark, deepest] = CONTROL_LOOK.metal;
  const m = { x: width / 2, y: height / 2 };
  const radius = thick * 0.2;
  c.fillStyle = deepest;
  roundedRect(c, m.x - thick / 2, 0, thick, height, radius);
  c.fill();
  roundedRect(c, 0, m.y - thick / 2, width, thick, radius);
  c.fill();

  // Hub: a beveled square with a dimple
  const gap = Math.max(1, thick * 0.05);
  const side = thick - gap * 2;
  const hub = c.createLinearGradient(m.x - side / 2, m.y - side / 2, m.x + side / 2, m.y + side / 2);
  hub.addColorStop(0, middle);
  hub.addColorStop(1, dark);
  c.fillStyle = hub;
  roundedRect(c, m.x - side / 2, m.y - side / 2, side, side, side * 0.15);
  c.fill();
  const dimple = c.createLinearGradient(m.x - side * 0.2, m.y - side * 0.2, m.x + side * 0.2, m.y + side * 0.2);
  dimple.addColorStop(0, deepest);
  dimple.addColorStop(1, light);
  disc(c, m.x, m.y, side * 0.22, dimple);
  disc(c, m.x, m.y, side * 0.17, dark);
}

// One D-pad button: a metal plate with a beveled edge and an arrow.
// Pressed: the bevel is turned around (pushed in), the plate is darker
// with a warm amber light on it, a thin amber outline and a bright arrow.
function paintDpadButton(c, width, height, dir, pressed) {
  const look = CONTROL_LOOK;
  const [light, middle, dark, deepest] = look.metal;
  const gap = Math.max(1, Math.min(width, height) * 0.06);
  const x = gap;
  const y = gap;
  const w = width - gap * 2;
  const h = height - gap * 2;
  const radius = Math.min(w, h) * 0.18;
  const bevel = Math.max(1.5, Math.min(w, h) * 0.08);

  // Bevel: light top-left and dark bottom-right (the other way round when pressed)
  const edge = c.createLinearGradient(x, y, x + w, y + h);
  edge.addColorStop(0, pressed ? deepest : light);
  edge.addColorStop(1, pressed ? light : deepest);
  c.fillStyle = edge;
  roundedRect(c, x, y, w, h, radius);
  c.fill();

  // Face
  const top = pressed ? mixColors(mixColors(middle, deepest, 0.3), look.pressed, 0.3) : middle;
  const face = c.createLinearGradient(0, y, 0, y + h);
  face.addColorStop(0, top);
  face.addColorStop(1, pressed ? mixColors(dark, look.pressed, 0.15) : dark);
  c.fillStyle = face;
  roundedRect(c, x + bevel, y + bevel, w - bevel * 2, h - bevel * 2, Math.max(1, radius - bevel));
  c.fill();
  if (pressed) {
    c.strokeStyle = look.pressed;
    c.lineWidth = Math.max(1, bevel * 0.6);
    roundedRect(c, x + 0.5, y + 0.5, w - 1, h - 1, radius);
    c.stroke();
  }

  // Arrow in the middle of the plate, with a dark edge below it
  const step = DIRECTIONS[dir];
  const size = Math.min(w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const arrow = (dx, dy, color) => {
    const tip = size * 0.24;
    const back = size * 0.14;
    const half = size * 0.22;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(cx + dx + step.x * tip, cy + dy + step.y * tip);
    c.lineTo(cx + dx - step.x * back - step.y * half, cy + dy - step.y * back - step.x * half);
    c.lineTo(cx + dx - step.x * back + step.y * half, cy + dy - step.y * back + step.x * half);
    c.closePath();
    c.fill();
  };
  const shift = Math.max(1, size * 0.04);
  arrow(shift, shift, withAlpha(deepest, 0.8));
  arrow(0, 0, pressed ? mixColors(look.pressed, "#ffffff", 0.6) : look.arrow);
}

// Joystick: a round base with arrows around the stick and a metal stick
// top. While dragging, the base is where the touch started and the stick
// top follows the finger; when nobody touches it, a faint joystick sits
// in the middle of the movement control's square.
function drawJoystick() {
  const radius = joystickRadius();
  const active = joystick.pointerId !== null;
  const center = rectCenter(controlZone.moveBox);
  const baseX = active ? joystick.baseX : center.x;
  const baseY = active ? joystick.baseY : center.y;
  const knobX = active ? joystick.knobX : center.x;
  const knobY = active ? joystick.knobY : center.y;

  const before = ctx.globalAlpha;
  if (!active) ctx.globalAlpha = before * CONTROL_LOOK.idleJoystickAlpha;
  const base = cachedPicture("stickBase" + radius, radius * 2, radius * 2, (c) => paintJoystickBase(c, radius));
  ctx.drawImage(base, baseX - radius, baseY - radius, radius * 2, radius * 2);
  const knob = radius * 0.45;
  const box = knob * 2.6; // room for its shadow
  const top = cachedPicture("stickTop" + radius, box, box, (c) => paintJoystickTop(c, knob, box));
  ctx.drawImage(top, knobX - box / 2, knobY - box / 2, box, box);
  ctx.globalAlpha = before;
}

// Joystick base: a beveled metal rim around a dark sunken well, with
// four small arrows etched into the well around the stick
function paintJoystickBase(c, radius) {
  const look = CONTROL_LOOK;
  const [light, middle, dark, deepest] = look.metal;
  const m = radius;
  disc(c, m, m, radius, deepest);
  const rim = c.createLinearGradient(0, 0, radius * 2, radius * 2);
  rim.addColorStop(0, light);
  rim.addColorStop(0.5, middle);
  rim.addColorStop(1, deepest);
  disc(c, m, m, radius * 0.95, rim);
  const well = c.createLinearGradient(0, 0, radius * 2, radius * 2);
  well.addColorStop(0, deepest);            // sunken: dark at the top-left...
  well.addColorStop(1, mixColors(dark, middle, 0.3)); // ...lit inside at the bottom-right
  disc(c, m, m, radius * 0.8, well);

  // Etched arrows: dark, with a light edge below-right where the light catches them
  for (const dir of Object.keys(DIRECTIONS)) {
    const step = DIRECTIONS[dir];
    const ax = m + step.x * radius * 0.64;
    const ay = m + step.y * radius * 0.64;
    const tip = radius * 0.1;
    const half = radius * 0.1;
    const triangle = (dx, dy, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(ax + dx + step.x * tip, ay + dy + step.y * tip);
      c.lineTo(ax + dx - step.x * tip * 0.5 - step.y * half, ay + dy - step.y * tip * 0.5 - step.x * half);
      c.lineTo(ax + dx - step.x * tip * 0.5 + step.y * half, ay + dy - step.y * tip * 0.5 + step.x * half);
      c.closePath();
      c.fill();
    };
    const edge = Math.max(0.75, radius * 0.02);
    triangle(edge, edge, withAlpha(look.arrow, 0.35));
    triangle(0, 0, withAlpha(look.arrow, 0.7));
  }
}

// Joystick stick top: a shadow, a metal dome lit from the top-left with
// a dark rim, a grip ring and a highlight
function paintJoystickTop(c, knob, box) {
  const [light, middle, dark, deepest] = CONTROL_LOOK.metal;
  const m = box / 2;
  disc(c, m + knob * 0.12, m + knob * 0.18, knob * 1.05, "rgba(0, 0, 0, 0.45)");
  disc(c, m, m, knob, deepest);
  const dome = c.createRadialGradient(m - knob * 0.35, m - knob * 0.35, knob * 0.1, m, m, knob);
  dome.addColorStop(0, light);
  dome.addColorStop(0.5, middle);
  dome.addColorStop(1, dark);
  disc(c, m, m, knob * 0.92, dome);
  c.strokeStyle = withAlpha(deepest, 0.5);
  c.lineWidth = Math.max(1, knob * 0.06);
  c.beginPath();
  c.arc(m, m, knob * 0.6, 0, Math.PI * 2);
  c.stroke();
  disc(c, m - knob * 0.38, m - knob * 0.38, knob * 0.16, "rgba(255, 255, 255, 0.65)");
}

// Fire button: its normal or pressed picture (both cached)
function drawFireButton() {
  const b = fireButton;
  const size = b.radius * 2;
  const picture = cachedPicture("fire" + b.pressed + b.radius, size, size, (c) => paintFireButton(c, b.radius, b.pressed));
  ctx.drawImage(picture, b.x - b.radius, b.y - b.radius, size, size);
}

// A big red button in a beveled metal ring, with a glossy highlight and
// FIRE embossed on it. Pressed: the red is darker and a bit smaller, sunk
// into the ring (whose inner edge then shows as a dark gap).
function paintFireButton(c, radius, pressed) {
  const look = CONTROL_LOOK;
  const [light, middle, , deepest] = look.metal;
  const [highlight, red, darkRed, deepRed] = look.fire;
  const m = radius;

  // Metal ring with a lit bevel, and the dark groove inside it
  disc(c, m, m, radius, deepest);
  const ring = c.createLinearGradient(0, 0, radius * 2, radius * 2);
  ring.addColorStop(0, light);
  ring.addColorStop(0.5, middle);
  ring.addColorStop(1, deepest);
  disc(c, m, m, radius * 0.95, ring);
  disc(c, m, m, radius * 0.8, deepest);

  // Red cap, lit from the top-left
  const cap = radius * (pressed ? 0.72 : 0.77);
  const tone = (color) => (pressed ? mixColors(color, deepRed, 0.35) : color);
  const capFill = c.createRadialGradient(m - cap * 0.35, m - cap * 0.4, cap * 0.1, m, m, cap);
  capFill.addColorStop(0, tone(highlight));
  capFill.addColorStop(0.45, tone(red));
  capFill.addColorStop(1, tone(darkRed));
  disc(c, m, m, cap, capFill);
  c.strokeStyle = deepRed;
  c.lineWidth = Math.max(1, radius * 0.02);
  c.beginPath();
  c.arc(m, m, cap, 0, Math.PI * 2);
  c.stroke();

  // Gloss on the top half of the cap
  c.fillStyle = "rgba(255, 255, 255, " + (pressed ? 0.12 : 0.3) + ")";
  c.beginPath();
  c.ellipse(m, m - cap * 0.45, cap * 0.62, cap * 0.32, 0, 0, Math.PI * 2);
  c.fill();

  // FIRE, embossed: a dark edge below-right, a light edge above-left
  const fontSize = Math.round(cap * 0.46);
  c.font = "bold " + fontSize + "px sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  const edge = Math.max(1, fontSize * 0.06);
  const textY = m + cap * 0.05;
  c.fillStyle = withAlpha(deepRed, 0.9);
  c.fillText("FIRE", m + edge, textY + edge);
  c.fillStyle = "rgba(255, 220, 210, 0.55)";
  c.fillText("FIRE", m - edge * 0.6, textY - edge * 0.6);
  c.fillStyle = pressed ? "#f2d6d0" : "#ffffff";
  c.fillText("FIRE", m, textY);
}

// An upgrade badge "size" pixels square, like a tiny HUD display: a
// metal frame around a dark screen (paintFramedScreen in ui.js) with
// the upgrade's icon (the shop's symbols, lit from the top-left). With
// tiers, a row of dots under the icon: amber with a soft glow for each
// tier bought, dark and sunken for the rest.
function paintUpgradeBadge(c, size, badge, tier) {
  const look = badge.look;
  const frame = Math.max(2, size * 0.1);
  const inner = size - frame * 2;
  const m = size / 2;
  paintFramedScreen(c, size, size, frame);
  if (badge.tiers === 0) {
    look.paintSymbol(c, m, m, inner * 0.8, look.color);
    return;
  }

  look.paintSymbol(c, m, frame + inner * 0.4, inner * 0.72, look.color);
  const r = Math.max(1, size * 0.055);
  const dotY = size - frame - inner * 0.16;
  const spacing = r * 3.3;
  for (let i = 0; i < badge.tiers; i++) {
    const x = m + (i - (badge.tiers - 1) / 2) * spacing;
    if (i < tier) {
      disc(c, x, dotY, r * 1.6, withAlpha(BADGE_ROW.dotFilled, 0.3));      // glow
      disc(c, x, dotY, r, BADGE_ROW.dotFilled);
      disc(c, x - r * 0.3, dotY - r * 0.3, r * 0.4, "rgba(255, 255, 255, 0.75)"); // shine
    } else {
      disc(c, x, dotY, r, "rgba(255, 255, 255, 0.2)");                          // socket rim
      disc(c, x - r * 0.12, dotY - r * 0.12, r * 0.78, BADGE_ROW.dotEmpty);       // dark hole, lit lower right
    }
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
