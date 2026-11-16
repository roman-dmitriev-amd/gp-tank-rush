// =====================================================================
//  Pause menu and settings.
//
//  This file has:
//    - "settings": sound (the overall switch), sound effects, engine
//      sound, control side and control type
//    - who paused the game (the player, the app being hidden, or a
//      rewarded ad on the game over screen)
//    - the pause button (top-right, next to the score)
//    - the pause menu: Resume / Restart level / Settings, and the
//      settings page
//  The game (game.js) skips update() while isPaused() is true, so every
//  timer (power-ups, effects, coins, enemies...) stops counting.
// =====================================================================

// ---------------------------------------------------------------------
// Settings (saved by save.js whenever one changes)
// ---------------------------------------------------------------------
const settings = {
  sound: true,            // all sound on/off (the overall switch)
  music: true,            // the music on/off (music.js)
  soundEffects: true,     // sound effects on/off
  engineSound: true,      // the player tank's engine sound on/off
  leftHanded: false,      // false: movement left, FIRE right. true: swapped
  controlType: "drag",    // "drag" (floating joystick) or "cross" (D-pad)
  vibration: true,        // the phone vibrates on big hits (feedback.js)
  holdFire: false,        // keep firing while FIRE is held (tanks.js)
};

// ---------------------------------------------------------------------
// Who paused the game
//   pauseMenu.open  the player pressed pause (menu on screen)
//   systemPaused    the app is hidden (in the background, screen off,
//                   another tab): the "visibilitychange" event in
//                   game.js, until it shows again
//   gameOverScreen.waitingForAd  a rewarded ad is loading or playing
//                   (gameover.js); ends when ads.js answers
// ---------------------------------------------------------------------
const pauseMenu = {
  open: false,
  page: "main",     // "main" or "settings"
  selected: 0,      // button chosen with the keyboard
};

let systemPaused = false;

function isSystemPaused() {
  return systemPaused;
}

function isPaused() {
  return pauseMenu.open || isSystemPaused() || gameOverScreen.waitingForAd;
}

// The pause button only exists during a level (and its "LEVEL X" intro)
function canOpenPauseMenu() {
  return gameState === GAME_STATE.PLAYING || gameState === GAME_STATE.LEVEL_INTRO ||
         gameState === GAME_STATE.WORLD_INTRO;
}

// "silent": without the tap sound (the app is being hidden, game.js)
function openPauseMenu(silent) {
  if (!canOpenPauseMenu() || pauseMenu.open) return;
  startTransition(TRANSITION.menu); // screens.js
  pauseMenu.open = true;
  if (silent !== true) Sound.play("uiTap");
  showPausePage("main");
  releaseAllInput(); // a held arrow key or finger must not keep driving
}

function closePauseMenu() {
  if (pauseMenu.open) startTransition(TRANSITION.menu);
  pauseMenu.open = false;
  resetOverlayScroll(); // layout.js
}

function showPausePage(page) {
  if (pauseMenu.open && page !== pauseMenu.page) startTransition(TRANSITION.menu);
  pauseMenu.page = page;
  pauseMenu.selected = 0;
  resetOverlayScroll();
}

// The app was hidden (true) or shows again (false). While hidden
// EVERYTHING stops: the game loop (nothing is updated or drawn), input,
// sound, the engine and the sound files' loading. A rewarded ad's answer
// waits for the game loop, so it's handled once the app shows again,
// and so is a size change (resize in layout.js).
function setSystemPause(on) {
  if (on === systemPaused) return;
  systemPaused = on;
  if (on) {
    stopLoop();
    releaseForNewLayout(); // let go of every finger, drag and held key (layout.js)
  } else {
    if (resizeWaiting) resize(); // the window changed size meanwhile
    startLoop(); // does nothing if it's already running
  }
  Sound.setSystemPaused(on); // audio stops too
}

// ---------------------------------------------------------------------
// Pause button: a small metal button in the top-right corner of the
// playfield (drawn over the map, cached, see paintPauseButton)
// ---------------------------------------------------------------------
const MIN_TAP_SIZE = LANDSCAPE.minTouch; // CSS pixels: the smallest comfortable tap area

// Where it is: { x, y, size } (placed with the rest of the layout)
function pauseButtonRect() {
  return controlZone.pause;
}

// Its place for a layout (computeLayout in layout.js): 0.9 tiles big, in
// the playfield's top-right corner on screen (turned or not), in
// landscape at least LANDSCAPE.pauseMinSize
function placePauseButton(layout) {
  const s = layout.field.tileSize;
  const rect = fieldRect(layout.field); // layout.js
  const size = layout.mode === "portrait" ? s * 0.9 : Math.max(s * 0.9, LANDSCAPE.pauseMinSize);
  return {
    x: rect.x + rect.width - size - s * 0.1,
    y: rect.y + s * 0.1,
    size,
  };
}

// Its tap area: MIN_TAP_SIZE square if the button is drawn smaller,
// around the button but moved in to stay inside the playfield "f", so
// it never reaches past the screen edge or onto the HUD
function pauseTapRect(b, f) {
  const size = Math.max(MIN_TAP_SIZE, b.size);
  const rect = fieldRect(f);
  return {
    x: clamp(b.x + (b.size - size) / 2, rect.x, rect.x + rect.width - size),
    y: clamp(b.y + (b.size - size) / 2, rect.y, rect.y + rect.height - size),
    width: size,
    height: size,
  };
}

function isInsidePauseButton(x, y) {
  return isInsideRect(pauseTapRect(pauseButtonRect(), field), x, y);
}

// A little see-through, so it doesn't hide the map corner completely;
// solid and lit up while the mouse is over it (it reacts on press, so
// it has no pressed look of its own: the menu opens)
const PAUSE_BUTTON_ALPHA = 0.85;

function drawPauseButton() {
  const b = pauseButtonRect();
  const hover = uiPointer.mouse && isInsidePauseButton(uiPointer.x, uiPointer.y); // input.js
  const picture = cachedPicture("pauseButton" + b.size, b.size, b.size, (c) => paintPauseButton(c, b.size));
  ctx.globalAlpha = hover ? 1 : PAUSE_BUTTON_ALPHA;
  ctx.drawImage(picture, b.x, b.y, b.size, b.size);
  ctx.globalAlpha = 1;
  if (hover) {
    ctx.fillStyle = CONTROL_LOOK.hover;
    roundedRect(ctx, b.x, b.y, b.size, b.size, b.size * 0.22);
    ctx.fill();
  }
}

// The pause button: a dark rim, a metal frame lit from the top-left, a
// dark screen face and a gear (light, with a dark edge)
function paintPauseButton(c, size) {
  const look = CONTROL_LOOK;
  const [light, middle, , deepest] = look.metal;
  const radius = size * 0.22;
  const frame = Math.max(2, size * 0.1);
  c.fillStyle = deepest;
  roundedRect(c, 0, 0, size, size, radius);
  c.fill();
  const rim = c.createLinearGradient(0, 0, size, size);
  rim.addColorStop(0, light);
  rim.addColorStop(0.5, middle);
  rim.addColorStop(1, deepest);
  c.fillStyle = rim;
  roundedRect(c, 1, 1, size - 2, size - 2, radius);
  c.fill();
  c.fillStyle = look.display[0];
  roundedRect(c, frame, frame, size - frame * 2, size - frame * 2, Math.max(1, radius - frame));
  c.fill();

  // A gear: shadow first (a pixel to the bottom-right), then the light gear
  c.fillStyle = deepest;
  gearPath(c, size / 2 + 1, size / 2 + 1, size);
  c.fill("evenodd");
  c.fillStyle = "#e9edf1";
  gearPath(c, size / 2, size / 2, size);
  c.fill("evenodd");
}

// A gear with 8 teeth and a round hole, centered on (cx, cy), for a
// button "size" wide (filled with "evenodd", so the hole stays open)
function gearPath(c, cx, cy, size) {
  const teeth = 8;
  const outer = size * 0.3;   // tip of a tooth
  const inner = size * 0.22;  // between the teeth
  const hole = size * 0.09;
  c.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const step = Math.PI * 2 / teeth;
    // each tooth: up the flank, across the tip, down the other flank
    c.lineTo(cx + Math.cos(a - step * 0.3) * inner, cy + Math.sin(a - step * 0.3) * inner);
    c.lineTo(cx + Math.cos(a - step * 0.18) * outer, cy + Math.sin(a - step * 0.18) * outer);
    c.lineTo(cx + Math.cos(a + step * 0.18) * outer, cy + Math.sin(a + step * 0.18) * outer);
    c.lineTo(cx + Math.cos(a + step * 0.3) * inner, cy + Math.sin(a + step * 0.3) * inner);
  }
  c.closePath();
  c.moveTo(cx + hole, cy);
  c.arc(cx, cy, hole, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------
// Menu buttons
// Each: { label, action }. The settings change right away.
// ---------------------------------------------------------------------
function pauseMenuItems() {
  if (pauseMenu.page === "settings") {
    return [
      {
        label: "SOUND: " + (settings.sound ? "ON" : "OFF"),
        action: () => {
          settings.sound = !settings.sound;
          Sound.refreshMute(); // audio.js: everything quiet, or back on
          writeSave();
        },
      },
      {
        label: "MUSIC: " + (settings.music ? "ON" : "OFF"),
        action: () => {
          settings.music = !settings.music;
          writeSave();
        },
      },
      {
        label: "SOUND EFFECTS: " + (settings.soundEffects ? "ON" : "OFF"),
        action: () => {
          settings.soundEffects = !settings.soundEffects;
          writeSave();
        },
      },
      {
        label: "ENGINE SOUND: " + (settings.engineSound ? "ON" : "OFF"),
        action: () => {
          settings.engineSound = !settings.engineSound;
          writeSave();
        },
      },
      {
        label: "CONTROLS: " + (settings.leftHanded ? "LEFT-HANDED" : "RIGHT-HANDED"),
        action: () => {
          settings.leftHanded = !settings.leftHanded;
          resize(); // swap the movement and fire parts
          writeSave();
        },
      },
      {
        label: "MOVE CONTROL: " + (settings.controlType === "cross" ? "CROSS" : "DRAG"),
        action: () => {
          settings.controlType = settings.controlType === "cross" ? "drag" : "cross";
          writeSave();
        },
      },
      {
        label: "HOLD TO FIRE: " + (settings.holdFire ? "ON" : "OFF"),
        action: () => {
          settings.holdFire = !settings.holdFire;
          writeSave();
        },
      },
      {
        label: "VIBRATION: " + (settings.vibration ? "ON" : "OFF"),
        action: () => {
          settings.vibration = !settings.vibration;
          vibrate("armor"); // a short buzz to show it is on (feedback.js)
          writeSave();
        },
      },
      { label: "BACK", action: () => showPausePage("main") },
    ];
  }
  const items = [
    { label: "RESUME", action: closePauseMenu },
    { label: "RESTART LEVEL", action: () => { closePauseMenu(); restartLevel(); } },
    { label: "SETTINGS", action: () => showPausePage("settings") },
  ];
  // DEBUG only: forget the saved records and run (save.js)
  if (DEBUG) items.push({ label: "CLEAR SAVE (DEBUG)", action: clearSave });
  return items;
}

// Where the menu goes (overlayFrame in layout.js), worked out in tiles
// around the middle line: the buttons a tile below it, the panel 1.3
// tiles above the first button (and its title plate 0.9 above that),
// and below the last one the records and the badges (main page)
function pauseMenuFrame() {
  const count = pauseMenuItems().length;
  const total = count * SMALLEST_MENU_BUTTON + (count - 1) * 0.4;
  const first = -total / 2 + 1;
  const below = pauseMenu.page === "settings" ? 0.6 : 2.2 + (heldUpgradeBadges().length ? 2.3 : 0);
  return overlayFrame(first - 1.3 - 0.9, first + total + below);
}

// The menu's buttons with their places on screen, stacked in the
// middle of the map (landscape main page: in the right column)
function pauseMenuLayout() {
  if (isTwoColumnPause()) return (pauseMenu.page === "settings" ? settingsColumns() : pauseColumns()).buttons;
  const { s, cx, cy } = pauseMenuFrame();
  const items = pauseMenuItems();
  const width = s * 9;
  const height = buttonHeight(s * SMALLEST_MENU_BUTTON); // at least 48 px (layout.js)
  const gap = s * 0.4;
  const centerX = cx;
  const totalHeight = items.length * height + (items.length - 1) * gap;
  const top = cy - totalHeight / 2 + s;
  return items.map((item, i) => ({
    ...item,
    x: centerX - width / 2,
    y: top + i * (height + gap),
    width,
    height,
  }));
}

// Landscape: both pages in two columns (fitTwoColumnPanel in layout.js)
function isTwoColumnPause() {
  return isTwoColumnLayout();
}

// Left: the records and under them the held upgrade badges in a list,
// each with its name. Right: the buttons stacked, RESUME the biggest.
// Each column is centered in the height of the taller one.
function pauseColumns() {
  return fitTwoColumnPanel((z, panel) => {
    const { left, right } = panel;
    const gap = z.len(0.3);
    const sizes = pauseMenuItems().map((item, i) => z.touch(i === 0 ? 1.8 : 1.4));
    const rightHeight = sizes.reduce((sum, h) => sum + h, 0) + gap * (sizes.length - 1);

    const font = z.text(0.45);
    const pitch = Math.max(z.len(0.65), font * 1.35);
    const badges = heldUpgradeBadges();
    const size = Math.round(z.len(0.75));
    const nameFont = z.text(0.42);
    const line = Math.max(size, nameFont * 1.2);  // one badge with its name
    const lineGap = z.len(0.2);
    const listTop = pitch * 2 + z.len(0.45);      // under the records and the divider
    const leftHeight = badges.length ? listTop + badges.length * (line + lineGap) - lineGap : pitch * 2;

    const height = Math.max(leftHeight, rightHeight);
    let y = panel.top + (height - rightHeight) / 2;
    const buttons = pauseMenuItems().map((item, i) => {
      const b = { ...item, x: right.x, y, width: right.width, height: sizes[i] };
      y += sizes[i] + gap;
      return b;
    });
    const leftTop = panel.top + (height - leftHeight) / 2;
    const records = [["BEST SCORE", progress.bestScore], ["HIGHEST LEVEL", progress.highestLevel]]
      .map(([label, value], i) => ({ label, value: String(value), y: leftTop + pitch * (i + 0.5) }));
    const list = badges.map((item, i) => ({ ...item, y: leftTop + listTop + i * (line + lineGap) }));
    return {
      height, buttons, records, font, list, size, nameFont, line,
      divider: leftTop + pitch * 2 + z.len(0.15),
    };
  });
}

// Landscape, settings page: the settings in two columns (the three
// sound settings on the left, controls on the right, wider: its labels
// are longer), in the
// order Up/Down goes through them, and BACK centered under both
function settingsColumns() {
  const items = pauseMenuItems();
  const settingItems = items.slice(0, -1);
  const perColumn = Math.ceil(settingItems.length / 2);
  return fitTwoColumnPanel((z, panel) => {
    const height = z.touch(1.4);
    const gap = z.len(0.3);
    const buttons = settingItems.map((item, i) => {
      const column = i < perColumn ? panel.left : panel.right;
      return { ...item, x: column.x, y: panel.top + (i % perColumn) * (height + gap), width: column.width, height };
    });
    const backY = panel.top + perColumn * (height + gap) + z.len(0.2);
    const width = panel.right.width;
    buttons.push({ ...items[items.length - 1], x: panel.x + (panel.width - width) / 2, y: backY, width, height });
    return { height: backY + height - panel.top, buttons };
  }, { split: 0.45, width: settingsPanelWidth() });
}

// The settings panel's width in pixels. With the controls beside the
// playfield it stays between them, so a change shows right away, but at
// least LANDSCAPE.settingsMinWidth units (so the labels keep minText).
// Over the playfield (overlay layout) the controls are under the panel
// anyway.
function settingsPanelWidth() {
  const o = controlZone.overlay;
  const full = o.unit * LANDSCAPE.panelWidth;
  if (controlZone.mode !== "landscape") return full;
  const [leftBox, rightBox] = [controlZone.moveBox, controlZone.fireBox].sort((a, b) => a.x - b.x);
  const between = 2 * Math.min(o.cx - (leftBox.x + leftBox.width), rightBox.x - o.cx) - LANDSCAPE.spacing * 2;
  return clamp(between, o.unit * LANDSCAPE.settingsMinWidth, full);
}

// ---------------------------------------------------------------------
// Input (input.js passes events here while the menu is open)
// ---------------------------------------------------------------------
function pauseMenuTap(x, y) {
  const buttons = pauseMenuLayout();
  buttons.forEach((b, i) => {
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      pauseMenu.selected = i;
      Sound.play("uiTap");
      b.action();
    }
  });
}

// Escape: back / resume. Up/Down choose, Enter or Space press. Escape is
// never preventDefault-ed, the others are, so they
// don't scroll the page.
function pauseMenuKeyDown(event) {
  const code = event.code;
  if (!["Escape", "ArrowUp", "ArrowDown", "Enter", "Space"].includes(code)) return;
  if (code !== "Escape") event.preventDefault();
  if (event.repeat && code !== "ArrowUp" && code !== "ArrowDown") return;

  const count = pauseMenuItems().length;
  if (code === "Escape") {
    if (pauseMenu.page === "settings") showPausePage("main");
    else closePauseMenu();
  }
  if (code === "ArrowUp") pauseMenu.selected = (pauseMenu.selected + count - 1) % count;
  if (code === "ArrowDown") pauseMenu.selected = (pauseMenu.selected + 1) % count;
  if (code === "ArrowUp" || code === "ArrowDown") scrollOverlayTo(pauseMenuLayout()[pauseMenu.selected]);
  if (code === "Enter" || code === "Space") {
    Sound.play("uiTap");
    pauseMenuItems()[pauseMenu.selected].action();
  }
}

// ---------------------------------------------------------------------
// Drawing: the dimmed game with a framed panel (ui.js) behind the
// buttons, the page's title on a metal plate across the panel's top
// edge, and (main page) the records at the bottom of the panel. RESUME
// and BACK are gold, the other buttons steel. The buttons are exactly
// where pauseMenuLayout() puts them, so taps match.
// ---------------------------------------------------------------------
function drawPauseMenu() {
  if (isTwoColumnPause()) {
    if (pauseMenu.page === "settings") drawSettingsColumns();
    else drawPauseColumns();
    return;
  }
  const { s, cx } = pauseMenuFrame();
  const buttons = pauseMenuLayout();
  const settingsPage = pauseMenu.page === "settings";
  const first = buttons[0];
  const last = buttons[buttons.length - 1];

  drawDimmer(0.7);

  // On the settings page, show the controls (in the control zone, below
  // the map, or beside it in landscape) so changes are visible right
  // away. Under the panel, where they are drawn over the map (overlay).
  if (settingsPage) drawControlsPreview();

  // Panel around the buttons (taller on the main page, for the records
  // and the upgrade badges if the player holds any)
  const badges = settingsPage ? [] : heldUpgradeBadges();
  const panel = { x: first.x - s * 0.6, y: first.y - s * 1.3, width: first.width + s * 1.2 };
  panel.height = last.y + last.height - panel.y + (settingsPage ? s * 0.6 : s * 2.2) +
                 (badges.length ? s * 2.3 : 0);
  const frame = drawFramedPanel(panel.x, panel.y, panel.width, panel.height);
  drawTitlePlate(settingsPage ? "SETTINGS" : "PAUSED", cx, panel.y, s * 1.0, "#ffffff", panel.width + s * 0.8);

  // On the main page, the records at the bottom of the panel (save.js)
  // and under them the upgrade badges with their names
  if (!settingsPage) {
    const left = panel.x + frame + s * 0.45;
    const right = panel.x + panel.width - frame - s * 0.45;
    const y = last.y + last.height + s * 0.45;
    drawPanelDivider(left, right, y);
    drawPanelRow("BEST SCORE", String(progress.bestScore), left, right, y + s * 0.55, s * 0.45, "#c9ced6", "#ffffff", false);
    drawPanelRow("HIGHEST LEVEL", String(progress.highestLevel), left, right, y + s * 1.15, s * 0.45, "#c9ced6", "#ffffff", false);
    if (badges.length) drawPauseBadges(badges, left, right, y + s * 1.6);
  }

  // Keyboard players see which button Enter will press
  const showSelection = showKeyboardFocus(); // input.js
  buttons.forEach((b, i) => {
    const primary = b.label === "RESUME" || b.label === "BACK";
    drawUiButton(b, b.label, primary, showSelection && i === pauseMenu.selected);
  });
}

// Landscape, main page: the panel with its title plate, the records and
// the badge list in the left column, the buttons in the right one
// (exactly where pauseColumns() puts them, so taps match)
function drawPauseColumns() {
  const m = pauseColumns();
  const p = m.panel;
  const left = p.left.x;
  const right = p.left.x + p.left.width;

  drawDimmer(0.7);
  drawFramedPanel(p.x, p.y, p.width, p.height);
  drawTitlePlate("PAUSED", p.x + p.width / 2, p.y, p.titleSize, "#ffffff", p.width);

  for (const r of m.records) drawPanelRow(r.label, r.value, left, right, r.y, m.font, "#c9ced6", "#ffffff", false);
  if (m.list.length) {
    drawPanelDivider(left, right, m.divider);
    const textX = left + m.size + m.nameFont * 0.6;
    const fit = m.list.reduce((size, item) => Math.min(size, fitTextSize(item.badge.name, size, right - textX)), m.nameFont);
    const fontSize = Math.max(LANDSCAPE.minText, fit);
    for (const item of m.list) {
      drawUpgradeBadge(item.badge, item.tier, left, item.y + (m.line - m.size) / 2, m.size, 0, 1);
      ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#c9ced6";
      ctx.fillText(item.badge.name, textX, item.y + m.line / 2);
    }
  }

  // Keyboard players see which button Enter will press
  const showSelection = showKeyboardFocus(); // input.js
  m.buttons.forEach((b, i) => drawUiButton(b, b.label, b.label === "RESUME", showSelection && i === pauseMenu.selected));
}

// Landscape, settings page: the controls as they are (beside the panel,
// or under it in the overlay layout), the panel with its title plate and
// the buttons (exactly where settingsColumns() puts them). BACK is gold.
function drawSettingsColumns() {
  const m = settingsColumns();
  const p = m.panel;
  drawDimmer(0.7);
  drawControlsPreview();
  drawFramedPanel(p.x, p.y, p.width, p.height);
  drawTitlePlate("SETTINGS", p.x + p.width / 2, p.y, p.titleSize, "#ffffff", p.width);
  const showSelection = showKeyboardFocus(); // input.js
  m.buttons.forEach((b, i) => drawUiButton(b, b.label, b.label === "BACK", showSelection && i === pauseMenu.selected));
}

// The upgrade badges the player holds (the same pictures as under the
// HUD, hud.js), side by side under a divider at "top", each with its
// name under it, so players can tell what each badge means. All names
// use one font size, shrunk until the longest fits its slot.
function drawPauseBadges(badges, left, right, top) {
  const { s } = pauseMenuFrame();
  const count = UPGRADE_BADGES.length;
  const slot = Math.min(s * 2.2, (right - left) / count);
  const size = Math.round(Math.min(s * 1.1, slot * 0.8));
  const start = (left + right) / 2 - (badges.length * slot) / 2;
  drawPanelDivider(left, right, top);

  let fontSize = s * 0.36;
  for (const item of badges) fontSize = Math.min(fontSize, fitTextSize(item.badge.name, s * 0.36, slot - s * 0.15));
  ctx.font = "bold " + Math.round(fontSize) + "px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#c9ced6";
  badges.forEach((item, i) => {
    const cx = start + (i + 0.5) * slot;
    drawUpgradeBadge(item.badge, item.tier, cx - size / 2, top + s * 0.3, size, 0, 1);
    ctx.fillText(item.badge.name, cx, top + s * 0.3 + size + s * 0.35);
  });
}

// The controls exactly as they are in the control zone (D-pad or the
// joystick hint ring, and the fire button), over the dark overlay
function drawControlsPreview() {
  drawControls();
}
