/**
 * BOARD LAYOUTS (data only — no game logic here)
 * ==============================================
 * Tiles use "axial" hex coordinates (q, r). Two tiles are neighbours when
 * their coordinates differ by one of the six directions:
 *   (+1,0) (+1,-1) (0,-1) (-1,0) (-1,+1) (0,+1)
 * The client turns (q, r) into screen positions, so to try a new board you
 * only need to add a new layout object here and list it in config.js OPTIONS.
 *
 * Each layout has:
 *   village        id of the neutral village tile
 *   tiles          every hex: { id, q, r }
 *   wedges         possible player territories: a capital + provinces
 *   seatsToWedges  for each player count, which wedge each seat gets
 *                  (wedges not listed stay open)
 */
'use strict';

const standard19 = {
  description: '19 hexes: village in the centre, a ring of 6, an outer ring of 12',
  village: 'V',
  tiles: [
    { id: 'V', q: 0, r: 0 },
    // Inner ring (I = inner)
    { id: 'I0', q: 1, r: 0 },
    { id: 'I1', q: 1, r: -1 },
    { id: 'I2', q: 0, r: -1 },
    { id: 'I3', q: -1, r: 0 },
    { id: 'I4', q: -1, r: 1 },
    { id: 'I5', q: 0, r: 1 },
    // Outer ring corners (C = corner, used for capitals)
    { id: 'C0', q: 2, r: 0 },
    { id: 'C1', q: 2, r: -2 },
    { id: 'C2', q: 0, r: -2 },
    { id: 'C3', q: -2, r: 0 },
    { id: 'C4', q: -2, r: 2 },
    { id: 'C5', q: 0, r: 2 },
    // Outer ring edges (E = edge)
    { id: 'E0', q: 2, r: -1 },
    { id: 'E1', q: 1, r: -2 },
    { id: 'E2', q: -1, r: -1 },
    { id: 'E3', q: -2, r: 1 },
    { id: 'E4', q: -1, r: 2 },
    { id: 'E5', q: 1, r: 1 },
  ],
  // Wedge k = capital on outer corner Ck, an inner-ring province Ik and an
  // outer-ring province Ek. All three touch each other.
  wedges: [
    { capital: 'C0', provinces: ['I0', 'E0'] },
    { capital: 'C1', provinces: ['I1', 'E1'] },
    { capital: 'C2', provinces: ['I2', 'E2'] },
    { capital: 'C3', provinces: ['I3', 'E3'] },
    { capital: 'C4', provinces: ['I4', 'E4'] },
    { capital: 'C5', provinces: ['I5', 'E5'] },
  ],
  seatsToWedges: {
    3: [0, 2, 4],
    4: [0, 1, 3, 4], // leaves wedges 2 and 5 open = 6 open tiles
    5: [0, 1, 2, 3, 4],
  },
};

/**
 * sea37 (Total War): 37 hexes. Village in the centre, then rings of 6, 12 and 18.
 * Each player's wedge is a capital on an outer corner (Ck), a province on the
 * second-ring corner (Mk) and a coastal province next to the capital (Ek).
 * Between neighbouring wedges lies a SEA BAY (Sk) that touches both: ships hold
 * the bays, and the bays are joined to each other by the open ocean.
 */
const D = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
function sea37Tiles() {
  const tiles = [{ id: 'V', q: 0, r: 0 }];
  for (let k = 0; k < 6; k++) tiles.push({ id: 'I' + k, q: D[k][0], r: D[k][1] });
  for (let k = 0; k < 6; k++) {
    const s = D[(k + 2) % 6];
    tiles.push({ id: 'M' + k, q: 2 * D[k][0], r: 2 * D[k][1] });
    tiles.push({ id: 'N' + k, q: 2 * D[k][0] + s[0], r: 2 * D[k][1] + s[1] });
    tiles.push({ id: 'C' + k, q: 3 * D[k][0], r: 3 * D[k][1] });
    tiles.push({ id: 'E' + k, q: 3 * D[k][0] + s[0], r: 3 * D[k][1] + s[1] });
    tiles.push({ id: 'S' + k, q: 3 * D[k][0] + 2 * s[0], r: 3 * D[k][1] + 2 * s[1], sea: true });
  }
  return tiles;
}
const sea37 = {
  description: '37 hexes with six sea bays between the players (Total War)',
  village: 'V',
  tiles: sea37Tiles(),
  wedges: [0, 1, 2, 3, 4, 5].map((k) => ({ capital: 'C' + k, provinces: ['M' + k, 'E' + k] })),
  seatsToWedges: {
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
  },
};

/**
 * oceans (Total War): two continents with an ocean between them, ~88 hexes.
 * Drawn below as a picture, one character per hex, rows offset like a real hex
 * map (odd rows are shifted half a hex to the right):
 *   L = land   . = open sea   f = fishing ground (sea that earns its holder income)
 *   V = the Village (on an island in the middle of the ocean)
 * Sea moves along neighbouring sea hexes (sea lanes), so the ocean has to be
 * crossed hex by hex, and an invasion needs an unbroken chain of your ships.
 * Wedges (player territories) are listed by [column, row] positions.
 */
const OCEANS_MAP = [
  ' LLL...LLL ', // row 0   (a space = no hex there)
  'LLLL.f.LLLL', // row 1
  'LLL.f...LLL', // row 2
  'LLLL.V.LLLL', // row 3
  'LL....f.LLL', // row 4   a bay cuts into the west coast
  'LLLL.f..LLL', // row 5   …and one into the east coast
  'LLL.....LLL', // row 6
  ' LLL.f.LLL ', // row 7
];
const OCEANS_WEDGES = {
  WN: { capital: [1, 1], provinces: [[2, 0], [2, 2]] }, // west continent, north
  WS: { capital: [1, 6], provinces: [[1, 7], [1, 5]] }, // west continent, south
  WM: { capital: [0, 3], provinces: [[0, 4], [1, 3]] }, // west continent, middle (5 players)
  EN: { capital: [8, 1], provinces: [[8, 2], [9, 1]] }, // east continent, north
  ES: { capital: [9, 6], provinces: [[8, 6], [9, 5]] }, // east continent, south
  EM: { capital: [10, 3], provinces: [[9, 3], [10, 4]] }, // east continent, middle
};
const hexId = (c, r) => `${"ABCDEFGHIJK"[c]}${r + 1}`; // map grid reference, e.g. B2
function oceansTiles() {
  const tiles = [];
  OCEANS_MAP.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === ' ') return;
      const q = c - (r - (r & 1)) / 2; // "odd-r" offset -> axial
      const t = { id: ch === 'V' ? 'V' : hexId(c, r), q, r };
      if (ch === '.' || ch === 'f') t.sea = true;
      if (ch === 'f') t.fish = true;
      tiles.push(t);
    });
  });
  return tiles;
}
const OCEANS_ORDER = ['WN', 'EN', 'ES', 'WS', 'WM', 'EM'];
const oceans = {
  description: 'Two continents split by an ocean, 84 hexes; ships move along sea lanes (Total War)',
  village: 'V',
  seaLanes: true,
  tiles: oceansTiles(),
  wedges: OCEANS_ORDER.map((k) => ({ name: k, capital: hexId(...OCEANS_WEDGES[k].capital), provinces: OCEANS_WEDGES[k].provinces.map((p) => hexId(...p)) })),
  // wedge index in OCEANS_ORDER: 0 WN, 1 EN, 2 ES, 3 WS, 4 WM, 5 EM
  seatsToWedges: {
    3: [0, 5, 3], // two in the west, one in the east middle
    4: [0, 1, 2, 3], // two per continent
    5: [0, 1, 2, 3, 4],
  },
};

module.exports = { standard19, sea37, oceans };
