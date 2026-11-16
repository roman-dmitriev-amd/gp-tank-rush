// =====================================================================
//  UI look - shared art for the screens shown over the map (level
//  result, game over, campaign complete), the shop and the start-up
//  screen: framed panels, title plates, buttons and a metal background.
//  Same style as the control panel: metal lit from the top-left, dark
//  sunken screens, gold stars. Static parts are painted once and cached
//  (cachedPicture in render.js); only text is drawn every frame.
//  Colors are in config.js (CONTROL_LOOK, BASE_LOOK).
// =====================================================================

// A path for a rounded rectangle on context c
function roundedRect(c, x, y, width, height, radius) {
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + width, y, x + width, y + height, radius);
  c.arcTo(x + width, y + height, x, y + height, radius);
  c.arcTo(x, y + height, x, y, radius);
  c.arcTo(x, y, x + width, y, radius);
  c.closePath();
}

// A small rivet on context c: dark rim, metal dome, light spot
function paintRivet(c, x, y, r, color) {
  disc(c, x + r * 0.3, y + r * 0.3, r, "rgba(0, 0, 0, 0.5)");
  disc(c, x, y, r, mixColors(color, "#000000", 0.35));
  disc(c, x - r * 0.15, y - r * 0.15, r * 0.75, color);
  disc(c, x - r * 0.35, y - r * 0.35, r * 0.3, "rgba(255, 255, 255, 0.7)");
}

// A beveled metal frame with a screw in each corner around a dark,
// sunken screen ("frame" = width of the frame). The HUD display and
// the panels on the screens use it.
function paintFramedScreen(c, width, height, frame) {
  const look = CONTROL_LOOK;
  const [light, middle, dark, deepest] = look.metal;
  const radius = Math.min(height * 0.14, frame * 2.4);

  c.fillStyle = deepest;
  roundedRect(c, 0, 0, width, height, radius);
  c.fill();
  const metal = c.createLinearGradient(0, 0, width * 0.3, height);
  metal.addColorStop(0, mixColors(middle, light, 0.3));
  metal.addColorStop(1, mixColors(dark, deepest, 0.3));
  c.fillStyle = metal;
  roundedRect(c, 1, 1, width - 2, height - 2, radius);
  c.fill();

  if (frame >= 5) {
    const screw = Math.max(1, frame * 0.28);
    for (const [x, y] of [[frame / 2, frame / 2], [width - frame / 2, frame / 2], [frame / 2, height - frame / 2], [width - frame / 2, height - frame / 2]]) {
      paintRivet(c, x, y, screw, look.rivet);
    }
  }

  // The screen: sunken, so a dark line along its top and a faint light
  // one along its bottom
  const inner = Math.max(1, radius - frame * 0.6);
  const screen = c.createLinearGradient(0, frame, 0, height - frame);
  screen.addColorStop(0, look.display[1]);
  screen.addColorStop(0.5, look.display[0]);
  screen.addColorStop(1, look.display[1]);
  c.fillStyle = screen;
  roundedRect(c, frame, frame, width - frame * 2, height - frame * 2, inner);
  c.fill();
  c.fillStyle = "rgba(0, 0, 0, 0.6)";
  c.fillRect(frame + inner, frame, width - (frame + inner) * 2, Math.max(1, frame * 0.25));
  c.fillStyle = "rgba(255, 255, 255, 0.08)";
  c.fillRect(frame + inner, height - frame - 1, width - (frame + inner) * 2, 1);
}

// A framed panel (paintFramedScreen) at (x, y), with a frame that suits
// its size. Returns the frame's width, so text can be placed inside.
function drawFramedPanel(x, y, width, height) {
  const frame = Math.max(3, Math.min(Math.min(width, height) * 0.06, uiUnit() * 0.35));
  const key = "framed" + Math.round(width) + "x" + Math.round(height);
  const picture = cachedPicture(key, width, height, (c) => paintFramedScreen(c, width, height, frame));
  ctx.drawImage(picture, x, y, width, height);
  return frame;
}

// A metal plate with slanted ends (a dark rim, metal lighter at the top,
// a lit edge along the top and, with "rivets", a rivet near each end):
// under titles
function paintPlate(c, width, height, rivets) {
  const [light, middle, dark, deepest] = CONTROL_LOOK.metal;
  const slant = height * 0.5;
  const shape = (inset) => {
    c.beginPath();
    c.moveTo(slant + inset, inset);
    c.lineTo(width - slant - inset, inset);
    c.lineTo(width - inset, height / 2);
    c.lineTo(width - slant - inset, height - inset);
    c.lineTo(slant + inset, height - inset);
    c.lineTo(inset, height / 2);
    c.closePath();
  };
  shape(0);
  c.fillStyle = deepest;
  c.fill();
  const metal = c.createLinearGradient(0, 0, 0, height);
  metal.addColorStop(0, mixColors(middle, light, 0.2));
  metal.addColorStop(1, dark);
  shape(Math.max(1, height * 0.06));
  c.fillStyle = metal;
  c.fill();
  c.fillStyle = withAlpha(light, 0.5);
  c.fillRect(slant, Math.max(1, height * 0.06), width - slant * 2, Math.max(1, height * 0.04));
  if (rivets && height >= 24) {
    const r = Math.max(1.5, height * 0.06);
    paintRivet(c, slant * 0.9, height / 2, r, CONTROL_LOOK.rivet);
    paintRivet(c, width - slant * 0.9, height / 2, r, CONTROL_LOOK.rivet);
  }
}

// A title on a metal plate (paintPlate), centered on (cx, cy). The text
// is made smaller if it doesn't fit in maxWidth.
function drawTitlePlate(text, cx, cy, size, color, maxWidth) {
  let fontSize = size;
  ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  while (ctx.measureText(text).width > maxWidth - fontSize * 2.6 && fontSize > 8) {
    fontSize -= 1;
    ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  }
  const height = Math.round(fontSize * 1.8);
  const width = Math.round(Math.min(maxWidth, ctx.measureText(text).width + fontSize * 2.6));
  const picture = cachedPicture("plate" + width + "x" + height, width, height, (c) => paintPlate(c, width, height, true));
  ctx.drawImage(picture, cx - width / 2, cy - height / 2, width, height);
  drawOutlinedText(text, cx, cy, fontSize, color);
}

// A short message on a small framed dark strip (paintFramedScreen) sized
// to the text, centered on (cx, cy): tutorial hints, "Grab the coins!",
// the best score on the start-up screen. The text is made smaller if it
// doesn't fit in maxWidth.
function drawMessageStrip(text, cx, cy, size, color, maxWidth) {
  let fontSize = size;
  ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  while (ctx.measureText(text).width > maxWidth - fontSize * 2 && fontSize > 8) {
    fontSize -= 1;
    ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  }
  const height = Math.round(fontSize * 2.1);
  const width = Math.round(Math.min(maxWidth, ctx.measureText(text).width + fontSize * 2));
  drawFramedPanel(cx - width / 2, cy - height / 2, width, height);
  ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
}

// A button picture: a dark rim, a metal frame lit from the top-left, and
// a gold (primary) or steel face with a soft gloss on its top half
function paintButton(c, width, height, primary) {
  const [light, middle, dark, deepest] = CONTROL_LOOK.metal;
  const [shine, gold, shade] = BASE_LOOK.gold;
  const radius = height * 0.3;
  const frame = Math.max(2, height * 0.09);

  c.fillStyle = deepest;
  roundedRect(c, 0, 0, width, height, radius);
  c.fill();
  const rim = c.createLinearGradient(0, 0, width * 0.25, height);
  rim.addColorStop(0, light);
  rim.addColorStop(0.5, middle);
  rim.addColorStop(1, deepest);
  c.fillStyle = rim;
  roundedRect(c, 1, 1, width - 2, height - 2, radius);
  c.fill();

  const face = c.createLinearGradient(0, frame, 0, height - frame);
  if (primary) {
    face.addColorStop(0, shine);
    face.addColorStop(0.45, gold);
    face.addColorStop(1, shade);
  } else {
    face.addColorStop(0, mixColors(middle, light, 0.15));
    face.addColorStop(1, dark);
  }
  c.fillStyle = face;
  roundedRect(c, frame, frame, width - frame * 2, height - frame * 2, Math.max(1, radius - frame));
  c.fill();

  c.save();
  c.clip();
  c.fillStyle = "rgba(255, 255, 255, 0.22)";
  c.fillRect(frame, frame, width - frame * 2, (height - frame * 2) * 0.45);
  c.restore();
}

// How the pointer touches button b (uiPointer, input.js): "pressed" while
// a finger or the mouse button is down on it (not while that drags a
// list to scroll it), "hover" while the mouse is over it, otherwise "".
// Nothing while the button can't be used ("enabled" false).
function buttonPointerLook(b, enabled = true) {
  const p = uiPointer;
  if (!enabled || !isInsideRect(b, p.x, p.y)) return "";
  if (p.down) return isScrollDragging() ? "" : "pressed";
  return p.mouse ? "hover" : "";
}

// The hover or pressed look over a button's face (the same rounded
// shape as paintButton's face)
function drawButtonPointerLook(b, look) {
  if (!look) return;
  const frame = Math.max(2, b.height * 0.09);
  ctx.fillStyle = look === "pressed" ? CONTROL_LOOK.pressedShade : CONTROL_LOOK.hover;
  roundedRect(ctx, b.x + frame, b.y + frame, b.width - frame * 2, b.height - frame * 2,
              Math.max(1, b.height * 0.3 - frame));
  ctx.fill();
}

// A button at b (x, y, width, height) with this label: gold when
// "primary", steel otherwise, with an amber outline when it's chosen with
// the keyboard. Lighter while the mouse is over it, darker with the label
// pushed down a little while it's pressed; neither while it can't be
// used ("enabled" false; the caller dims it then). The label is embossed
// and made smaller if it's too wide. Returns how far the label is pushed
// down (drawUiButtonTwoLines).
function drawUiButton(b, label, primary, selected, enabled = true) {
  const key = "button" + Math.round(b.width) + "x" + Math.round(b.height) + primary;
  const picture = cachedPicture(key, b.width, b.height, (c) => paintButton(c, b.width, b.height, primary));
  ctx.drawImage(picture, b.x, b.y, b.width, b.height);
  const look = buttonPointerLook(b, enabled);
  drawButtonPointerLook(b, look);
  const push = look === "pressed" ? Math.max(1, b.height * 0.03) : 0;
  if (selected) {
    ctx.strokeStyle = CONTROL_LOOK.pressed;
    ctx.lineWidth = Math.max(2, b.height * 0.07);
    roundedRect(ctx, b.x - 2, b.y - 2, b.width + 4, b.height + 4, b.height * 0.32);
    ctx.stroke();
  }
  if (!label) return push;

  let size = b.height * 0.42;
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  while (ctx.measureText(label).width > b.width - b.height * 0.8 && size > 6) {
    size -= 1;
    ctx.font = "bold " + Math.round(size) + "px sans-serif";
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2 + push;
  const edge = Math.max(1, size * 0.06);
  if (primary) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";   // light edge below: pressed into the gold
    ctx.fillText(label, x, y + edge);
    ctx.fillStyle = BASE_LOOK.gold[3];
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";          // dark shadow below the white text
    ctx.fillText(label, x + edge, y + edge);
    ctx.fillStyle = "#ffffff";
  }
  ctx.fillText(label, x, y);
  return push;
}

// A button like drawUiButton, with two lines: the label and a smaller,
// fainter line under it, each made smaller if it's too wide. With
// "adBadge", a small play-triangle badge sits before the label (the
// button plays an ad). On gold the second line is a darker brown at full
// strength, so its small text keeps a 4.5:1 contrast.
function drawUiButtonTwoLines(b, label, sub, primary, selected, adBadge, enabled = true) {
  const push = drawUiButton(b, "", primary, selected, enabled); // the button and its outline, no label
  const maxWidth = b.width - b.height * 0.8;
  const cx = b.x + b.width / 2;

  // The label and the badge before it (badge and gap: 1.6 font sizes)
  const badge = adBadge ? 1.6 : 0;
  let size = b.height * 0.33;
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  while (ctx.measureText(label).width + size * badge > maxWidth && size > 6) {
    size -= 1;
    ctx.font = "bold " + Math.round(size) + "px sans-serif";
  }
  const textWidth = ctx.measureText(label).width;
  const y = b.y + b.height * 0.38 + push;
  const textX = cx + (size * badge) / 2; // badge and label centered together
  if (adBadge) drawAdBadge(textX - textWidth / 2 - size * badge, y, size, primary);
  drawEmbossedText(label, textX, y, size, primary);

  let subSize = b.height * 0.25;
  ctx.font = "bold " + Math.round(subSize) + "px sans-serif";
  while (ctx.measureText(sub).width > maxWidth && subSize > 6) {
    subSize -= 1;
    ctx.font = "bold " + Math.round(subSize) + "px sans-serif";
  }
  const alpha = ctx.globalAlpha;
  if (!primary) ctx.globalAlpha = alpha * 0.8;
  drawEmbossedText(sub, cx, b.y + b.height * 0.71 + push, subSize, primary, CONTROL_LOOK.goldSubText);
  ctx.globalAlpha = alpha;
}

// Centered text in the current font, embossed like a button label:
// pressed into the gold (primary; in "goldColor" if given) or white with
// a shadow and a thin dark outline (steel; the outline keeps it readable
// on the light top half of the steel face)
function drawEmbossedText(text, x, y, size, primary, goldColor = BASE_LOOK.gold[3]) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const edge = Math.max(1, size * 0.06);
  if (primary) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillText(text, x, y + edge);
    ctx.fillStyle = goldColor;
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText(text, x + edge, y + edge);
    ctx.strokeStyle = CONTROL_LOOK.metal[3];
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.lineJoin = "miter"; // the default, for everything drawn after
    ctx.fillStyle = "#ffffff";
  }
  ctx.fillText(text, x, y);
}

// The small ad badge: a rounded plate with a play triangle, "size" (the
// label's font size) tall, its left edge at x, centered on y. Dark on
// gold (with the same light edge as the label), white on steel.
function drawAdBadge(x, y, size, primary) {
  const height = size * 0.95;
  const width = size * 1.25;
  const top = y - height / 2;
  if (primary) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    roundedRect(ctx, x, top + Math.max(1, size * 0.06), width, height, height * 0.25);
    ctx.fill();
  }
  ctx.fillStyle = primary ? BASE_LOOK.gold[3] : "#ffffff";
  roundedRect(ctx, x, top, width, height, height * 0.25);
  ctx.fill();
  ctx.fillStyle = primary ? BASE_LOOK.gold[0] : CONTROL_LOOK.metal[3];
  ctx.beginPath();
  ctx.moveTo(x + width * 0.38, top + height * 0.24);
  ctx.lineTo(x + width * 0.38, top + height * 0.76);
  ctx.lineTo(x + width * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

// The whole screen dimmed, so a panel over the map stands out
function drawDimmer(alpha) {
  ctx.fillStyle = "rgba(0, 0, 0, " + alpha + ")";
  ctx.fillRect(0, 0, view.width, view.height);
}

// A full-screen background of dark metal plates (the shop and the
// start-up screen): brushed lines, engraved seams and rivets where the
// plates meet. Painted once per screen size at one pixel per CSS pixel
// (it's soft anyway) and stretched over the screen.
function drawMetalBackground() {
  const width = view.width;
  const height = view.height;
  const picture = cachedPicture("metalBackground" + width + "x" + height, width, height,
    (c) => paintMetalBackground(c, width, height), 1);
  ctx.drawImage(picture, 0, 0, width, height);
}

// The metal plates on context c. With "tint" (a theme's screen color)
// a little of it is mixed in, like the control panel (the margins
// around the playfield, themes.js).
function paintMetalBackground(c, width, height, tint) {
  const [top, middle, bottom] = CONTROL_LOOK.panel.map((color) =>
    (tint ? mixColors(color, tint, CONTROL_LOOK.panelTint) : color));
  const body = c.createLinearGradient(0, 0, width * 0.3, height);
  body.addColorStop(0, top);
  body.addColorStop(0.4, middle);
  body.addColorStop(1, bottom);
  c.fillStyle = body;
  c.fillRect(0, 0, width, height);

  const random = makeRandom(9);
  for (let y = 0; y < height; y += 2) {
    c.fillStyle = random() < 0.5 ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.07)";
    c.fillRect(0, y, width, 1);
  }

  // Plates about a third of the screen wide, with engraved seams
  const plate = Math.max(120, width / 3);
  for (let x = plate; x < width; x += plate) {
    c.fillStyle = "rgba(0, 0, 0, 0.5)";
    c.fillRect(Math.round(x) - 1, 0, 1, height);
    c.fillStyle = "rgba(255, 255, 255, 0.06)";
    c.fillRect(Math.round(x), 0, 1, height);
  }
  for (let y = plate; y < height; y += plate) {
    c.fillStyle = "rgba(0, 0, 0, 0.5)";
    c.fillRect(0, Math.round(y) - 1, width, 1);
    c.fillStyle = "rgba(255, 255, 255, 0.06)";
    c.fillRect(0, Math.round(y), width, 1);
  }
  for (let x = plate; x < width; x += plate) {
    for (let y = plate; y < height; y += plate) {
      for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
        paintRivet(c, x + dx, y + dy, 1.8, CONTROL_LOOK.rivet);
      }
    }
  }
}

// The base's star plate (paintBase), "size" pixels wide, centered on
// (cx, cy): whole, or broken after a lost game
function drawStarEmblem(cx, cy, size, broken) {
  const picture = cachedPicture("starEmblem" + broken + Math.round(size), size, size, (c) => paintBase(c, size, broken));
  ctx.drawImage(picture, cx - size / 2, cy - size / 2, size, size);
}
