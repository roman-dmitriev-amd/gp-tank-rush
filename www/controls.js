// =====================================================================
//  Controls - drawing the control panel, joystick, D-pad and fire button
//
//  How they are used is in input.js.
// =====================================================================

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
