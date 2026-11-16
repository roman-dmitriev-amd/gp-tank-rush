// =====================================================================
//  Explosions - sparks, blasts and scorch marks (just for looks)
//
//  Their update and their drawing.
// =====================================================================

// ---------------------------------------------------------------------
// Explosions (just for looks)
// ---------------------------------------------------------------------
// Each one: { x, y, size, age, duration, spark }, plus a "kind" for
// the armor break and tank blasts (addBlast).
// A "spark" is the tiny flash when a bullet bounces off a wall.
const explosions = [];

// size 1 = brick explosion, bigger numbers = bigger boom
function addExplosion(x, y, size = 1) {
  explosions.push({ x, y, size, age: 0, duration: EXPLOSION_TIME, spark: false });
}

function addSpark(x, y) {
  explosions.push({ x, y, size: 0.4, age: 0, duration: SPARK_TIME, spark: true });
}

// Scorch marks left on the ground by blasts: { x, y, size, age, variant }
const scorchMarks = [];
let blastCount = 0; // seeds each blast's random, so no two look the same

// A tank (or the base) blowing up: fire, smoke, sparks and pieces in
// "pieceColors" (4 colors) flying off, plus a scorch mark on the
// ground. Every particle's path is picked here with seeded random and
// worked out from the blast's age when drawn (drawBlast), so there's
// nothing to update. Numbers are in BLAST_LOOKS (config.js).
function addBlast(x, y, pieceColors, size = 1) {
  const looks = BLAST_LOOKS;
  blastCount += 1;
  const random = makeRandom(blastCount * 7919);
  const between = (min, max) => min + random() * (max - min);
  const boom = {
    x, y, size, age: 0, duration: looks.time, kind: "blast",
    fire: [], smoke: [], debris: [], sparks: [],
  };

  // Fire clouds: a big white-hot one in the middle, smaller and cooler
  // ones pushed outward, each starting a little later
  for (let i = 0; i < looks.firePuffs; i++) {
    const first = i === 0;
    boom.fire.push({
      cooled: first ? 0 : between(0.3, 0.7), // how far it starts toward dark red (0-2)
      angle: (i / (looks.firePuffs - 1)) * Math.PI * 2 + between(0, 0.8), // spread around
      distance: first ? 0 : between(0.3, 0.6),
      delay: first ? 0 : between(0.02, 0.12),
      life: first ? 0.6 : between(0.45, 0.65),
      startRadius: first ? 0.4 : between(0.22, 0.3),
      endRadius: first ? 0.8 : between(0.5, 0.65),
    });
  }

  // Smoke: comes up as the fire cools and drifts off slowly
  for (let i = 0; i < looks.smokePuffs; i++) {
    const delay = between(0.15, 0.3);
    boom.smoke.push({
      angle: between(0, Math.PI * 2),
      distance: between(0.25, 0.55),
      delay,
      life: Math.min(between(0.8, 1.1), looks.time - delay),
      endRadius: between(0.8, 1.05),
    });
  }

  // Pieces of the tank: thrown up and out, spinning, then they land
  for (let i = 0; i < looks.debris; i++) {
    boom.debris.push({
      angle: (i / looks.debris) * Math.PI * 2 + between(0, 0.6),
      speed: between(2.4, 4.4),
      flight: between(0.45, 0.7),
      turn: between(0, Math.PI),
      spin: between(-14, 14),
      width: between(0.08, 0.15),
      height: between(0.05, 0.1),
      color: pieceColors[i % pieceColors.length],
    });
  }

  // Sparks: fast and short-lived
  for (let i = 0; i < looks.sparks; i++) {
    boom.sparks.push({
      angle: between(0, Math.PI * 2),
      speed: between(5, 9),
      life: between(0.25, 0.5),
    });
  }

  explosions.push(boom);
  scorchMarks.push({ x, y, size, age: 0, variant: blastCount % 3 });
  if (scorchMarks.length > looks.maxScorchMarks) scorchMarks.shift();
}

// A tank's blast, with pieces in its colors
function addTankBlast(tank) {
  const c = tank.colors;
  addBlast(tank.x + 0.5, tank.y + 0.5, [c.body, c.turret, c.track, c.body]);
}

function updateExplosions(deltaSeconds) {
  // Go backwards so removing items doesn't skip any
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].age += deltaSeconds;
    if (explosions[i].age >= explosions[i].duration) explosions.splice(i, 1);
  }
  for (let i = scorchMarks.length - 1; i >= 0; i--) {
    scorchMarks[i].age += deltaSeconds;
    if (scorchMarks[i].age >= BLAST_LOOKS.scorchTime) scorchMarks.splice(i, 1);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Each explosion is a few circles that grow and fade out (tank and base
// blasts have their own look, drawBlast). A spark is a small burst of
// short bright lines. Nothing is drawn outside the playfield.
function drawExplosions() {
  const s = field.tileSize;
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const boom of explosions) {
    if (boom.kind === "blast") {
      drawBlast(boom);
      continue;
    }
    const progress = boom.age / boom.duration; // 0 = start, 1 = end
    const { x: cx, y: cy } = mapToScreen(boom.x, boom.y);
    const size = s * boom.size;

    ctx.globalAlpha = 1 - progress; // fade out

    // Armor breaking: pieces of the silver ring flying outward, and
    // silver sparks flying out faster between them
    if (boom.kind === "armorBreak") {
      ctx.strokeStyle = PLAYER_LOOKS.armorRing;
      ctx.lineWidth = Math.max(2, s * 0.08);
      const radius = s * (0.55 + progress * 0.5);
      for (let i = 0; i < 8; i++) {
        const start = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + Math.PI / 10);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + 0.3;
        const inner = s * (0.5 + progress * 0.9);
        const outer = inner + s * 0.14 * (1 - progress);
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      }
      ctx.stroke();
      continue;
    }

    if (boom.spark) {
      ctx.strokeStyle = "#fff6b0";
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const inner = size * 0.15;
        const outer = size * (0.4 + progress * 0.4);
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      }
      ctx.stroke();
      continue;
    }

    ctx.fillStyle = "#ff8a1f";      // orange outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.25 + progress * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe066";      // yellow middle
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.15 + progress * 0.25), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";      // white hot center
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.1 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore(); // also puts globalAlpha back
}

// How far something thrown at "speed" (tiles per second) has gone after
// "time" seconds, slowed down by "drag" (bigger = stops sooner)
function glide(speed, drag, time) {
  return speed * (1 - Math.exp(-drag * time)) / drag;
}

// 0 to 1, fast at first and slowing down toward the end
function easeOut(p) {
  return 1 - (1 - p) * (1 - p);
}

// One tank or base blast (addBlast), worked out from its age: warm
// light on the ground, smoke, the pieces flying out from under the
// fireball, the fireball, a flash, sparks and the shock ring. Fire and
// smoke clouds are cached pictures that are only moved, scaled and
// faded.
function drawBlast(boom) {
  const looks = BLAST_LOOKS;
  const s = field.tileSize;
  const t = boom.age;
  const unit = s * boom.size;  // a tile, bigger for the base's blast
  // (Its smoke drifts and pieces fly the same way on screen whether the
  // playfield is turned or not, like the light)
  const { x: cx, y: cy } = mapToScreen(boom.x, boom.y);

  // Warm light on the ground, added to the colors under it
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "lighter";
  if (t < looks.glowTime) {
    drawGlow(cx, cy, looks.glow, looks.glowSize * boom.size, looks.glowAlpha * (1 - t / looks.glowTime));
  }
  ctx.globalCompositeOperation = "source-over";

  // Smoke: grows, spreads and drifts a little to the top-right
  const smoke = cachedPicture("blastSmoke", s, s, (c) => paintPuff(c, s, looks.smoke, looks.smoke, looks.smoke));
  for (const puff of boom.smoke) {
    const p = (t - puff.delay) / puff.life;
    if (p <= 0 || p >= 1) continue;
    const grow = easeOut(p);
    const x = cx + (Math.cos(puff.angle) * puff.distance * grow + 0.25 * p) * unit;
    const y = cy + (Math.sin(puff.angle) * puff.distance * grow - 0.15 * p) * unit;
    const radius = (0.3 + (puff.endRadius - 0.3) * grow) * unit;
    const fade = p < 0.2 ? p / 0.2 : Math.min(1, (1 - p) / 0.6);
    ctx.globalAlpha = looks.smokeAlpha * fade;
    ctx.drawImage(smoke, x - radius, y - radius, radius * 2, radius * 2);
  }

  drawBlastPieces(boom, cx, cy, unit);

  // Fire clouds: they grow, move out and cool from white-hot (stage 0)
  // to dark red (stage 2). The hotter stage is drawn first and the next
  // one over it, stronger as it cools. The outer clouds go first, so
  // the hot middle one is on top.
  const fire = [0, 1, 2].map((i) =>
    cachedPicture("blastFire" + i, s, s, (c) => paintPuff(c, s, ...looks.fire[i])));
  for (let i = boom.fire.length - 1; i >= 0; i--) {
    const puff = boom.fire[i];
    const p = (t - puff.delay) / puff.life;
    if (p <= 0 || p >= 1) continue;
    const grow = easeOut(p);
    const x = cx + Math.cos(puff.angle) * puff.distance * grow * unit;
    const y = cy + Math.sin(puff.angle) * puff.distance * grow * unit;
    const radius = (puff.startRadius + (puff.endRadius - puff.startRadius) * grow) * unit;
    const fade = p < 0.1 ? p / 0.1 : Math.min(1, (1 - p) / 0.4);
    const cooling = Math.min(2, puff.cooled + p * 2);
    const stage = Math.min(1, Math.floor(cooling));
    ctx.globalAlpha = fade;
    ctx.drawImage(fire[stage], x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = fade * (cooling - stage);
    ctx.drawImage(fire[stage + 1], x - radius, y - radius, radius * 2, radius * 2);
  }

  // The flash and the sparks are light: added to what's under them
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  if (t < looks.flashTime) {
    drawGlow(cx, cy, looks.flash, looks.flashSize * boom.size, 1 - t / looks.flashTime);
  }
  ctx.strokeStyle = looks.spark;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.lineCap = "round";
  for (const spark of boom.sparks) {
    if (t >= spark.life) continue;
    // A short streak from where it was a moment ago to where it is now
    const head = glide(spark.speed, 5, t) * unit;
    const tail = glide(spark.speed, 5, Math.max(0, t - 0.05)) * unit;
    const dx = Math.cos(spark.angle);
    const dy = Math.sin(spark.angle);
    ctx.globalAlpha = 1 - t / spark.life;
    ctx.beginPath();
    ctx.moveTo(cx + dx * tail, cy + dy * tail);
    ctx.lineTo(cx + dx * head, cy + dy * head);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.globalCompositeOperation = "source-over";

  // Shock ring: grows fast, thins and fades
  if (t < looks.ringTime) {
    const p = t / looks.ringTime;
    ctx.globalAlpha = 0.7 * (1 - p);
    ctx.strokeStyle = looks.ring;
    ctx.lineWidth = Math.max(1, s * 0.1 * (1 - p));
    ctx.beginPath();
    ctx.arc(cx, cy, (0.3 + (looks.ringSize - 0.3) * easeOut(p)) * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The blast's pieces: thrown up and out of the fireball, spinning, then
// they land and lie still. Higher up = bigger, with the shadow further
// to the bottom-right. They fade out over the blast's last third.
function drawBlastPieces(boom, cx, cy, unit) {
  const t = boom.age;
  const fadeStart = BLAST_LOOKS.time * 0.65;
  const alpha = t < fadeStart ? 1 : (BLAST_LOOKS.time - t) / (BLAST_LOOKS.time - fadeStart);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000000";
  for (const piece of boom.debris) {
    const flying = Math.min(t, piece.flight);
    const distance = glide(piece.speed, 3, flying) * unit;
    const x = cx + Math.cos(piece.angle) * distance;
    const y = cy + Math.sin(piece.angle) * distance;
    const height = Math.sin((Math.PI * flying) / piece.flight);
    const scale = (1 + 0.6 * height) * unit;
    const turn = piece.turn + piece.spin * flying;
    const shadow = (0.04 + 0.25 * height) * unit;

    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = "#000000";
    turnedRectPath(x + shadow, y + shadow, piece.width * scale, piece.height * scale, turn);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = piece.color;
    turnedRectPath(x, y, piece.width * scale, piece.height * scale, turn);
    ctx.fill();
    ctx.stroke();
  }
}

// Path of a w x h rectangle centered on (x, y), turned by "angle"
function turnedRectPath(x, y, w, h, angle) {
  const ax = (Math.cos(angle) * w) / 2;  // half the width, turned
  const ay = (Math.sin(angle) * w) / 2;
  const bx = (-Math.sin(angle) * h) / 2; // half the height, turned
  const by = (Math.cos(angle) * h) / 2;
  ctx.beginPath();
  ctx.moveTo(x - ax - bx, y - ay - by);
  ctx.lineTo(x + ax - bx, y + ay - by);
  ctx.lineTo(x + ax + bx, y + ay + by);
  ctx.lineTo(x - ax + bx, y - ay + by);
  ctx.closePath();
}

// A soft round cloud as wide as the picture, for the blast's fire and
// smoke: three soft lumps in the "outer" color make the edge bumpy, and
// over them one blob goes from "middle" in the center through "inner"
// to "outer", fading out at the edge.
function paintPuff(c, width, middle, inner, outer) {
  const lumps = [[0.34, 0.38, 0.28], [0.66, 0.4, 0.27], [0.5, 0.68, 0.27]]; // x, y, radius (parts of the width)
  for (const [x, y, r] of lumps) {
    const lump = c.createRadialGradient(x * width, y * width, 0, x * width, y * width, r * width);
    lump.addColorStop(0, withAlpha(outer, 0.7));
    lump.addColorStop(1, withAlpha(outer, 0));
    c.fillStyle = lump;
    c.fillRect(0, 0, width, width);
  }
  const mid = width / 2;
  const blob = c.createRadialGradient(mid, mid, 0, mid, mid, mid);
  blob.addColorStop(0, withAlpha(middle, 1));
  blob.addColorStop(0.35, withAlpha(inner, 1));
  blob.addColorStop(0.72, withAlpha(outer, 0.9));
  blob.addColorStop(0.88, withAlpha(outer, 0.45));
  blob.addColorStop(1, withAlpha(outer, 0));
  c.fillStyle = blob;
  c.fillRect(0, 0, width, width);
}

// Scorch marks left by blasts (addBlast), on the floor under walls and
// tanks. They fade out over their last seconds and stay inside the
// playfield.
function drawScorchMarks() {
  if (scorchMarks.length === 0) return;
  const looks = BLAST_LOOKS;
  const s = field.tileSize;
  const rect = fieldRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const mark of scorchMarks) {
    const width = looks.scorchSize * mark.size * s;
    const picture = cachedPicture("scorch" + mark.variant + "," + mark.size, width, width,
      (c) => paintScorch(c, width, mark.variant));
    const left = looks.scorchTime - mark.age;
    const at = mapToScreen(mark.x, mark.y);
    ctx.globalAlpha = looks.scorchAlpha * Math.min(1, left / looks.scorchFade);
    ctx.drawImage(picture, at.x - width / 2, at.y - width / 2, width, width);
  }
  ctx.restore();
}

// A scorch mark "width" wide (3 looks): soot thickest in the middle,
// blotches around it, soot rays thrown out by the blast and a few
// burnt specks
function paintScorch(c, width, variant) {
  const random = makeRandom(variant * 7717 + 13);
  const mid = width / 2;
  softPatch(c, mid, mid, width * 0.34, "#000000", 0.8);
  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2;
    const distance = width * (0.08 + random() * 0.14);
    softPatch(c, mid + Math.cos(angle) * distance, mid + Math.sin(angle) * distance,
              width * (0.1 + random() * 0.1), "#000000", 0.5);
  }
  // Rays: thin dark wedges pointing outward
  c.fillStyle = "rgba(0, 0, 0, 0.4)";
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + random() * 0.5;
    const spread = 0.05 + random() * 0.06;
    const inner = width * 0.12;
    const length = width * (0.3 + random() * 0.17);
    c.beginPath();
    c.moveTo(mid + Math.cos(angle - spread) * inner, mid + Math.sin(angle - spread) * inner);
    c.lineTo(mid + Math.cos(angle) * length, mid + Math.sin(angle) * length);
    c.lineTo(mid + Math.cos(angle + spread) * inner, mid + Math.sin(angle + spread) * inner);
    c.closePath();
    c.fill();
  }
  c.fillStyle = "rgba(0, 0, 0, 0.55)";
  for (let i = 0; i < 10; i++) {
    const angle = random() * Math.PI * 2;
    const distance = width * (0.15 + random() * 0.3);
    c.beginPath();
    c.arc(mid + Math.cos(angle) * distance, mid + Math.sin(angle) * distance,
          width * (0.008 + random() * 0.012), 0, Math.PI * 2);
    c.fill();
  }
}
