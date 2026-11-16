// =====================================================================
//  Feedback - screen shake, vibration, recoil and the spawn warning
//
//  Small things that make the action feel heavier. Only looks (and the
//  phone's vibration): nothing here moves a tank or changes a hitbox.
//  The numbers are in FEEDBACK (config.js). The effects that fly and fade
//  (muzzle flash, rings, floating numbers, rubble) are in explosions.js.
// =====================================================================

// ---------------------------------------------------------------------
// Screen shake: the playfield (map, tanks, bullets, explosions) is drawn
// a few pixels off for a moment. The HUD, the controls and the menus
// never move. Counted in update(), so it stops while paused.
// ---------------------------------------------------------------------
const shake = { strength: 0, duration: 0, age: 0 };

// Start a shake: "kind" is a name from FEEDBACK.shake. A weaker shake
// never replaces a stronger one that is still running.
function addShake(kind) {
  const [strength, duration] = FEEDBACK.shake[kind];
  if (strength < shakeStrength()) return;
  shake.strength = strength;
  shake.duration = duration;
  shake.age = 0;
}

// How strong the shake is right now, in tiles (it dies away)
function shakeStrength() {
  if (shake.age >= shake.duration) return 0;
  return shake.strength * (1 - shake.age / shake.duration);
}

function updateShake(deltaSeconds) {
  if (shake.age < shake.duration) shake.age += deltaSeconds;
}

function stopShake() {
  shake.age = shake.duration;
}

// How far to move the playfield this frame, in CSS pixels on whole
// device pixels (so the cached pictures stay sharp). Two waves of
// different speeds, so it doesn't look like a circle.
function shakeOffset() {
  const strength = shakeStrength() * field.tileSize;
  if (strength <= 0 || isPaused()) return { x: 0, y: 0 };
  const ratio = window.devicePixelRatio || 1;
  const t = shake.age * FEEDBACK.shakeSpeed;
  return {
    x: Math.round(Math.sin(t) * strength * ratio) / ratio,
    y: Math.round(Math.cos(t * 0.77) * strength * ratio) / ratio,
  };
}

// ---------------------------------------------------------------------
// Vibration: "kind" is a name from FEEDBACK.vibration. Does nothing
// with the VIBRATION setting off or on a device that can't vibrate.
// ---------------------------------------------------------------------
function vibrate(kind) {
  if (!settings.vibration) return;
  try {
    if (navigator.vibrate) navigator.vibrate(FEEDBACK.vibration[kind]);
  } catch (e) {
    // not allowed here: the game goes on without it
  }
}

// ---------------------------------------------------------------------
// Recoil: for a moment after firing, a tank's picture is drawn a little
// back from where it points (render.js asks here). The tank itself
// stays where it is.
// ---------------------------------------------------------------------
function noteTankFired(tank) {
  tank.firedAt = gameTime;
}

// How far back to draw the tank right now, in tiles
function tankRecoil(tank) {
  if (tank.firedAt === undefined) return 0;
  const age = gameTime - tank.firedAt;
  if (age < 0 || age >= FEEDBACK.recoilTime) return 0;
  return FEEDBACK.recoilDistance * (1 - age / FEEDBACK.recoilTime);
}

// ---------------------------------------------------------------------
// Spawn warning: a blinking star on the spawn point where the next enemy
// is about to appear (enemyai.js says where: nextSpawnWarning()). One
// cached picture, drawn bigger and smaller.
// ---------------------------------------------------------------------
function drawSpawnWarning() {
  if (!isPlaying()) return;
  const point = nextSpawnWarning();
  if (!point) return;
  const s = field.tileSize;
  const size = s * FEEDBACK.spawnMarkSize;
  const picture = cachedPicture("spawnMark", size, size, (c) => paintSpawnMark(c, size));
  const { x: cx, y: cy } = mapToScreen(point.x + 0.5, point.y + 0.5);
  const beat = 0.5 + 0.5 * Math.sin(gameTime * FEEDBACK.spawnBlinkSpeed);
  const width = size * (0.55 + 0.45 * beat);
  ctx.globalAlpha = 0.55 + 0.45 * beat;
  ctx.drawImage(picture, cx - width / 2, cy - width / 2, width, width);
  ctx.globalAlpha = 1;
}

// A four-pointed star with a bright middle and a dark outline
function paintSpawnMark(c, size) {
  const [middle, star, outline] = FEEDBACK.spawnMarkColors;
  const mid = size / 2;
  const long = size * 0.46;   // tip of an arm
  const short = size * 0.13;  // between the arms
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? long : short;
    c.lineTo(mid + Math.cos(angle) * radius, mid + Math.sin(angle) * radius);
  }
  c.closePath();
  c.fillStyle = star;
  c.fill();
  c.lineWidth = Math.max(1, size * 0.05);
  c.lineJoin = "round";
  c.strokeStyle = outline;
  c.stroke();
  softPatch(c, mid, mid, size * 0.22, middle, 1); // materials.js
}
