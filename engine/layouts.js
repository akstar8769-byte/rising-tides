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

module.exports = { standard19 };
