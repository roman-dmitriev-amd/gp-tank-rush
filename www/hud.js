// =====================================================================
//  HUD - level, lives, enemies left, gold, effect timers, upgrade badges
//
// =====================================================================

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
  const ratio = pixelRatio();
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
