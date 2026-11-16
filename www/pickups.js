// =====================================================================
//  Pick-ups - coins, the power-up on the field and timed effects
//
//  The power-up types (look + effect) are in powerups.js.
// =====================================================================

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
        // A gold sparkle and "+8" floating up (explosions.js)
        addSpark(coin.x + 0.5, coin.y + 0.5, FEEDBACK.goldColor, 0.7);
        addFloatingText(coin.x + 0.5, coin.y + 0.5, "+" + coin.gold, FEEDBACK.goldColor);
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
    // A ring in the power-up's color around the player (explosions.js)
    addRing(player.x + 0.5, player.y + 0.5, POWERUP_TYPES[type].color);
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
