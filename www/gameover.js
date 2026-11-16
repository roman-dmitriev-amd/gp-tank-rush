// =====================================================================
//  Game over and "CAMPAIGN COMPLETE" - their buttons, flow and drawing
//
//  The continue after a rewarded ad (ads.js) is here too.
// =====================================================================

// --- Game over screen: "Continue" and "Start over" ---
// The only way to continue is "Watch ad to continue": it asks ads.js
// for a rewarded ad (showRewardedAd), and only if the player earns the
// reward the lost level starts again from its checkpoint (save.js).
// The button shows from level 2 on (level 1's checkpoint is the same as
// "Start over") and while the run has continues left
// (REWARDED_CONTINUES_PER_RUN, null = no limit). While no ad is ready
// (isRewardedReady in ads.js; always so in the browser) it is switched
// off and reads "AD NOT AVAILABLE". Texts: UI_TEXT.gameOver.
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

// Is a continue offered for the lost run: is there a checkpoint to go
// back to, and a continue left? (Whether an ad is ready is asked
// separately, see gameOverButtonItems.)
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

// What the buttons are, each with a smaller second line: "Watch ad to
// continue" (if a continue is offered; switched off and reading "Ad not
// available" while no ad is ready), then "Start over". The first one
// that can be used is the gold one.
function gameOverButtonItems() {
  const text = UI_TEXT.gameOver;
  const buttons = [];
  if (canOfferContinue()) {
    const adReady = isRewardedReady(); // ads.js
    buttons.push({
      label: adReady ? text.watchAd : text.adNotAvailable,
      sub: adReady ? text.retrySub.replace("{level}", progress.checkpoint.level) : text.adNotAvailableSub,
      adBadge: adReady, // the small play-triangle plate (ui.js)
      enabled: adReady,
      action: requestContinueAd,
    });
  }
  buttons.push({
    label: text.startOver,
    sub: text.startOverSub,
    adBadge: false,
    enabled: true,
    action: () => {
      progress.run = null; // a new run replaces the saved one
      writeSave();
      newGame();
    },
  });
  const firstEnabled = buttons.findIndex((b) => b.enabled);
  return buttons.map((b, i) => ({ ...b, primary: i === firstEnabled }));
}

// The button chosen with the keyboard: never one that is switched off
// ("Start over" can always be used)
function gameOverSelected(buttons) {
  const selected = Math.min(gameOverScreen.selected, buttons.length - 1);
  return buttons[selected].enabled ? selected : buttons.findIndex((b) => b.enabled);
}

// Same short wait as the other end screens, and off while an ad loads
// or plays
function gameOverButtonsReady() {
  return stateTimer >= BUTTON_DELAY && !gameOverScreen.waitingForAd;
}

function gameOverTap(x, y) {
  if (!gameOverButtonsReady()) return;
  for (const b of gameOverButtons()) {
    if (b.enabled && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
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
    // To the next button that can be used
    const step = code === "ArrowUp" ? buttons.length - 1 : 1;
    let next = gameOverSelected(buttons);
    do { next = (next + step) % buttons.length; } while (!buttons[next].enabled);
    over.selected = next;
    scrollOverlayTo(buttons[over.selected]);
  } else if (!event.repeat && gameOverButtonsReady()) {
    Sound.play("uiTap");
    buttons[gameOverSelected(buttons)].action();
  }
}

// "Watch ad to continue" pressed: ask ads.js for the rewarded ad (only
// ever from this button). Until it answers the game is paused (isPaused,
// pause.js), the buttons are off and all sound is muted
// (Sound.setAdPlaying); finishContinueAd turns the sound back on. The
// answer is taken by the game loop (updateAdWait), so one that comes
// while the app is hidden waits until it shows again. Only an answer of
// exactly true gives the continue.
function requestContinueAd() {
  if (!isRewardedReady()) return; // no ad to show (ads.js)
  const over = gameOverScreen;
  over.waitingForAd = true;
  over.adWaitTime = 0;
  over.messageTime = 0;
  over.adAnswer = null;
  over.adRequest += 1;
  const request = over.adRequest;
  Sound.setAdPlaying(true);
  Promise.resolve().then(showRewardedAd).then( // ads.js; a throw counts as "not available"
    (rewarded) => { over.adAnswer = { request, failure: rewarded === true ? "" : UI_TEXT.gameOver.noReward }; },
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
// play. The run is saved again from here (it was dropped on game over),
// with this continue counted.
function continueFromCheckpoint() {
  const checkpoint = progress.checkpoint;
  continuesUsed += 1;
  progress.run = checkpointRun(); // save.js
  writeSave();
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

// "Watch ad to continue" (if offered) and "Start over", two-line
// buttons (ui.js), dimmed until they can be used and while an ad loads
// or plays; the ad button stays dimmed while no ad is ready. Between
// them a line about the ad: the continues left (only with a limit and
// more than one left), "LOADING AD..." while waiting, or why there was
// no continue; otherwise nothing.
function drawGameOverButtons() {
  const over = gameOverScreen;
  const buttons = gameOverButtons();
  const ready = gameOverButtonsReady();
  const selected = gameOverSelected(buttons);

  buttons.forEach((b, i) => {
    const usable = ready && b.enabled;
    ctx.globalAlpha = usable ? 1 : 0.35;
    drawUiButtonTwoLines(b, b.label, b.sub, b.primary, showKeyboardFocus() && i === selected, b.adBadge, usable);
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
