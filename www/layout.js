// =====================================================================
//  Layout - the canvas, the fixed places on the map, and where everything goes on screen
//
//  Portrait / landscape layout (computeLayout), safe areas, resize, map-to-screen
//  helpers, and the frames for overlay screens and two-column panels.
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
