// =====================================================================
//  Levels - edit this file to change or add levels.
//
//  Each level has:
//    name        shown under "LEVEL X" in the level intro
//    theme       how the level looks: "standard", "jungle", "desert"
//                or "snow" (themes.js)
//    world       world number, shown in the "World 2: Jungle" banner
//                when the theme changes from the level before
//    map         the map as text: GRID_ROWS strings (21) of exactly
//                GRID_COLS letters (13) each (both set in config.js):
//                  .  empty ground
//                  B  brick (bullets break it)
//                  C  concrete (takes 4 hits to break)
//                  M  metal (only armor-piercing bullets hurt it)
//                  W  water (tanks can't cross, bullets fly over)
//                  F  forest (drawn over tanks; they show faintly)
//                  S  sand (tanks drive slower)
//                  I  ice (tanks slide)
//                (all materials are defined in materials.js)
//    enemies     the enemies of this level, in the order they appear,
//                by type name from enemies.js ("basic", "fast", "heavy").
//                Destroy them all to finish the level. Every 4th one
//                flashes and drops a power-up (config.js, POWERUPS).
//
//  Columns go 0-12 (left to right), rows go 0-20 (top to bottom).
//
//  The game places these itself, so the map must keep them "."
//    - the base at column 6, row 20, with its brick wall: columns 5-7
//      of row 19 and columns 5 and 7 of row 20
//    - the player start at column 4, row 20
//    - the enemy spawn points: columns 0, 6 and 12 of row 0
//  Leave a way from the spawn points to the base: brick is fine (it
//  can be shot), but water, concrete and metal block tanks. Keep at
//  most 35% of the tiles brick, concrete, metal or water (forest, sand
//  and ice don't count). With DEBUG on, checkLevels in map.js warns
//  in the console about all of this.
//
//  20 hand-made levels, 5 per theme: 1-5 standard (world 1), 6-10
//  jungle (world 2), 11-15 desert (world 3), 16-20 snow (world 4).
//  After level 20 the game is won.
// =====================================================================

const LEVELS = [
  // ----------------------------------------------------------------- 1
  // Open field with a few brick walls
  {
    name: "First Steps",
    theme: "standard",
    world: 1,
    map: [
      ".............",  // row 0 (top), enemies appear here
      ".............",
      "..BB.....BB..",
      "..BB..B..BB..",
      "......B......",
      ".............",  // row 5
      "BB..BB.BB..BB",
      ".............",
      "...B.....B...",
      ".B.B.....B.B.",
      ".B.........B.",  // row 10
      "....BB.BB....",
      ".............",
      "..BB.....BB..",
      "..BB..B..BB..",
      "......B......",  // row 15
      ".............",
      ".BB.......BB.",
      ".............",
      ".............",
      ".............",  // row 20 (bottom): player start and base
    ],
    enemies: [
      "basic", "basic", "basic", "basic", "basic",
      "basic", "basic", "basic", "basic", "basic",
    ],
  },

  // ----------------------------------------------------------------- 2
  // Brick corridors and a few concrete blocks
  {
    name: "Crossfire",
    theme: "standard",
    world: 1,
    map: [
      ".............",  // row 0
      ".B.B.....B.B.",
      ".B.B..C..B.B.",
      ".B.B.....B.B.",
      ".B.BBB.BBB.B.",
      ".............",  // row 5
      "...C.....C...",
      "BBB..BBB..BBB",
      ".............",
      ".B.B.B.B.B.B.",
      ".B.B.B.B.B.B.",  // row 10
      ".B.........B.",
      ".BBB.C.C.BBB.",
      ".............",
      "..B.BB.BB.B..",
      "..B.......B..",  // row 15
      "..B.B...B.B..",
      "....B...B....",
      ".............",
      ".BB.......BB.",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "basic", "basic", "basic", "basic", "basic",
      "basic", "basic", "fast", "basic", "fast", "fast",
    ],
  },

  // ----------------------------------------------------------------- 3
  // A river across the middle with two crossings (columns 2-3 and 9-10)
  {
    name: "The River",
    theme: "standard",
    world: 1,
    map: [
      ".............",  // row 0
      ".............",
      "..B.......B..",
      "..B..BBB..B..",
      ".....B.B.....",
      ".CC.......CC.",  // row 5
      ".............",
      "...B.....B...",
      ".BBB..B..BBB.",
      "......B......",
      "WW..WWWWW..WW",  // row 10: the river
      "WW..WWWWW..WW",
      "......B......",
      ".BBB..B..BBB.",
      "...B.....B...",
      ".............",  // row 15
      "..BB.....BB..",
      ".....B.B.....",
      "..B.......B..",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "basic", "fast", "basic", "basic", "fast", "basic",
      "basic", "fast", "basic", "fast", "basic", "basic",
    ],
  },

  // ----------------------------------------------------------------- 4
  // Metal guards on the sides, brick and concrete cover
  {
    name: "Steel Wall",
    theme: "standard",
    world: 1,
    map: [
      ".............",  // row 0
      ".............",
      "M.BB.....BB.M",
      "M.BB..C..BB.M",
      "......C......",
      ".............",  // row 5
      "MM..BBBBB..MM",
      ".............",
      "..C.B...B.C..",
      "..C.B.M.B.C..",
      "....B...B....",  // row 10
      "MM.........MM",
      "....BB.BB....",
      ".B.........B.",
      ".B.CC...CC.B.",
      ".............",  // row 15
      "MM..B...B..MM",
      "....B...B....",
      ".............",
      ".BB.......BB.",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "basic", "fast", "basic", "basic", "heavy", "fast",
      "basic", "basic", "fast", "basic", "heavy", "fast", "basic",
    ],
  },

  // ----------------------------------------------------------------- 5
  // The finale: a river at the top, a concrete fortress in the middle
  {
    name: "Fortress",
    theme: "standard",
    world: 1,
    map: [
      ".............",  // row 0
      ".............",
      ".BB..M.M..BB.",
      ".BB.......BB.",
      ".....B.B.....",
      "WWW..WWW..WWW",  // row 5: the river, crossings at columns 3-4 and 8-9
      "WWW..WWW..WWW",
      ".............",
      "..CCC...CCC..",  // row 8: the fortress
      "..C.......C..",
      ".MC..BBB..CM.",  // row 10
      ".M....M....M.",
      "..C.......C..",
      "..CCC...CCC..",
      ".............",
      ".BB..CCC..BB.",  // row 15
      ".............",
      "..B.......B..",
      "..B.......B..",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "basic", "fast", "basic", "fast", "heavy", "basic", "fast",
      "basic", "heavy", "fast", "basic", "heavy", "fast", "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 6
  // Dense forest in big patches, some brick cover
  {
    name: "Deep Green",
    theme: "jungle",
    world: 2,
    map: [
      ".............",  // row 0
      "FFF.......FFF",
      "FFF.BB.BB.FFF",
      "FFF.......FFF",
      "...FFFFFFF...",
      ".B.FFFFFFF.B.",  // row 5
      ".B.FFFFFFF.B.",
      "...FFFFFFF...",
      "BB.........BB",
      "FFF.B...B.FFF",
      "FFF.B.F.B.FFF",  // row 10
      "FFF...F...FFF",
      "FFF.BB.BB.FFF",
      ".............",
      ".BB.FFFFF.BB.",
      "....FFFFF....",  // row 15
      "FF..FMMMF..FF",
      "FF.........FF",
      ".B.........B.",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "basic", "fast", "basic",
      "heavy", "basic", "fast", "basic", "basic", "fast",
      "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 7
  // Two rivers with forest banks, 3 crossings each
  {
    name: "Riverbanks",
    theme: "jungle",
    world: 2,
    map: [
      ".............",  // row 0
      "..B.......B..",
      "..B..B.B..B..",
      "....B...B....",
      ".............",
      "FFF.FFFFF.FFF",  // row 5
      "W..WWW.WWW..W",
      "W..WWW.WWW..W",
      "FFF.FFFFF.FFF",
      ".B.........B.",
      ".B..B...B..B.",  // row 10
      "FF.FFF.FFF.FF",
      "WW.WWW.WWW.WW",
      "WW.WWW.WWW.WW",
      "FF.FFF.FFF.FF",
      ".............",  // row 15
      "..B..MMM..B..",
      "..B.......B..",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "basic", "basic",
      "fast", "heavy", "basic", "basic", "fast", "basic",
      "fast", "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 8
  // Forest clusters with concrete hidden inside
  {
    name: "Hidden Giants",
    theme: "jungle",
    world: 2,
    map: [
      ".............",  // row 0
      ".............",
      ".BB..B.B..BB.",
      ".BB.......BB.",
      ".............",
      ".FFF.....FFF.",  // row 5
      ".FCF.FFF.FCF.",
      ".FFF.FCF.FFF.",
      ".....FFF.....",
      "B...........B",
      "..FFF...FFF..",  // row 10
      "..FCF...FCF..",
      "..FFF...FFF..",
      "B....FFF....B",
      ".FFF.FCF.FFF.",
      ".FCF.FFF.FCF.",  // row 15
      ".FFF.....FFF.",
      ".............",
      ".B.........B.",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "basic", "heavy",
      "basic", "fast", "basic", "heavy", "basic", "fast",
      "basic", "fast", "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 9
  // Brick and forest maze, a few concrete blocks, a pond
  {
    name: "The Maze",
    theme: "jungle",
    world: 2,
    map: [
      ".............",  // row 0
      ".B.B.....B.B.",
      ".B.B.BBB.B.B.",
      ".B.FFF.FFF.B.",
      ".BBF.B.B.FBB.",
      "...F.B.B.F...",  // row 5
      "BB.FFF.FFF.BB",
      "...C.....C...",
      ".B.B.BBB.B.B.",
      ".B.B.WWW.B.B.",
      ".FFF.WWW.FFF.",  // row 10
      ".B.B.....B.B.",
      ".B.B.BBB.B.B.",
      "...C.....C...",
      "BB.FFF.FFF.BB",
      ".F...B.B...F.",  // row 15
      ".F.B.B.B.B.F.",
      ".B.B.....B.B.",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "basic", "heavy",
      "fast", "basic", "basic", "fast", "heavy", "basic",
      "fast", "basic", "fast", "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 10
  // Finale: a river, a big forest center, metal guarding the flanks
  {
    name: "Jungle Heart",
    theme: "jungle",
    world: 2,
    map: [
      ".............",  // row 0
      "..B.......B..",
      "..B..B.B..B..",
      ".............",
      "WW..WW.WW..WW",
      "WW..WW.WW..WW",  // row 5
      ".............",
      ".MM.......MM.",
      ".M.FFFFFFF.M.",
      ".M.FFFFFFF.M.",
      "...FBFFFBF...",  // row 10
      "B..FFFFFFF..B",
      ".M.FBFFFBF.M.",
      ".M.FFFFFFF.M.",
      ".MM.......MM.",
      ".............",  // row 15
      "..BB.C.C.BB..",
      ".............",
      ".B.........B.",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "heavy", "basic", "fast", "heavy",
      "basic", "fast", "heavy", "basic", "fast", "heavy",
      "basic", "fast", "heavy", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 11
  // Open ground, big sand patches, few walls
  {
    name: "Dunes",
    theme: "desert",
    world: 3,
    map: [
      ".............",  // row 0
      ".............",
      ".SSS.....SSS.",
      ".SSSS...SSSS.",
      "..SSS.B.SSS..",
      "......B......",  // row 5
      "....SSSSS....",
      ".B.SSSSSSS.B.",
      ".B.SSSSSSS.B.",
      "....SSSSS....",
      "SS.........SS",  // row 10
      "SSS.B...B.SSS",
      "SSS.B...B.SSS",
      "SS.........SS",
      "....SSSSS....",
      ".C.SSSSSSS.C.",  // row 15
      "...SSS.SSS...",
      ".............",
      ".SS.......SS.",
      ".SS.......SS.",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "basic", "fast",
      "heavy", "basic", "fast", "basic", "fast", "basic",
      "fast", "heavy", "basic", "fast",
    ],
  },

  // ----------------------------------------------------------------- 12
  // Concrete and brick ruins, long open lines, a little sand
  {
    name: "Ruins",
    theme: "desert",
    world: 3,
    map: [
      ".............",  // row 0
      ".CB.BC.CB.BC.",
      ".B...B.B...B.",
      ".............",
      "BB.C.....C.BB",
      ".............",  // row 5
      ".C.BB.C.BB.C.",
      ".B...SSS...B.",
      ".............",
      "CBB.C...C.BBC",
      ".............",  // row 10
      ".SS.BCBCB.SS.",
      ".S.........S.",
      "B..C.B.B.C..B",
      "B...........B",
      ".............",  // row 15
      ".CB.B...B.BC.",
      "..B.......B..",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "fast", "basic", "fast", "basic",
      "fast", "heavy", "basic", "fast", "basic", "fast",
      "basic", "fast", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 13
  // A pond in the center with sand around it, 3 ways past it
  {
    name: "The Oasis",
    theme: "desert",
    world: 3,
    map: [
      ".............",  // row 0
      ".............",
      "..B.......B..",
      "..B..B.B..B..",
      ".............",
      ".B.SSSSSSS.B.",  // row 5
      "...SSSSSSS...",
      "..SSSSSSSSS..",
      "..SWWWSWWWS..",
      "B.SWWWSWWWS.B",
      "B.SWWWSWWWS.B",  // row 10
      "..SWWWSWWWS..",
      "..SSSSSSSSS..",
      "...SSSSSSS...",
      ".B.SSS.SSS.B.",
      ".............",  // row 15
      "..BB.....BB..",
      ".............",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "fast", "basic", "fast", "heavy",
      "basic", "fast", "fast", "basic", "heavy", "fast",
      "basic", "fast", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 14
  // Vertical sand lanes between walls, open rows across
  {
    name: "Sandstorm",
    theme: "desert",
    world: 3,
    map: [
      ".............",  // row 0
      "..S...S...S..",
      ".BS.B.S.B.SB.",
      ".BS.B.S.B.SB.",
      ".BS.B.S.B.SB.",
      "..S...S...S..",  // row 5
      "..S...S...S..",
      ".BS.C.S.C.SB.",
      ".BS.B.S.B.SB.",
      ".BS.C.S.C.SB.",
      "..S...S...S..",  // row 10
      "..S...S...S..",
      ".CS.B.S.B.SC.",
      ".BS.B.S.B.SB.",
      ".BS.B.S.B.SB.",
      "..S...S...S..",  // row 15
      "..S...S...S..",
      ".BS.B...B.SB.",
      "..S.......S..",
      "..S.......S..",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "fast", "fast", "basic", "heavy",
      "fast", "fast", "basic", "fast", "heavy", "fast",
      "basic", "fast", "fast", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 15
  // Finale: concrete and metal fortress, sand outside
  {
    name: "Desert Fortress",
    theme: "desert",
    world: 3,
    map: [
      ".............",  // row 0
      ".SS.......SS.",
      ".SS..B.B..SS.",
      ".............",
      "SS.B.....B.SS",
      "SS.........SS",  // row 5
      "..CCM...MCC..",
      "..C.......C..",
      "..M.......M..",
      "......B......",
      ".....BMB.....",  // row 10
      "..M.......M..",
      "..C.......C..",
      "..CCM...MCC..",
      ".............",
      "SS...SSS...SS",  // row 15
      "S..B.....B..S",
      ".............",
      "SS.........SS",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "heavy", "basic", "fast", "heavy",
      "basic", "fast", "heavy", "basic", "fast", "heavy",
      "heavy", "basic", "fast", "heavy", "basic", "fast",
      "heavy",
    ],
  },

  // ----------------------------------------------------------------- 16
  // Large ice patches, few walls
  {
    name: "First Frost",
    theme: "snow",
    world: 4,
    map: [
      ".............",  // row 0
      ".............",
      ".II..B.B..II.",
      ".III.....III.",
      "..II.....II..",
      ".............",  // row 5
      "B..IIIIIII..B",
      "...IIIIIII...",
      ".B.IIIIIII.B.",
      ".............",
      "II.........II",  // row 10
      "III.B...B.III",
      "III.B...B.III",
      "II.........II",
      ".............",
      "..IIII.IIII..",  // row 15
      ".BIIII.IIIIB.",
      ".............",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "heavy", "basic",
      "fast", "basic", "heavy", "fast", "basic", "fast",
      "heavy", "basic", "fast", "basic", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 17
  // Ice around ponds, brick bumpers at the edges
  {
    name: "Thin Ice",
    theme: "snow",
    world: 4,
    map: [
      ".............",  // row 0
      ".............",
      ".IIII...IIII.",
      ".IWWIB.BIWWI.",
      ".IWWIB.BIWWI.",
      ".IIII...IIII.",  // row 5
      ".............",
      "B....III....B",
      "BII.IWWWI.IIB",
      ".II.IWWWI.II.",
      ".II.IWWWI.II.",  // row 10
      "B....III....B",
      ".............",
      ".IIII...IIII.",
      ".IWWIB.BIWWI.",
      ".IWWIB.BIWWI.",  // row 15
      ".IIII...IIII.",
      ".............",
      ".B.........B.",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "basic", "fast", "basic", "fast", "heavy", "basic",
      "fast", "heavy", "basic", "fast", "basic", "fast",
      "heavy", "basic", "fast", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 18
  // Ice corridors between metal and brick walls
  {
    name: "Frozen Maze",
    theme: "snow",
    world: 4,
    map: [
      ".............",  // row 0
      ".IIIIIIIIIII.",
      ".BBM.MBM.MBB.",
      ".I.I.I.I.I.I.",
      ".I.B.I.I.B.I.",
      "...B.....B...",  // row 5
      "MM.I.BBB.I.MM",
      "...I.....I...",
      ".IIIII.IIIII.",
      ".M.B.M.M.B.M.",
      ".M.I.M.M.I.M.",  // row 10
      ".IIIIIIIIIII.",
      "BB.M.B.B.M.BB",
      "...I.....I...",
      ".B.I.MMM.I.B.",
      ".BIIII.IIIIB.",  // row 15
      "...M.....M...",
      ".I.M.I.I.M.I.",
      ".I...I.I...I.",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "heavy", "fast", "basic", "fast",
      "heavy", "basic", "fast", "basic", "heavy", "fast",
      "basic", "fast", "heavy", "basic", "fast", "heavy",
    ],
  },

  // ----------------------------------------------------------------- 19
  // Pines (forest) on ice, a small pond
  {
    name: "Pine Forest",
    theme: "snow",
    world: 4,
    map: [
      ".............",  // row 0
      ".FF.......FF.",
      ".FFF.B.B.FFF.",
      "..F.IIIII.F..",
      "B...IIIII...B",
      ".FF.......FF.",  // row 5
      "FFFF.B.B.FFFF",
      "IIFF.....FFII",
      "III..WWW..III",
      "III..WWW..III",
      ".B..II.II..B.",  // row 10
      "FFF.IFFFI.FFF",
      "FFF..FFF..FFF",
      "IIC.......CII",
      "II..B...B..II",
      "...FFF.FFF...",  // row 15
      ".B.FFF.FFF.B.",
      "...II...II...",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "heavy", "fast", "basic", "heavy",
      "fast", "heavy", "basic", "fast", "heavy", "fast",
      "basic", "heavy", "fast", "heavy", "basic", "fast",
      "heavy",
    ],
  },

  // ----------------------------------------------------------------- 20
  // The last hand-made level: ice, a river, a fortress, forest
  {
    name: "Final Winter",
    theme: "snow",
    world: 4,
    map: [
      ".............",  // row 0
      ".FF.......FF.",
      ".FF.B...B.FF.",
      "..IIIIIIIII..",
      "WW.WWW.WWW.WW",
      "WW.WWW.WWW.WW",  // row 5
      "..III.I.III..",
      ".F.........F.",
      "..CCM...MCC..",
      "..C..FFF..C..",
      "..M..FMF..M..",  // row 10
      "..C..FFF..C..",
      "..CCM...MCC..",
      ".............",
      "FF.II...II.FF",
      "FF.IIB.BII.FF",  // row 15
      "...II...II...",
      ".B.........B.",
      ".............",
      ".............",
      ".............",  // row 20
    ],
    enemies: [
      "fast", "basic", "heavy", "fast", "heavy", "fast",
      "basic", "heavy", "fast", "heavy", "fast", "basic",
      "heavy", "fast", "heavy", "fast", "basic", "heavy",
      "fast", "heavy",
    ],
  },
];
