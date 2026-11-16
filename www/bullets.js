// =====================================================================
//  Bullets - flying, hitting tanks, walls, the base and each other
//
// =====================================================================

// ---------------------------------------------------------------------
// Bullets
// Each tank may have only tank.maxBullets flying at a time (1, or 2-3
// for the player with the bullet upgrade).
// x and y are the bullet's CENTER, in tiles.
// ---------------------------------------------------------------------
let bullets = [];

function fireBullet(tank, speed) {
  const flying = bullets.filter((b) => b.owner === tank && !b.dead).length;
  if (flying >= tank.maxBullets) return; // already enough in the air
  const step = DIRECTIONS[tank.facing];
  const bullet = {
    // Start at the tip of the cannon (center of tank + half a tile)
    x: tank.x + 0.5 + step.x * 0.5,
    y: tank.y + 0.5 + step.y * 0.5,
    dir: tank.facing,
    speed,
    damage: bulletDamage(tank),
    owner: tank,
    dead: false,
  };
  // Where it started, so its tail never reaches back behind the cannon
  bullet.fromX = bullet.x;
  bullet.fromY = bullet.y;
  bullets.push(bullet);
  addMuzzleFlash(bullet.x, bullet.y); // explosions.js
  noteTankFired(tank);                // recoil (feedback.js)
  Sound.play(tank === player ? "playerShot" : "enemyShot");
}

// How much damage this tank's bullets do to walls.
// Only the player can have armor-piercing bullets.
function bulletDamage(tank) {
  if (tank === player && player.armorPiercing) return ARMOR_PIERCING_DAMAGE;
  return BULLET_DAMAGE;
}

function removeBullet(bullet) {
  bullet.dead = true; // thrown away at the end of updateBullets()
}

function updateBullets(deltaSeconds) {
  // Move all bullets in small steps, checking for hits after each
  // step, so fast bullets can't skip over a brick, a tank or each other.
  const fastest = Math.max(PLAYER_BULLET_SPEED, ...bullets.map((b) => b.speed));
  const stepCount = Math.ceil((fastest * deltaSeconds) / 0.2);
  const stepTime = deltaSeconds / stepCount;

  for (let i = 0; i < stepCount; i++) {
    for (const bullet of bullets) {
      if (bullet.dead) continue;
      const step = DIRECTIONS[bullet.dir];
      bullet.x += step.x * bullet.speed * stepTime;
      bullet.y += step.y * bullet.speed * stepTime;
      checkBulletHits(bullet);
    }
    checkBulletsHitEachOther();
  }

  // Throw away bullets that are finished
  bullets = bullets.filter((b) => !b.dead);
}

function checkBulletHits(bullet) {
  // Left the playfield? Then it's gone.
  if (bullet.x < 0 || bullet.x > GRID_COLS || bullet.y < 0 || bullet.y > GRID_ROWS) {
    removeBullet(bullet);
    return;
  }

  if (bulletHitsWall(bullet)) {
    removeBullet(bullet);
    return;
  }

  const fromPlayer = bullet.owner === player;

  // Player bullet hits an enemy: it loses 1 health (maybe destroyed)
  if (fromPlayer) {
    for (const enemy of enemies) {
      if (pointInTank(bullet.x, bullet.y, enemy)) {
        removeBullet(bullet);
        addSpark(bullet.x, bullet.y);
        hitEnemy(enemy);
        return;
      }
    }
  }

  // Enemy bullet hits the player (enemy bullets fly through other
  // enemies, like in the classic game)
  if (!fromPlayer && player.alive && pointInTank(bullet.x, bullet.y, player)) {
    removeBullet(bullet);
    // Safe while blinking after a respawn, or with the shield power-up
    // Shop armor takes the hit instead (and breaks)
    if (player.invincibleTimer <= 0 && !isEffectActive("shield")) {
      if (upgrades.hasArmor) breakArmor();
      else destroyPlayer();
    } else {
      Sound.play("metalHit"); // the shield (or respawn blink) blocked it
      addSpark(bullet.x, bullet.y);
    }
  }
}

function pointInTank(x, y, tank) {
  return x > tank.x && x < tank.x + 1 && y > tank.y && y < tank.y + 1;
}

// Two bullets from different tanks that touch cancel each other out
function checkBulletsHitEachOther() {
  for (let a = 0; a < bullets.length; a++) {
    for (let b = a + 1; b < bullets.length; b++) {
      const one = bullets[a];
      const two = bullets[b];
      if (one.dead || two.dead || one.owner === two.owner) continue;
      if (Math.abs(one.x - two.x) < 0.3 && Math.abs(one.y - two.y) < 0.3) {
        removeBullet(one);
        removeBullet(two);
        addSpark((one.x + two.x) / 2, (one.y + two.y) / 2);
      }
    }
  }
}

// Check the tiles under the bullet. The bullet is a little wide, so if
// it flies right between two walls, it hits BOTH, just like in the
// classic game. Returns true if the bullet hit something.
function bulletHitsWall(bullet) {
  const halfWidth = 0.15;
  const goingSideways = bullet.dir === "left" || bullet.dir === "right";

  // Two check points: on each side of the bullet's path
  const points = goingSideways
    ? [[bullet.x, bullet.y - halfWidth], [bullet.x, bullet.y + halfWidth]]
    : [[bullet.x - halfWidth, bullet.y], [bullet.x + halfWidth, bullet.y]];

  let hit = false;
  let lastCol = null;
  let lastRow = null;
  for (const [px, py] of points) {
    const col = Math.floor(px);
    const row = Math.floor(py);
    // Both points can be on the same tile: only hit it once
    if (col === lastCol && row === lastRow) continue;
    lastCol = col;
    lastRow = row;
    if (hitTile(col, row, bullet)) hit = true;
  }
  return hit;
}

// A bullet reached tile (col, row). Works the same for every material,
// using its settings from materials.js. Returns true if the bullet is
// stopped here.
function hitTile(col, row, bullet) {
  const material = materialAt(col, row);
  if (!material.blocksBullet) return false;  // flies right over it

  // The base: any hit destroys it (once)
  if (material.isBase) {
    if (!baseDestroyed) destroyBase(col, row);
    return true;
  }

  // Too strong for this bullet (or can't be destroyed at all):
  // the bullet bounces off with a little spark
  if (material.health === null || bullet.damage < material.minDamageToHurt) {
    addSpark(bullet.x, bullet.y);
    Sound.play("metalHit");
    return true;
  }

  // Otherwise the wall takes the bullet's damage; at 0 it's gone
  const cell = map[row][col];
  if (cell.baseWall && bullet.owner !== player) levelStats.baseWallDamaged = true;
  cell.health -= bullet.damage;
  const destroyed = cell.health <= 0;
  // brick, concrete or metal (materials.js); a brick that breaks has its own sound
  Sound.play((destroyed && material.destroySound) || material.hitSound || "metalHit");
  if (destroyed) {
    // Rubble in the wall's own colors (the base wall has its own)
    const colors = cell.baseWall && material.id === "brick" ? currentTheme().baseWall : tileColors(material.id);
    const second = colors.mortar || colors.seam || colors.shine || colors.fill;
    addRubble(col + 0.5, row + 0.5,
              [colors.fill, second, mixColors(colors.fill, colors.outline, 0.45)],
              mixColors(colors.fill, second, 0.5));
    setTile(col, row, "empty");
  } else {
    addSpark(bullet.x, bullet.y); // chipped, still standing
  }
  return true;
}

// The base got hit: show it as rubble with a big explosion and end
// the game right away, no matter how many lives are left.
function destroyBase(col, row) {
  baseDestroyed = true;
  map[row][col].health = 0;   // drawn as rubble from now on
  const gold = BASE_LOOK.gold, plate = BASE_LOOK.plate;
  addBlast(col + 0.5, row + 0.5, [gold[1], plate[0], plate[1], gold[2]], BLAST_LOOKS.baseSize);
  Sound.play("baseDestroyed");
  addShake("base");  // feedback.js
  vibrate("base");
  loseGame();
}
