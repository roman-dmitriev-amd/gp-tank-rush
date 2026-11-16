// =====================================================================
//  Screens - the level summary and the "LEVEL X" / world intros
//
//  The game over and "CAMPAIGN COMPLETE" screens are in gameover.js, the shop
//  in shop.js, the pause menu in pause.js, the start-up screen in save.js.
// =====================================================================

// --- Screen button ("Continue" on the level summary) ---
// Its size and place are set in layoutScreenButton().
const screenButton = { x: 0, y: 0, width: 0, height: 0 };

// Can the button be used yet? (Short wait after the screen appears,
// and the summary has finished counting.)
function screenButtonReady() {
  return gameState === GAME_STATE.LEVEL_SUMMARY && stateTimer >= BUTTON_DELAY && summaryShowDone();
}

function isInsideScreenButton(x, y) {
  layoutScreenButton(); // make sure it matches the current screen size
  const b = screenButton;
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

// Shop before the next level; after level 20: "CAMPAIGN COMPLETE"
function pressScreenButton() {
  if (skipSummaryShow()) return; // still counting: show it all first
  if (!screenButtonReady()) return;
  Sound.play("uiTap");
  if (reachedCampaignEnd()) showCampaignComplete();
  else openShop();
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

  // How much of it shows right now (the summary show, below): each row
  // gets its opacity (0 = not yet) and the totals the number they have
  // counted up to. The layout always uses the final texts.
  const t = summaryShowTime();
  const fade = (since) => clamp((t - since) / SUMMARY.rowFade, 0, 1);
  rows.forEach((row, i) => row.push(fade(summaryRowTime(i))));
  const totalsAt = summaryRowTime(rows.length);
  const counted = Math.round(stats.totalGold * easeOut(clamp((t - totalsAt) / SUMMARY.countTime, 0, 1)));
  totals[0].push(fade(totalsAt), "+" + counted);
  totals[1].push(fade(totalsAt), String(gold - stats.totalGold + counted));
  return { rows, totals };
}

// Draw one of summaryRows()'s rows, as much as shows of it right now
function drawSummaryRow([label, value, coin, labelColor, valueColor, alpha, shown], left, right, y, size) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  drawPanelRow(label, shown === undefined ? value : shown, left, right, y, size, labelColor, valueColor, coin);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// The summary show: the rows appear one after another, each with a tick,
// then the two gold totals count up (SUMMARY in config.js). A tap or
// Enter shows everything at once; CONTINUE works once it's all there.
// ---------------------------------------------------------------------
const summaryShow = { skipped: false, heard: 0 };

function resetSummaryShow() {
  summaryShow.skipped = false;
  summaryShow.heard = 0;
}

// Seconds into the show (everything is there once it was skipped)
function summaryShowTime() {
  return summaryShow.skipped ? Infinity : stateTimer;
}

// When row number i starts to show (the totals come after the last row)
function summaryRowTime(i) {
  return SUMMARY.firstRow + i * SUMMARY.rowGap;
}

function summaryShowDone() {
  const rowCount = 2 + levelStats.bonuses.length; // as in summaryRows()
  return summaryShowTime() >= summaryRowTime(rowCount) + SUMMARY.countTime;
}

// Show everything now. Returns true if that changed anything (so the
// tap or key that did it does nothing else).
function skipSummaryShow() {
  if (gameState !== GAME_STATE.LEVEL_SUMMARY || summaryShowDone()) return false;
  summaryShow.skipped = true;
  return true;
}

// Each frame on the summary: a tick for every row that just appeared,
// and a coin sound as the totals start to count
function updateSummaryShow() {
  if (summaryShow.skipped) return;
  const rowCount = 2 + levelStats.bonuses.length;
  let showing = 0;
  while (showing <= rowCount && stateTimer >= summaryRowTime(showing)) showing += 1;
  if (showing > summaryShow.heard) {
    summaryShow.heard = showing;
    Sound.play(showing > rowCount ? "coin" : "tick");
  }
}

// ---------------------------------------------------------------------
// Fades between screens: when the screen changes, a picture of the old
// one is kept and drawn over the new one, fading out. The new screen is
// there and works from the first moment; nothing waits for the fade.
// Counted in real time, so it also runs while the game is paused.
// ---------------------------------------------------------------------
const transition = { picture: document.createElement("canvas"), start: -Infinity, time: 0 };

// Call just BEFORE the screen changes: keeps what is on the canvas now
function startTransition(seconds) {
  if (canvas.width < 2 || isSystemPaused()) return; // nothing drawn yet, or nothing to see
  const picture = transition.picture;
  picture.width = canvas.width;   // (setting the size also empties it)
  picture.height = canvas.height;
  picture.getContext("2d").drawImage(canvas, 0, 0);
  transition.start = performance.now();
  transition.time = seconds * 1000;
}

function stopTransition() {
  transition.start = -Infinity;
}

// The old screen over the new one, fading out (render.js, end of a frame)
function drawTransition() {
  const p = (performance.now() - transition.start) / transition.time;
  if (!(p < 1)) return;
  ctx.globalAlpha = 1 - p;
  ctx.drawImage(transition.picture, 0, 0, view.width, view.height);
  ctx.globalAlpha = 1;
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
  const row = (item) => {
    drawSummaryRow(item, left, right, y, size);
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

  m.rows.forEach((item, i) => drawSummaryRow(item, left, left + p.left.width, m.rowY(i), m.font));

  const strip = m.strip;
  ctx.fillStyle = "rgba(245, 197, 66, 0.1)";
  ctx.fillRect(strip.x, strip.y, strip.width, strip.height);
  m.totals.forEach((item, i) => {
    drawSummaryRow(item, strip.x + m.inset, strip.x + strip.width - m.inset, m.totalY(i), m.font);
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
