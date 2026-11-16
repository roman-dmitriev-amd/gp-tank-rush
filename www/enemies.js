// =====================================================================
//  Enemy types - edit this file to tune or add enemy types.
//
//  Each type has:
//    speed        movement speed, as a multiple of ENEMY_SPEED in
//                 enemyai.js (1 = normal, 2 = twice as fast)
//    health       player bullet hits needed to destroy it
//    bulletSpeed  how fast its bullets fly, in tiles per second
//    fireMin,     it shoots every fireMin to fireMax seconds
//    fireMax      (later levels make this a bit shorter)
//    points       score for destroying it
//    (the gold each type drops is in config.js)
//    look         how it is drawn (only changes the picture; every
//                 tank still takes up one tile):
//                   width   hull and tracks: 1 = normal, smaller =
//                           slimmer, bigger = bulkier
//                   turret  size of the round turret (1 = normal)
//                   barrel  thickness of the cannon (1 = normal)
//    colors       body (hull) / track (keep dark) / turret / outline
//                 colors; the cannon is the turret color a bit darker
//    damagedColors (optional) colors to use once it has this much
//                 health left, e.g. { 2: {...}, 1: {...} }
//    seek         how keen it is to head for the base or the player
//                 (multiplies the level's chance, DIFFICULTY in config.js)
//    aims         false = it never shoots sooner at a target straight
//                 ahead (DIFFICULTY.aimReaction)
//    burst,       (optional) it fires "burst" shots in a row, burstGap
//    burstGap     seconds apart
//    maxBullets   (optional) its bullets flying at once (1 if left out)
//
//  Levels (in levels.js) list enemies by these names: "basic" etc.
// =====================================================================

const ENEMY_TYPES = {
  basic: {
    speed: 1.0,
    health: 1,
    bulletSpeed: 8,
    fireMin: 1.0,
    fireMax: 3.0,
    points: 100,
    seek: 1,
    aims: true,
    look: { width: 1.0, turret: 1.0, barrel: 1.0 },
    colors: { body: "#8e979f", track: "#2c3034", turret: "#b7c0c8", outline: "#14181c" },  // grey
  },

  fast: {
    speed: 1.7,
    health: 1,
    bulletSpeed: 9,
    fireMin: 1.0,
    fireMax: 3.0,
    points: 200,
    seek: 0.6,   // too jumpy to follow a plan
    aims: false,
    look: { width: 0.78, turret: 0.8, barrel: 0.8 },   // slimmer
    colors: { body: "#c0412e", track: "#2e2826", turret: "#e0644a", outline: "#1f0906" },  // red
  },

  heavy: {
    speed: 0.7,
    health: 3,
    bulletSpeed: 7,
    fireMin: 1.5,
    fireMax: 3.5,
    points: 300,
    seek: 1.3,   // slow, but it knows where it is going
    aims: true,
    look: { width: 1.1, turret: 1.3, barrel: 1.4 },    // bulkier
    colors: { body: "#4b545e", track: "#202428", turret: "#6d7782", outline: "#08090b" },  // dark steel
    // Its color changes as it gets damaged: steel -> bronze -> rusty red
    damagedColors: {
      2: { body: "#7d6a4f", track: "#2a251f", turret: "#a8946f", outline: "#120e08" },
      1: { body: "#8a4a42", track: "#2b1d1b", turret: "#b8726a", outline: "#140807" },
    },
  },

  // From world 3 on (DIFFICULTY.gunners in config.js puts them into the
  // levels): fires two shots in a row and takes two hits
  gunner: {
    speed: 0.9,
    health: 2,
    bulletSpeed: 8.5,
    fireMin: 1.6,
    fireMax: 3.2,
    points: 250,
    seek: 1,
    aims: true,
    burst: 2,
    burstGap: 0.22,
    maxBullets: 2,
    look: { width: 1.0, turret: 1.15, barrel: 1.2 },
    colors: { body: "#7a4fa3", track: "#2a2433", turret: "#a57fd0", outline: "#170c24" },  // violet
    damagedColors: {
      1: { body: "#6b5670", track: "#27222b", turret: "#94809a", outline: "#150f18" },   // faded
    },
  },
};
