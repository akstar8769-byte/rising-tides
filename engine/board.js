/**
 * Board setup: biomes, home tiles and territories.
 */
'use strict';

const LAYOUTS = require('./layouts');
const { fail, randomInt } = require('./util');

const BIOMES = {
  forest: { label: 'Forest', resource: 'wood' },
  quarry: { label: 'Quarry', resource: 'stone' },
  riverbank: { label: 'Riverbank', resource: 'sandbag' },
  mixed: { label: 'Mixed', resource: null }, // collects any materials
};
const SINGLE_BIOMES = ['forest', 'quarry', 'riverbank'];

const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/**
 * Default biome list for n players (Q4): one of each single biome, Mixed from
 * 4 players, and with 5 players one random repeat. `pick` chooses the repeat.
 */
function defaultBiomeList(n, pick) {
  const list = SINGLE_BIOMES.slice();
  if (n >= 4) list.push('mixed');
  while (list.length < n) list.push(pick(SINGLE_BIOMES));
  return list.slice(0, n);
}

/**
 * Build the board for a new game.
 * In Base mode each player only has a home tile (their capital position).
 * In War modes (withTerritories) they also get two provinces.
 */
function buildBoard(state, layoutName, withTerritories) {
  const L = LAYOUTS[layoutName];
  if (!L) fail(`Unknown board layout "${layoutName}".`);
  const n = state.players.length;
  const wedgeIdx = L.seatsToWedges[n];
  if (!wedgeIdx) fail(`Board layout "${layoutName}" has no setup for ${n} players.`);

  const tiles = L.tiles.map((t) => ({
    id: t.id,
    q: t.q,
    r: t.r,
    kind: t.id === L.village ? 'village' : 'land',
    biome: null,
    owner: null, // seat that owns it (home territory), or null for open tiles
    role: null, // 'capital' | 'province' | null
    controller: null, // seat currently holding it (differs from owner when occupied)
    units: {}, // War with stationed units: { seat: number of units on this tile }
    factory: null, // Base with factories: { owner, kind: 'sustainable' | 'unsustainable', built }
  }));
  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));

  state.players.forEach((p, seat) => {
    const w = L.wedges[wedgeIdx[seat]];
    const cap = byId[w.capital];
    Object.assign(cap, { owner: seat, controller: seat, role: 'capital', biome: p.biome });
    p.homeTile = w.capital;
    if (withTerritories) {
      // Two of the three tiles are the home biome; one province is a random other biome.
      const odd = randomInt(state, w.provinces.length);
      w.provinces.forEach((id, k) => {
        const t = byId[id];
        let biome = p.biome;
        if (k === odd) {
          const others = SINGLE_BIOMES.filter((b) => b !== p.biome);
          biome = others[randomInt(state, others.length)];
        }
        Object.assign(t, { owner: seat, controller: seat, role: 'province', biome });
      });
    }
  });

  // Every other land tile is open, with a random biome.
  for (const t of tiles) {
    if (t.kind === 'land' && t.biome === null) t.biome = SINGLE_BIOMES[randomInt(state, SINGLE_BIOMES.length)];
  }
  return { layout: layoutName, tiles };
}

function areAdjacent(a, b) {
  return DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

/** Land neighbours of a tile (the village is never a neighbour you can use). */
function landNeighbours(board, tileId) {
  const t = board.tiles.find((x) => x.id === tileId);
  return board.tiles.filter((o) => o.kind === 'land' && areAdjacent(t, o));
}

module.exports = { BIOMES, SINGLE_BIOMES, LAYOUTS, defaultBiomeList, buildBoard, areAdjacent, landNeighbours };
