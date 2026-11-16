// =====================================================================
//  Title screen - the first screen after launch
//
//  The star plate, the game's name (GAME_TITLE / GAME_SUBTITLE in
//  config.js), the best score and the buttons: PLAY, or with a saved run
//  "CONTINUE FROM LEVEL X" and "NEW GAME". The first tap here is also
//  what lets the sound and the music start (audio.js).
// =====================================================================

// ---------------------------------------------------------------------
// The buttons: PLAY (gold), or with a saved run "CONTINUE FROM LEVEL X"
// (gold) and "NEW GAME"
// ---------------------------------------------------------------------
const titleScreen = { selected: 0 }; // button chosen with the keyboard

// Where the screen goes (overlayFrame in layout.js): from the top of the
// star plate to the bottom of the last button
function titleScreenFrame() {
  return overlayFrame(-8.6, 3.4);
}

function titleScreenButtons() {
  const { s, cx, cy } = titleScreenFrame();
  const width = s * 9;
  const height = buttonHeight(s * 1.6); // at least 48 px (layout.js)
  const x = cx - width / 2;
  const top = cy - s * 0.5;
  // No saved run: level 1 is already set up (init in game.js), so PLAY
  // only has to start its "LEVEL 1" intro
  if (!progress.run) {
    return [{
      label: UI_TEXT.title.play,
      primary: true,
      action: () => setState(GAME_STATE.LEVEL_INTRO),
      x, y: top, width, height,
    }];
  }
  return [
    {
      label: UI_TEXT.title.continueRun.replace("{level}", progress.run.level),
      primary: true,
      action: continueSavedRun,  // state.js
      x, y: top, width, height,
    },
    {
      label: UI_TEXT.title.newGame,
      primary: false,
      action: () => {
        progress.run = null;
        writeSave();
        newGame();               // state.js
      },
      x, y: top + height + s * 0.6, width, height,
    },
  ];
}

function titleScreenTap(x, y) {
  for (const b of titleScreenButtons()) {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      Sound.play("uiTap");
      b.action();
      return;
    }
  }
}

// Up/Down choose, Enter or Space press
function titleScreenKeyDown(event) {
  const code = event.code;
  if (!["ArrowUp", "ArrowDown", "Enter", "Space"].includes(code)) return;
  event.preventDefault();
  if (code === "ArrowUp" || code === "ArrowDown") {
    const count = titleScreenButtons().length;
    const step = code === "ArrowUp" ? count - 1 : 1;
    titleScreen.selected = (titleScreen.selected + step) % count;
    scrollOverlayTo(titleScreenButtons()[titleScreen.selected]); // input.js
  } else if (!event.repeat) {
    Sound.play("uiTap");
    const buttons = titleScreenButtons();
    buttons[Math.min(titleScreen.selected, buttons.length - 1)].action();
  }
}

// The font size (at most "size") at which bold text fits in maxWidth
function fitTextSize(text, size, maxWidth) {
  ctx.font = "bold " + Math.round(size) + "px sans-serif";
  const width = ctx.measureText(text).width;
  return width > maxWidth ? size * maxWidth / width : size;
}

function drawTitleScreen() {
  const { s, cx, cy } = titleScreenFrame();

  drawMetalBackground(); // same dark metal as the shop (ui.js)

  // The gold star plate, the title (large, gold) and the subtitle on a
  // metal plate, each shrunk if needed so it fits on one line inside the
  // playfield width on narrow phones, and the best score on a small
  // framed strip (ui.js)
  const maxWidth = s * (GRID_COLS - 1);
  drawStarEmblem(cx, cy - s * 7.1, s * 2.8, false);
  drawOutlinedText(GAME_TITLE.toUpperCase(), cx, cy - s * 4.6,
    fitTextSize(GAME_TITLE.toUpperCase(), s * 1.5, maxWidth), "#ffd75e");
  drawTitlePlate(GAME_SUBTITLE.toUpperCase(), cx, cy - s * 3.05, s * 0.65, "#ffffff", maxWidth);
  drawMessageStrip("BEST SCORE " + progress.bestScore, cx, cy - s * 1.7, s * 0.45, "#c9ced6", maxWidth);

  // Keyboard players see which button Enter will press
  const showSelection = showKeyboardFocus(); // input.js
  titleScreenButtons().forEach((b, i) => {
    drawMenuButton(b, showSelection && i === titleScreen.selected); // gameover.js
  });
}
