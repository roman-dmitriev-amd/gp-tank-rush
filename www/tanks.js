// =====================================================================
//  Tanks - moving and colliding (player and enemies), and the player
//
//  Movement, walls, corner assist, ice; the player: spawn, fire, armor, death.
// =====================================================================

// ---------------------------------------------------------------------
// Moving tanks (shared by the player and enemies)
// ---------------------------------------------------------------------

// Is a 1x1 tank at (x, y) touching any tile whose material passes
// test(material)?
function tankTouchesTile(x, y, test) {
  // A tiny margin so a tank exactly next to a wall is not "inside" it
  const e = 0.001;
  const left = Math.floor(x + e);
  const right = Math.floor(x + 1 - e);
  const top = Math.floor(y + e);
  const bottom = Math.floor(y + 1 - e);
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      if (test(materialAt(col, row))) return true;
    }
  }
  return false;
}

// Is a 1x1 tank at (x, y) touching any tile that blocks tanks?
// (Walls, water and the edge of the map.)
function tankHitsWall(x, y) {
  return tankTouchesTile(x, y, (material) => material.blocksTank);
}

// The material under the tank's center (decides sand / ice effects)
function materialUnderTank(tank) {
  return materialAt(Math.floor(tank.x + 0.5), Math.floor(tank.y + 0.5));
}

// Do two 1x1 tanks at these positions overlap?
function tanksOverlap(x1, y1, x2, y2) {
  const e = 0.001;
  return Math.abs(x1 - x2) < 1 - e && Math.abs(y1 - y2) < 1 - e;
}

// Would "tank" bump into another tank by moving to (x, y)?
// We only block moves that get CLOSER to the other tank. That way two
// tanks that somehow ended up overlapping can still drive apart.
function tankHitsTank(tank, x, y) {
  for (const other of allTanks()) {
    if (other === tank) continue;
    if (!tanksOverlap(x, y, other.x, other.y)) continue;
    const distanceBefore = Math.abs(tank.x - other.x) + Math.abs(tank.y - other.y);
    const distanceAfter = Math.abs(x - other.x) + Math.abs(y - other.y);
    if (distanceAfter < distanceBefore) return true;
  }
  return false;
}

// Corner assist: if the tank is trying to drive into a wall but is
// only a little off from lining up with a gap (up to CORNER_ASSIST_RANGE
// of a tile, config.js), slide it sideways toward the gap. Uses this
// frame's movement, so it's as fast as driving. Returns true if it slid.
function cornerAssist(tank, dir, distance) {
  const vertical = dir === "up" || dir === "down";
  const across = vertical ? tank.x : tank.y;  // position across the movement
  const target = Math.round(across);          // nearest lined-up position
  const offset = target - across;
  if (offset === 0 || Math.abs(offset) > CORNER_ASSIST_RANGE) return false;

  // Is there really a gap? Lined up, could it move forward?
  const step = DIRECTIONS[dir];
  const testX = vertical ? target : tank.x + step.x * distance;
  const testY = vertical ? tank.y + step.y * distance : target;
  if (tankHitsWall(testX, testY)) return false;

  // Slide sideways toward the gap
  const slide = Math.sign(offset) * Math.min(Math.abs(offset), distance);
  const newX = vertical ? tank.x + slide : tank.x;
  const newY = vertical ? tank.y : tank.y + slide;
  if (tankHitsWall(newX, newY) || tankHitsTank(tank, newX, newY)) return false;

  tank.x = newX;
  tank.y = newY;
  return true;
}

// Turn the tank to "dir" and drive forward for this frame.
// Returns true if it was blocked (by the edge, a wall or a tank).
function moveTank(tank, dir, deltaSeconds) {
  // When turning a corner (from up/down to left/right or back), snap
  // the tank to the nearest half tile. This keeps it lined up with
  // the grid, like in the classic 8-bit tank games.
  // (Skip the snap if it would push us into another tank.)
  const wasVertical = tank.facing === "up" || tank.facing === "down";
  const isVertical = dir === "up" || dir === "down";
  if (wasVertical !== isVertical) {
    const snappedX = Math.round(tank.x * 2) / 2;
    const snappedY = Math.round(tank.y * 2) / 2;
    if (!tankHitsTank(tank, snappedX, snappedY)) {
      tank.x = snappedX;
      tank.y = snappedY;
    }
  }

  tank.facing = dir; // rotate to face the way we move

  // Slower on sand (speedFactor of the tile under the tank)
  const speedFactor = materialUnderTank(tank).speedFactor || 1;
  return pushTank(tank, dir, tank.speed * speedFactor * deltaSeconds, true);
}

// Move the tank "distance" tiles in "dir" without turning it.
// Used for driving (moveTank) and for sliding on ice. Corner assist
// is only used when driving. Returns true if it was blocked.
function pushTank(tank, dir, distance, useCornerAssist) {
  // Work out where the tank wants to go
  const step = DIRECTIONS[dir];
  const wantedX = tank.x + step.x * distance;
  const wantedY = tank.y + step.y * distance;

  // Keep it inside the playfield
  let newX = clamp(wantedX, 0, GRID_COLS - 1);
  let newY = clamp(wantedY, 0, GRID_ROWS - 1);
  let blocked = newX !== wantedX || newY !== wantedY;

  // Blocked by a wall, but almost lined up with a gap? Slide toward
  // the gap instead of getting stuck on the corner.
  if (useCornerAssist && tankHitsWall(newX, newY) && cornerAssist(tank, dir, distance)) return false;

  // If that spot is inside a wall, stop right in front of the wall
  // instead. Walls sit on whole tiles, so we round to a whole tile on
  // the side we came from.
  if (tankHitsWall(newX, newY)) {
    if (dir === "right") newX = Math.floor(newX);
    if (dir === "left")  newX = Math.ceil(newX);
    if (dir === "down")  newY = Math.floor(newY);
    if (dir === "up")    newY = Math.ceil(newY);
    blocked = true;
  }

  // Another tank in the way? Then don't move at all this frame.
  if (tankHitsTank(tank, newX, newY)) {
    newX = tank.x;
    newY = tank.y;
    blocked = true;
  }

  tank.x = newX;
  tank.y = newY;
  return blocked;
}

// Ice: a tank on ice keeps sliding the way it was driving for
// TERRAIN.iceSlideTime seconds after it stops, slowing down. If it
// turns, it drives the new way at once while the old slide fades out.
// Call this every frame after moving; "steeredDir" is the direction
// it drove this frame (null if it didn't).
function updateIceSlide(tank, steeredDir, deltaSeconds) {
  if (!materialUnderTank(tank).slippery) {
    tank.slideTimer = 0; // off the ice: no sliding
    return;
  }

  // Still sliding in an older direction (or not steering at all)?
  if (tank.slideTimer > 0 && tank.slideDir !== steeredDir) {
    const fade = tank.slideTimer / TERRAIN.iceSlideTime; // 1 -> 0
    const hit = pushTank(tank, tank.slideDir, tank.speed * fade * deltaSeconds, false);
    tank.slideTimer = hit ? 0 : tank.slideTimer - deltaSeconds;
  }

  // Driving: remember this direction for the next slide (a new
  // direction takes over once the old slide is over)
  if (steeredDir && (steeredDir === tank.slideDir || tank.slideTimer <= 0)) {
    tank.slideDir = steeredDir;
    tank.slideTimer = TERRAIN.iceSlideTime;
  }
}

// ---------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------
function updatePlayer(deltaSeconds) {
  // Dead: wait, then come back with a few safe seconds.
  // If there's no free spot right now, spawnPlayer() fails and we
  // simply try again next frame.
  if (!player.alive) {
    player.respawnTimer -= deltaSeconds;
    // Back on the map: a gold ring where the tank appears (explosions.js)
    if (player.respawnTimer <= 0 && spawnPlayer()) {
      addRing(player.x + 0.5, player.y + 0.5, FEEDBACK.respawnColor);
    }
    return;
  }

  player.invincibleTimer = Math.max(0, player.invincibleTimer - deltaSeconds);

  const dir = currentDirection();
  if (dir) moveTank(player, dir, deltaSeconds);
  updateIceSlide(player, dir, deltaSeconds);
}

// The engine sound (audio.js) runs while the player drives during play.
// It stops on pause, in menus and end screens and when the tank is
// destroyed (audio.js also checks the sound settings). Called every
// frame, even while paused.
function updateEngineSound() {
  const driving = isPlaying() && !isPaused() && player.alive && currentDirection() !== null;
  Sound.setEngine(driving, driving ? enginePitch() : 0);
}

// Engine pitch (1 = normal): a little higher with each tank speed
// upgrade, lower on sand, higher on ice (ENGINE_SOUND in config.js)
function enginePitch() {
  const ground = materialUnderTank(player);
  let pitch = 1 + upgrades.speedTier * ENGINE_SOUND.pitchPerSpeedTier;
  if ((ground.speedFactor || 1) < 1) pitch *= ENGINE_SOUND.sandPitch;
  if (ground.slippery) pitch *= ENGINE_SOUND.icePitch;
  return pitch;
}

// Is (x, y) a good place for the player to appear?
// Not inside a wall and not on top of an enemy.
function isSpawnSpotFree(x, y) {
  if (tankHitsWall(x, y)) return false;
  return !enemies.some((e) => tanksOverlap(e.x, e.y, x, y));
}

// Find the free tile closest to the start position (null if none)
function findPlayerSpawnSpot() {
  const start = PLAYER_START;
  if (isSpawnSpotFree(start.x, start.y)) return { x: start.x, y: start.y };

  let best = null;
  let bestDistance = Infinity;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (!isSpawnSpotFree(col, row)) continue;
      const distance = Math.abs(col - start.x) + Math.abs(row - start.y);
      if (distance < bestDistance) {
        best = { x: col, y: row };
        bestDistance = distance;
      }
    }
  }
  return best;
}

// Put the player on the map with a few safe (blinking) seconds.
// Returns false if there was no free spot.
function spawnPlayer() {
  const spot = findPlayerSpawnSpot();
  if (!spot) return false;
  player.x = spot.x;
  player.y = spot.y;
  player.facing = "up";
  player.slideTimer = 0;
  player.alive = true;
  player.respawnTimer = 0;
  player.invincibleTimer = INVINCIBLE_TIME;
  return true;
}

function playerFire() {
  if (isPaused() || !isPlaying() || !player.alive) return;
  fireBullet(player, playerBulletSpeed()); // faster with the bullet upgrade
  tutorialNoteFired();
}

// The player's armor (from the shop) took a hit: it breaks, the
// player survives
function breakArmor() {
  upgrades.hasArmor = false;
  Sound.play("armorBreak");
  addShake("armor"); // feedback.js
  vibrate("armor");
  explosions.push({
    x: player.x + 0.5, y: player.y + 0.5, size: 1, age: 0,
    duration: ARMOR_BREAK_TIME, kind: "armorBreak",
  });
}

function destroyPlayer() {
  addTankBlast(player);
  Sound.play("explosion");
  addShake("player"); // feedback.js
  vibrate("player");
  player.alive = false;
  lives -= 1;
  levelStats.livesLost += 1;
  if (lives <= 0) {
    loseGame();
  } else {
    player.respawnTimer = RESPAWN_DELAY;
  }
}
