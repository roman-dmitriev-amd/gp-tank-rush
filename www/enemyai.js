// =====================================================================
//  Enemy tanks - spawning, driving, shooting, being hit
//
//  The enemy types are data in enemies.js; the numbers are in config.js.
// =====================================================================

// ---------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Would the enemy drive straight into something it can never get
// through (water or the edge of the map) by going "dir"? Walls that
// bullets can break are fine: enemies drive at them and shoot.
function enemyDirectionClosed(enemy, dir) {
  const step = DIRECTIONS[dir];
  const aheadX = enemy.x + step.x * 0.5;  // half a tile ahead
  const aheadY = enemy.y + step.y * 0.5;
  return tankTouchesTile(aheadX, aheadY, (m) => m.blocksTank && m.health === null);
}

// Pick a random direction, using ENEMY_DIRECTION_WEIGHTS so "down"
// comes up more often. "avoid" (optional) is a direction we don't want,
// e.g. the one that just got us stuck. Directions that run straight
// into water are skipped too (unless nothing else is left).
function randomEnemyDirection(enemy, avoid) {
  let choices = Object.keys(ENEMY_DIRECTION_WEIGHTS).filter((d) => d !== avoid);
  const open = choices.filter((d) => !enemyDirectionClosed(enemy, d));
  if (open.length > 0) choices = open;
  let total = 0;
  for (const d of choices) total += ENEMY_DIRECTION_WEIGHTS[d];
  let roll = Math.random() * total;
  for (const d of choices) {
    roll -= ENEMY_DIRECTION_WEIGHTS[d];
    if (roll < 0) return d;
  }
  return choices[0];
}

// The spawn point the next enemy will use: the next one in line, or the
// one after it if a tank is standing there (-1: all are blocked)
function freeSpawnPointIndex() {
  for (let i = 0; i < SPAWN_POINTS.length; i++) {
    const index = (nextSpawnPoint + i) % SPAWN_POINTS.length;
    const point = SPAWN_POINTS[index];
    if (!allTanks().some((t) => tanksOverlap(t.x, t.y, point.x, point.y))) return index;
  }
  return -1;
}

// Where to show the spawn warning (feedback.js) right now: the point the
// next enemy will use, during the last FEEDBACK.spawnWarning seconds of
// the spawn delay (the delay only runs while there is room on the field,
// so the star never shows early). null = no enemy is about to appear.
function nextSpawnWarning() {
  if (enemiesSpawned >= currentLevel().enemies.length) return null;
  if (spawnTimer > FEEDBACK.spawnWarning) return null;
  const index = freeSpawnPointIndex();
  return index < 0 ? null : SPAWN_POINTS[index];
}

// Spawn a new enemy now and then, if there's room
function updateSpawning(deltaSeconds) {
  const levelEnemies = currentLevel().enemies;
  if (enemiesSpawned >= levelEnemies.length) return;   // all used up
  if (enemies.length >= MAX_ENEMIES_ON_SCREEN) return; // screen is full

  spawnTimer -= deltaSeconds;
  if (spawnTimer > 0) return;

  // The next spawn point in line that has no tank standing on it
  {
    const index = freeSpawnPointIndex();
    if (index < 0) return; // every spawn point is blocked: try again next frame
    const point = SPAWN_POINTS[index];

    // The next enemy in the level's list decides the type
    const type = ENEMY_TYPES[levelEnemies[enemiesSpawned]] || ENEMY_TYPES.basic;
    const enemy = createTank(point.x, point.y, "down", enemySpeed(type), type.colors);
    enemy.type = type;
    enemy.typeName = ENEMY_TYPES[levelEnemies[enemiesSpawned]] ? levelEnemies[enemiesSpawned] : "basic";
    enemy.look = type.look;
    enemy.health = type.health;
    enemy.flashTimer = 0;        // > 0 while flashing white after a hit
    // Every Nth enemy blinks and drops a power-up when destroyed
    enemy.carriesPowerUp = (enemiesSpawned + 1) % POWERUPS.flashingEnemyEvery === 0;
    enemy.wantedDir = "down";
    enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    enemy.fireTimer = enemyFireDelay(type);
    enemies.push(enemy);
    enemiesSpawned += 1;
    nextSpawnPoint = (index + 1) % SPAWN_POINTS.length;
    spawnTimer = ENEMY_SPAWN_DELAY;
  }
}

// Simple AI: drive, turn now and then (or when stuck), shoot at random
function updateEnemies(deltaSeconds) {
  for (const enemy of enemies) {
    enemy.flashTimer = Math.max(0, enemy.flashTimer - deltaSeconds);

    // Clock power-up: enemies can't move or shoot
    if (isEffectActive("clock") || debugFreezeEnemies) continue;

    // Time to pick a new direction?
    // (We store it in "wantedDir"; moveTank does the actual turning,
    // so the tank snaps to the grid properly.)
    enemy.turnTimer -= deltaSeconds;
    if (enemy.turnTimer <= 0) {
      enemy.wantedDir = randomEnemyDirection(enemy);
      enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    }

    // Drive; if something is in the way, pick another direction
    const drivenDir = enemy.wantedDir;
    const blocked = moveTank(enemy, drivenDir, deltaSeconds);
    updateIceSlide(enemy, drivenDir, deltaSeconds);
    if (blocked) {
      enemy.wantedDir = randomEnemyDirection(enemy, enemy.wantedDir);
      enemy.turnTimer = randomBetween(ENEMY_TURN_MIN, ENEMY_TURN_MAX);
    }

    // Time to shoot?
    enemy.fireTimer -= deltaSeconds;
    if (enemy.fireTimer <= 0) {
      fireBullet(enemy, enemy.type.bulletSpeed);
      enemy.fireTimer = enemyFireDelay(enemy.type);
    }
  }
}

// A player bullet hit this enemy: take away 1 health. If some is left,
// flash white (and maybe change color); otherwise it's destroyed.
function hitEnemy(enemy) {
  enemy.health -= 1;
  if (enemy.health <= 0) {
    destroyEnemy(enemy);
    return;
  }
  Sound.play("heavyHit"); // hit, but it has health left (a metal clank)
  enemy.flashTimer = ENEMY_HIT_FLASH_TIME;
  const damaged = enemy.type.damagedColors;
  if (damaged && damaged[enemy.health]) enemy.colors = damaged[enemy.health];
}

function destroyEnemy(enemy) {
  addTankBlast(enemy);
  Sound.play("explosion");
  addShake("enemy"); // feedback.js
  addFloatingText(enemy.x + 0.5, enemy.y + 0.5, "+" + enemy.type.points, FEEDBACK.scoreColor);
  enemies = enemies.filter((e) => e !== enemy);
  enemiesDestroyed += 1;
  levelStats.enemiesDestroyed += 1;
  score += enemy.type.points;
  dropCoin(enemy);
  if (enemy.carriesPowerUp) dropPowerUp();

  // Last one? Start the short countdown to the level summary.
  if (enemiesDestroyed >= currentLevel().enemies.length) levelEndTimer = LEVEL_END_DELAY;
}
