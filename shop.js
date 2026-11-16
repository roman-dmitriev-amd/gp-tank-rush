// =====================================================================
//  Shop - opens between levels (after the level summary).
//  Prices and upgrade values are in config.js (SHOP).
//
//  This file has:
//    - "upgrades": what the player has bought in this run
//    - SHOP_ITEMS: the items for sale (name, icon, price, what it does)
//    - the shop screen: drawing, scrolling, tapping and keys
//  The game (game.js) only opens the shop, passes input to it and
//  calls drawShop() while it's open.
// =====================================================================

// ---------------------------------------------------------------------
// Upgrades bought in this run (all lost on game over / "Play again")
// ---------------------------------------------------------------------
let upgrades = freshUpgrades();

function freshUpgrades() {
  return {
    bulletTier: 0,          // 0-3
    speedTier: 0,           // 0-3
    livesBought: 0,         // 0-3
    hasArmor: false,        // survives one hit, kept until it breaks
    baseSteelPending: false // next level starts with metal base walls
  };
}

function resetUpgrades() {
  upgrades = freshUpgrades();
}

// Put the permanent upgrades on the player's tank
function applyUpgradesToPlayer() {
  player.speed = PLAYER_SPEED * (1 + upgrades.speedTier * SHOP.tankSpeed.bonusPerTier);
  player.maxBullets = upgrades.bulletTier >= 3 ? SHOP.bullet.maxBulletsAtTier3 :
                      upgrades.bulletTier >= 2 ? SHOP.bullet.maxBulletsAtTier2 : 1;
  if (upgrades.bulletTier >= 3) player.armorPiercing = true;
}

// How fast the player's bullets fly (bullet upgrade tier 1+)
function playerBulletSpeed() {
  const bonus = upgrades.bulletTier >= 1 ? SHOP.bullet.speedBonus : 0;
  return PLAYER_BULLET_SPEED * (1 + bonus);
}

// ---------------------------------------------------------------------
// Items for sale
// Each item has:
//   name
//   badge         its round badge: { color, paintSymbol } (painted with
//                 paintRoundBadge in powerups.js, like the power-ups)
//   tier()        how many the player has bought
//   maxTier       how many can be bought
//   price()       price of the next one
//   description() what the NEXT purchase does
//   buy()         apply the purchase (gold is taken by the shop)
// ---------------------------------------------------------------------
const BULLET_TIER_TEXT = [
  "Bullets fly " + Math.round(SHOP.bullet.speedBonus * 100) + "% faster",
  "Shoot " + SHOP.bullet.maxBulletsAtTier2 + " bullets at once",
  "Armor-piercing, " + SHOP.bullet.maxBulletsAtTier3 + " bullets at once",
];

// Badge looks (color and symbol) shared by the shop cards and the
// upgrade badges below
const BULLET_BADGE = { color: "#ffb04a", paintSymbol: paintBulletSymbol };
const SPEED_BADGE = { color: "#7ee081", paintSymbol: paintSpeedSymbol };
const BASE_STEEL_BADGE = { color: "#c4ccd4", paintSymbol: paintBaseSteelSymbol };

const SHOP_ITEMS = [
  {
    name: "Bullet upgrade",
    badge: BULLET_BADGE,
    tier: () => upgrades.bulletTier,
    maxTier: 3,
    price: () => SHOP.bullet.prices[upgrades.bulletTier],
    description: () => BULLET_TIER_TEXT[upgrades.bulletTier] || "All bullet upgrades",
    buy: () => {
      upgrades.bulletTier += 1;
      applyUpgradesToPlayer();
    },
  },
  {
    name: "Tank speed",
    badge: SPEED_BADGE,
    tier: () => upgrades.speedTier,
    maxTier: 3,
    price: () => SHOP.tankSpeed.prices[upgrades.speedTier],
    description: () => {
      const now = Math.round(upgrades.speedTier * SHOP.tankSpeed.bonusPerTier * 100);
      const step = Math.round(SHOP.tankSpeed.bonusPerTier * 100);
      return "+" + step + "% speed (now +" + now + "%)";
    },
    buy: () => {
      upgrades.speedTier += 1;
      applyUpgradesToPlayer();
    },
  },
  {
    name: "Extra life",
    badge: { color: "#ff5a6e", paintSymbol: paintHeartSymbol },
    tier: () => upgrades.livesBought,
    maxTier: 3,
    price: () => SHOP.extraLife.prices[upgrades.livesBought],
    description: () => "+1 life right now (have " + lives + ")",
    buy: () => {
      upgrades.livesBought += 1;
      lives += 1;
    },
  },
  {
    name: "Armor",
    badge: ARMOR_BADGE,   // a silver badge (powerups.js)
    tier: () => (upgrades.hasArmor ? 1 : 0),
    maxTier: 1,
    price: () => SHOP.armor.price,
    description: () => "Survive one hit, then it breaks",
    buy: () => {
      upgrades.hasArmor = true;
    },
  },
  {
    name: "Base steel",
    badge: BASE_STEEL_BADGE,
    tier: () => (upgrades.baseSteelPending ? 1 : 0),
    maxTier: 1,
    price: () => SHOP.baseSteel.price,
    description: () => "Metal base walls for " + BASE_STEEL_START_SECONDS + "s",
    buy: () => {
      upgrades.baseSteelPending = true;
    },
  },
];

// ---------------------------------------------------------------------
// Upgrade badges: what the player holds, shown under the HUD display
// and in the pause menu (drawn in game.js, see drawUpgradeBadge).
// Each has:
//   id       names the badge's cached pictures and its flash
//   name     shown under it in the pause menu
//   look     icon color and symbol (like the shop badges)
//   tiers    how many tier dots it has (0 = none, just the icon)
//   tier()   what the player has now: 0 = no badge
// ---------------------------------------------------------------------
const UPGRADE_BADGES = [
  { id: "bullet", name: "BULLETS", look: BULLET_BADGE, tiers: 3, tier: () => upgrades.bulletTier },
  { id: "speed", name: "TANK SPEED", look: SPEED_BADGE, tiers: 3, tier: () => upgrades.speedTier },
  // A silver shield, held until the armor breaks
  { id: "armor", name: "ARMOR", look: { color: PLAYER_LOOKS.armor.body, paintSymbol: paintShield },
    tiers: 0, tier: () => (upgrades.hasArmor ? 1 : 0) },
  // Held until the next level starts and uses it
  { id: "steel", name: "BASE STEEL", look: BASE_STEEL_BADGE, tiers: 0,
    tier: () => (upgrades.baseSteelPending ? 1 : 0) },
];

function isMaxed(item) {
  return item.tier() >= item.maxTier;
}

function canAfford(item) {
  return gold >= item.price();
}

// Try to buy an item: works if it's not maxed and there's enough gold,
// otherwise the card shakes
function tryBuy(index) {
  const item = SHOP_ITEMS[index];
  if (isMaxed(item) || !canAfford(item)) {
    shop.shake[index] = SHOP_SHAKE_TIME;
    Sound.play("cantAfford");
    return;
  }
  Sound.play("purchase");
  const price = item.price();
  gold -= price;
  item.buy();
  if (DEBUG) {
    console.log("[Shop] Bought " + item.name + " (" + item.tier() + "/" + item.maxTier +
                ") for " + price + " gold. Gold left: " + gold);
  }
}

// ---------------------------------------------------------------------
// Shop screen state (its timings, SHOP_SHAKE_TIME, SHOP_INPUT_DELAY and
// SHOP_DRAG_START, are in config.js)
// ---------------------------------------------------------------------
const shop = {
  scrollY: 0,       // how far the card list is scrolled, in pixels
  selected: 0,      // card chosen with the keyboard
  shake: {},        // card index -> seconds of shaking left
  pointer: null,    // the finger/mouse currently pressed on the shop
};

function openShop() {
  shop.scrollY = 0;
  shop.selected = 0;
  shop.shake = {};
  shop.pointer = null;
  setState(GAME_STATE.SHOP);
  writeSave(); // saves the run as it is now (save.js)
}

function startNextLevelFromShop() {
  Sound.play("uiTap");
  startLevel(levelIndex + 1);
}

function updateShop(deltaSeconds) {
  for (const index of Object.keys(shop.shake)) {
    shop.shake[index] -= deltaSeconds;
    if (shop.shake[index] <= 0) delete shop.shake[index];
  }
}

// ---------------------------------------------------------------------
// Layout: where everything goes, in screen pixels.
// Portrait: the same area as the playfield, plus the control zone below
// it (no controls there while shopping), with the header, the next-level
// panel and one column of cards.
// Landscape: centered on the screen in its own unit (shopGridPlace):
// the header and the next-level panel side by side, the cards in a grid
// of 3 columns (2 if 3 don't fit) under them. Either way the cards
// scroll if they don't fit, and START is at the bottom.
// ---------------------------------------------------------------------
const SHOP_CARD_HEIGHT = 2.3;  // in units (tiles in portrait)
const SHOP_CARD_GAP = 0.3;
const SHOP_BUTTON_HEIGHT = 1.6;
const SHOP_GRID_TOP = 3.1;     // landscape: from the top to the first row of cards
const SHOP_GRID_BOTTOM = 2.3;  //   and from the last row to the bottom (the button and its gaps)
const SHOP_SCROLL_BAR = 0.5;   //   room kept on the right for the scroll bar

// Landscape: the shop's unit and grid for a layout (computeLayout in
// game.js calls this). The unit is big enough for minTouch buttons
// (no smaller than the tiles); 3 columns of cards if they fit at least
// shopCardWidth units wide each, otherwise 2. Cards are at most
// shopCardMax units wide; in narrow windows 2 cards may be narrower than
// shopCardWidth (their text shrinks), and only below SHOP_CARD_MIN units
// is the unit made smaller.
const SHOP_CARD_MIN = 7;

function shopGridPlace(layout) {
  const L = LANDSCAPE;
  const safe = layout.safe;
  const left = safe.left + L.spacing;
  const right = layout.width - safe.right - L.spacing;
  const roomTop = safe.top + L.spacing;
  const roomBottom = layout.height - safe.bottom - L.spacing;
  const widthIn = (cols, card) => cols * card + (cols - 1) * SHOP_CARD_GAP + SHOP_SCROLL_BAR; // in units

  let s = Math.max(uprightTileSize(layout), L.minTouch / SHOP_BUTTON_HEIGHT); // game.js
  const cols = widthIn(3, L.shopCardWidth) * s <= right - left ? 3 : 2;
  s = Math.min(s, (right - left) / widthIn(cols, SHOP_CARD_MIN));
  const card = Math.min(L.shopCardMax, ((right - left) / s - widthIn(cols, 0)) / cols);
  const width = widthIn(cols, card) * s;
  const rows = Math.ceil(SHOP_ITEMS.length / cols);
  const height = (SHOP_GRID_TOP + rows * SHOP_CARD_HEIGHT + (rows - 1) * SHOP_CARD_GAP + SHOP_GRID_BOTTOM) * s;
  const top = roomTop + Math.max(0, (roomBottom - roomTop - height) / 2);
  return {
    s, cols, cardWidth: card * s, width,
    left: (left + right - width) / 2, top, bottom: Math.min(top + height, roomBottom),
  };
}

function shopLayout() {
  const grid = controlZone.shop;
  const s = grid ? grid.s : field.tileSize;
  const left = grid ? grid.left : field.x;
  const width = grid ? grid.width : s * GRID_COLS;
  const top = grid ? grid.top : field.y;
  const bottom = grid ? grid.bottom : controlZone.zone.y + controlZone.zone.height;

  const button = { width: s * 8, height: buttonHeight(s * SHOP_BUTTON_HEIGHT) }; // at least 48 px (game.js)
  button.x = left + (width - button.width) / 2;
  button.y = bottom - button.height - s * 0.3;

  // Header (SHOP and your gold) and the next level's panel: one under
  // the other in portrait, side by side in landscape (the header one
  // card wide)
  let header, next, list;
  if (grid) {
    header = { x: left, y: top + s * 0.05, width: grid.cardWidth, height: s * 2.68 };
    next = { x: left + grid.cardWidth + s * SHOP_CARD_GAP, y: header.y, height: header.height };
    next.width = left + width - next.x;
    list = { x: left, width: width - s * SHOP_SCROLL_BAR, top: top + s * SHOP_GRID_TOP, bottom: button.y - s * 0.4 };
  } else {
    header = { x: left, y: top + s * 0.05, width, height: s * 1.5 };
    next = { x: left, y: top + s * 1.62, width, height: s * 2.68 };
    list = { x: left + s * 0.5, width: width - s, top: top + s * 4.4, bottom: button.y - s * 0.4 };
  }
  const cols = grid ? grid.cols : 1;
  const card = { height: s * SHOP_CARD_HEIGHT, gap: s * SHOP_CARD_GAP, cols };
  card.width = (list.width - (cols - 1) * card.gap) / cols;
  const rows = Math.ceil(SHOP_ITEMS.length / cols);
  const contentHeight = rows * (card.height + card.gap) - card.gap;
  const maxScroll = Math.max(0, contentHeight - (list.bottom - list.top));

  return { s, left, width, top, bottom, button, header, next, list, card, maxScroll };
}

// Where card number "index" is now (scrolled): { x, y, width, height }
function cardRect(layout, index) {
  const card = layout.card;
  const col = index % card.cols;
  const row = Math.floor(index / card.cols);
  return {
    x: layout.list.x + col * (card.width + card.gap),
    y: layout.list.top + row * (card.height + card.gap) - shop.scrollY,
    width: card.width,
    height: card.height,
  };
}

function clampScroll() {
  shop.scrollY = clamp(shop.scrollY, 0, shopLayout().maxScroll);
}

// ---------------------------------------------------------------------
// Input (game.js passes events here while the shop is open)
// ---------------------------------------------------------------------
function shopPointerDown(x, y, pointerId) {
  if (stateTimer < SHOP_INPUT_DELAY || shop.pointer) return;
  shop.pointer = { id: pointerId, startX: x, startY: y, startScroll: shop.scrollY, dragging: false };
}

function shopPointerMove(x, y, pointerId) {
  const p = shop.pointer;
  if (!p || p.id !== pointerId) return;
  const dy = y - p.startY;
  if (Math.abs(dy) > SHOP_DRAG_START) p.dragging = true;
  if (p.dragging) {
    shop.scrollY = p.startScroll - dy;   // finger up = list scrolls down
    clampScroll();
  }
}

function shopPointerUp(x, y, pointerId) {
  const p = shop.pointer;
  if (!p || p.id !== pointerId) return;
  shop.pointer = null;
  if (!p.dragging) shopTap(x, y);        // a tap, not a scroll
}

function shopWheel(deltaY) {
  shop.scrollY += deltaY;
  clampScroll();
}

function shopTap(x, y) {
  const layout = shopLayout();
  const b = layout.button;
  if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
    startNextLevelFromShop();
    return;
  }

  // Only cards inside the visible list area can be tapped
  const list = layout.list;
  if (x < list.x || x > list.x + list.width || y < list.top || y > list.bottom) return;
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    if (isInsideRect(cardRect(layout, i), x, y)) {
      shop.selected = i;
      tryBuy(i);
      return;
    }
  }
}

// Keyboard: Up/Down choose a card (in a grid: the next or previous one),
// Space buys it, Enter starts the level
function shopKeyDown(event) {
  const code = event.code;
  if (!["ArrowUp", "ArrowDown", "Space", "Enter"].includes(code)) return;
  event.preventDefault();
  if (event.repeat && code !== "ArrowUp" && code !== "ArrowDown") return;
  if (stateTimer < SHOP_INPUT_DELAY) return;

  if (code === "ArrowUp") shop.selected = Math.max(0, shop.selected - 1);
  if (code === "ArrowDown") shop.selected = Math.min(SHOP_ITEMS.length - 1, shop.selected + 1);
  if (code === "Space") tryBuy(shop.selected);
  if (code === "Enter") startNextLevelFromShop();

  // Scroll so the chosen card is fully visible
  const layout = shopLayout();
  const top = cardRect(layout, shop.selected).y;
  if (top < layout.list.top) shop.scrollY -= layout.list.top - top;
  const bottom = top + layout.card.height;
  if (bottom > layout.list.bottom) shop.scrollY += bottom - layout.list.bottom;
  clampScroll();
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
// The shop on a dark metal background (ui.js): a framed header with
// SHOP and your gold, a framed panel with the next level and its
// enemies, the item cards and the gold START button. Every positioned
// thing (cards, button) is where shopLayout() says, so taps match.
function drawShop() {
  clampScroll(); // in case the screen size changed
  const layout = shopLayout();
  const { s, left, width, header, next } = layout;

  drawMetalBackground();

  // Header: SHOP on the left, a coin and your gold on the right
  const frame = drawFramedPanel(header.x, header.y, header.width, header.height);
  const headerY = header.y + header.height / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold " + Math.round(s * 0.85) + "px sans-serif";
  ctx.fillText("SHOP", header.x + frame + s * 0.4, headerY);
  const goldText = String(gold);
  const goldRight = header.x + header.width - frame - s * 0.4;
  ctx.textAlign = "right";
  ctx.fillStyle = "#f5c542";
  ctx.font = "bold " + Math.round(s * 0.75) + "px sans-serif";
  ctx.fillText(goldText, goldRight, headerY);
  const coinSize = s * 0.8;
  const coinX = goldRight - ctx.measureText(goldText).width - s * 0.25 - coinSize;
  ctx.drawImage(coinPicture(coinSize), coinX, headerY - coinSize / 2, coinSize, coinSize);

  // Next level: "NEXT: LEVEL 2" and enemy counts by type
  const nextIndex = levelIndex + 1;
  const cx = next.x + next.width / 2;
  drawFramedPanel(next.x, next.y, next.width, next.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#c9ced6";
  ctx.font = "bold " + Math.round(s * 0.5) + "px sans-serif";
  ctx.fillText("NEXT: LEVEL " + (nextIndex + 1), cx, next.y + s * 0.48);
  drawEnemyPreview(levelAt(nextIndex), cx, next.y + s * 1.33, s);

  // Keyboard hint, only on computers (no touch screen)
  if (!navigator.maxTouchPoints) {
    ctx.fillStyle = "#8a909a";
    ctx.textAlign = "center";
    fitText("Up/Down: choose   Space: buy   Enter: start", cx, next.y + s * 2.1, next.width - s * 1.2, s * 0.36);
  }

  // Card list, clipped to its area so scrolled cards don't overlap
  const list = layout.list;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 4, list.top, width + 8, list.bottom - list.top);
  ctx.clip();
  for (let i = 0; i < SHOP_ITEMS.length; i++) drawShopCard(layout, i);
  ctx.restore();

  // Scroll bar, only if the list doesn't fit: a dark track with a light thumb
  if (layout.maxScroll > 0) {
    const listHeight = list.bottom - list.top;
    const barHeight = listHeight * listHeight / (listHeight + layout.maxScroll);
    const barY = list.top + (listHeight - barHeight) * (shop.scrollY / layout.maxScroll);
    const barX = left + width - s * 0.22;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(barX, list.top, s * 0.12, listHeight);
    ctx.fillStyle = CONTROL_LOOK.metal[0];
    ctx.fillRect(barX, barY, s * 0.12, barHeight);
  }

  drawUiButton(layout.button, "START LEVEL " + (nextIndex + 1), true, false, stateTimer >= SHOP_INPUT_DELAY);
}

// A row of small enemy tanks with "x3" next to each type, "s" pixels
// per unit (the tanks are one unit big)
function drawEnemyPreview(level, centerX, y, s) {
  const counts = {};
  for (const name of level.enemies) counts[name] = (counts[name] || 0) + 1;
  const names = Object.keys(counts);

  const itemWidth = s * 2.6;
  let x = centerX - (names.length * itemWidth) / 2;
  for (const name of names) {
    const type = ENEMY_TYPES[name] || ENEMY_TYPES.basic;
    // In portrait exactly a tile; in landscape the shop's unit
    const tank = { facing: "up", colors: type.colors, look: type.look, flashTimer: 0 };
    if (!field.turned && s === field.tileSize) drawTank({ ...tank, x: (x - field.x) / s, y: (y - field.y) / s - 0.5 });
    else drawTank(tank, null, { x, y: y - s / 2, size: s });
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold " + Math.round(s * 0.55) + "px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("x" + counts[name], x + s * 1.1, y);
    x += itemWidth;
  }
}

function drawShopCard(layout, index) {
  const { s, list } = layout;
  const item = SHOP_ITEMS[index];
  const maxed = isMaxed(item);
  const affordable = canAfford(item);

  // Shake sideways when a purchase fails
  const place = cardRect(layout, index);
  let x = place.x;
  if (shop.shake[index]) x += Math.sin(shop.shake[index] * 60) * s * 0.2;
  const y = place.y;
  const w = place.width;
  const h = place.height;
  if (y > list.bottom || y + h < list.top) return; // off screen

  // Greyed out when maxed (it can't be bought any more), its frame and
  // badge dimmed when too expensive (the text stays bright, so it keeps
  // its contrast; the price shows red)
  const dim = maxed ? 0.45 : affordable ? 1 : 0.65;
  ctx.globalAlpha = dim;

  // The card: a framed dark panel (ui.js), lighter while the mouse is
  // over it and darker while it's pressed, an amber outline when chosen
  const frame = drawFramedPanel(x, y, w, h);
  const listArea = { x: list.x, y: list.top, width: list.width, height: list.bottom - list.top };
  const look = buttonPointerLook(place, !maxed && stateTimer >= SHOP_INPUT_DELAY &&
                                        isInsideRect(listArea, uiPointer.x, uiPointer.y)); // ui.js, game.js
  if (look) {
    ctx.fillStyle = look === "pressed" ? CONTROL_LOOK.pressedShade : CONTROL_LOOK.hover;
    roundedRect(ctx, x, y, w, h, Math.min(h * 0.14, frame * 2.4));
    ctx.fill();
  }
  if (index === shop.selected) {
    ctx.strokeStyle = CONTROL_LOOK.pressed;
    ctx.lineWidth = Math.max(2, s * 0.08);
    roundedRect(ctx, x - 1, y - 1, w + 2, h + 2, Math.min(h * 0.14, frame * 2.4) + 1);
    ctx.stroke();
  }

  // The item's round badge on the left (cached)
  const iconSize = h - frame * 2 - s * 0.2;
  const iconX = x + frame + s * 0.15;
  const iconY = y + (h - iconSize) / 2;
  const badge = cachedPicture("shopBadge" + index + Math.round(iconSize), iconSize, iconSize,
    (c) => paintRoundBadge(c, iconSize, item.badge));
  ctx.drawImage(badge, iconX, iconY, iconSize, iconSize);

  // Name (smaller if it would reach the tier pips, on narrow cards) and
  // description
  if (!maxed) ctx.globalAlpha = 1;
  const textX = iconX + iconSize + s * 0.3;
  const textRight = x + w - frame - s * 0.35;
  const pipsWidth = item.maxTier * s * 0.13 * 2.8 + s * 0.2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold " + Math.round(fitTextSize(item.name, s * 0.6, textRight - textX - pipsWidth)) + "px sans-serif";
  ctx.fillText(item.name, textX, y + h * 0.32);
  ctx.fillStyle = "#b8bdc6";
  fitText(item.description(), textX, y + h * 0.68, textRight - textX - s * 2.2, s * 0.45);

  // Tier at the top right: one pip per level, gold once bought
  const pip = s * 0.13;
  for (let i = 0; i < item.maxTier; i++) {
    const px = textRight - pip - (item.maxTier - 1 - i) * pip * 2.8;
    const bought = i < item.tier();
    disc(ctx, px, y + h * 0.32, pip + 1, CONTROL_LOOK.metal[3]);
    disc(ctx, px, y + h * 0.32, pip, bought ? BASE_LOOK.gold[1] : CONTROL_LOOK.metal[2]);
    if (bought) disc(ctx, px - pip * 0.3, y + h * 0.32 - pip * 0.3, pip * 0.35, BASE_LOOK.gold[0]);
  }

  // Price with a coin at the bottom right (red when you can't afford
  // it), or MAX
  ctx.textAlign = "right";
  ctx.font = "bold " + Math.round(s * 0.6) + "px sans-serif";
  if (maxed) {
    ctx.fillStyle = "#7ee081";
    ctx.fillText("MAX", textRight, y + h * 0.68);
  } else {
    ctx.fillStyle = affordable ? "#f5c542" : "#ff6b5b";
    const priceText = String(item.price());
    ctx.fillText(priceText, textRight, y + h * 0.68);
    const coinSize = s * 0.5;
    const coinX = textRight - ctx.measureText(priceText).width - s * 0.15 - coinSize;
    ctx.drawImage(coinPicture(coinSize), coinX, y + h * 0.68 - coinSize / 2, coinSize, coinSize);
  }

  ctx.globalAlpha = 1;
}

// Draw text, making the font smaller if it's too wide for the space
function fitText(text, x, y, maxWidth, fontSize) {
  let size = fontSize;
  ctx.font = Math.round(size) + "px sans-serif";
  while (ctx.measureText(text).width > maxWidth && size > 6) {
    size -= 1;
    ctx.font = Math.round(size) + "px sans-serif";
  }
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------------
// Item badge symbols: paintSymbol(c, cx, cy, size, color) on context c,
// like the power-up symbols in powerups.js (a dark outline first, then
// the symbol's color, lighter at the top). Painted once and cached.
// ---------------------------------------------------------------------

// Bullet upgrade: a shell standing up, a brass case with a copper tip
function paintBulletSymbol(c, cx, cy, size, color) {
  const w = size * 0.28;
  const outline = Math.max(1, size * 0.05);
  const caseTop = cy - size * 0.04;
  const bottom = cy + size * 0.4;
  const tip = cy - size * 0.42;
  const shell = (grow) => {
    c.beginPath();
    c.moveTo(cx - w / 2 - grow, bottom + grow);
    c.lineTo(cx - w / 2 - grow, caseTop);
    c.quadraticCurveTo(cx - w / 2 - grow, tip + size * 0.06 - grow, cx, tip - grow);
    c.quadraticCurveTo(cx + w / 2 + grow, tip + size * 0.06 - grow, cx + w / 2 + grow, caseTop);
    c.lineTo(cx + w / 2 + grow, bottom + grow);
    c.closePath();
  };
  shell(outline);
  c.fillStyle = symbolOutline(color);
  c.fill();
  c.save();
  shell(0);
  c.clip();
  c.fillStyle = symbolFill(c, cy, size, color);                       // tip
  c.fillRect(cx - w, tip, w * 2, caseTop - tip);
  c.fillStyle = symbolFill(c, cy, size, BASE_LOOK.gold[1]);           // brass case
  c.fillRect(cx - w, caseTop, w * 2, bottom - caseTop);
  c.fillStyle = "rgba(255, 255, 255, 0.35)";                          // shine down the left side
  c.fillRect(cx - w / 2, tip, w * 0.3, bottom - tip);
  c.restore();
  c.fillStyle = symbolOutline(BASE_LOOK.gold[1]);                     // rim at the bottom
  c.fillRect(cx - w / 2 - outline, bottom - size * 0.07, w + outline * 2, outline);
}

// Tank speed: two forward chevrons
function paintSpeedSymbol(c, cx, cy, size, color) {
  c.lineJoin = "round";
  c.lineCap = "round";
  const chevrons = () => {
    c.beginPath();
    for (const dx of [-0.15, 0.13]) {
      c.moveTo(cx + (dx - 0.11) * size, cy - size * 0.24);
      c.lineTo(cx + (dx + 0.11) * size, cy);
      c.lineTo(cx + (dx - 0.11) * size, cy + size * 0.24);
    }
  };
  const width = Math.max(2, size * 0.13);
  chevrons();
  c.strokeStyle = symbolOutline(color);
  c.lineWidth = width + Math.max(2, size * 0.1);
  c.stroke();
  chevrons();
  c.strokeStyle = symbolFill(c, cy, size * 0.5, color);
  c.lineWidth = width;
  c.stroke();
}

// Extra life: a heart with a shine on its upper left
function paintHeartSymbol(c, cx, cy, size, color) {
  const r = size * 0.17;
  const heart = (grow) => {
    c.beginPath();
    c.arc(cx - r, cy - r * 0.6, r + grow, Math.PI * 0.8, 0);
    c.arc(cx + r, cy - r * 0.6, r + grow, Math.PI, Math.PI * 0.2);
    c.lineTo(cx, cy + size * 0.34 + grow * 1.4);
    c.closePath();
  };
  heart(Math.max(1, size * 0.05));
  c.fillStyle = symbolOutline(color);
  c.fill();
  heart(0);
  c.fillStyle = symbolFill(c, cy, size * 0.7, color);
  c.fill();
  disc(c, cx - r * 1.2, cy - r * 0.9, r * 0.35, "rgba(255, 255, 255, 0.6)");
}

// Base steel: a steel plate (like fortify's) with the base's gold star on it
function paintBaseSteelSymbol(c, cx, cy, size, color) {
  paintMetalBlock(c, cx, cy, size, color);
  paintGoldStar(c, cx, cy, size * 0.2, size * 0.085, BASE_LOOK.gold, []);
}

// Extra life: a heart (the HUD's lives counter)
function drawLifeIcon(cx, cy, size) {
  const r = size * 0.15;
  ctx.fillStyle = "#ff5a6e";
  ctx.beginPath();
  ctx.arc(cx - r, cy - r * 0.5, r, Math.PI, 0);
  ctx.arc(cx + r, cy - r * 0.5, r, Math.PI, 0);
  ctx.lineTo(cx, cy + size * 0.28);
  ctx.closePath();
  ctx.fill();
}
