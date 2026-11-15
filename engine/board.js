/**
 * Board setup: biomes, home tiles and territories.
 */
'use strict';

const LAYOUTS = require('./layouts');
const { fail, randomInt, nextRandom } = require('./util');
const { generateMap } = require('./mapgen');

const BIOMES = {
  forest: { label: 'Forest', resource: 'wood' },
  quarry: { label: 'Quarry', resource: 'stone' },
  riverbank: { label: 'Riverbank', resource: 'sandbag' },
  mixed: { label: 'Mixed', resource: null }, // collects any materials
  sea: { label: 'Sea', resource: null }, // Total War sea bays: ships only, produce nothing
};
const SINGLE_BIOMES = ['forest', 'quarry', 'riverbank'];

/**
 * Battlefield terrain (War modes): separate from the biome, which only decides what a
 * tile produces. The terrain decides what a battle fought there looks like.
 */
const TERRAINS = {
  plains: { label: 'Plains', icon: '🌾', note: 'open ground: tank country' },
  woods: { label: 'Woods', icon: '🌳', note: 'woods round the objective: tanks bog down, infantry ambush' },
  hills: { label: 'Hills', icon: '🏔', note: 'hills round the objective: slow for tanks, strong for defenders' },
  river: { label: 'River', icon: '〰', note: 'a river across the field with two fords' },
};
/** The terrain a biome leans towards (also the fallback for tiles without a terrain). */
const BIOME_TERRAIN = { forest: 'woods', quarry: 'hills', riverbank: 'river', mixed: null };

/** A tile's battlefield terrain: its own, or (old saves, Base) the one its biome suggests. */
function terrainOf(t) {
  if (!t) return 'mixed';
  if (t.terrain) return t.terrain;
  return t.biome in BIOME_TERRAIN ? BIOME_TERRAIN[t.biome] || 'mixed' : t.biome;
}

/**
 * Give every land tile a terrain: 40% Plains, 30% the biome's own terrain, 15% each of
 * the other two (Mixed tiles: 40% Plains, 20% each). Uses its own random stream built
 * from the game seed, so it never changes the game's other dice.
 */
function assignTerrain(state, tiles) {
  let r = (state.rng ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    let t = (r = (r + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rough = ['woods', 'hills', 'river'];
  for (const t of tiles) {
    if (t.kind !== 'land') continue;
    const own = BIOME_TERRAIN[t.biome];
    const x = rand();
    if (x < 0.4) t.terrain = 'plains';
    else if (!own) t.terrain = rough[Math.min(2, Math.floor((x - 0.4) / 0.2))];
    else if (x < 0.7) t.terrain = own;
    else {
      const others = rough.filter((k) => k !== own);
      t.terrain = others[x < 0.85 ? 0 : 1];
    }
  }
}

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
  const n = state.players.length;
  // 'random': a new map made for this game from the game's seed (falls back to the oceans map).
  const L = layoutName === 'random' ? generateMap(() => nextRandom(state), n) || LAYOUTS.oceans : LAYOUTS[layoutName];
  if (!L) fail(`Unknown board layout "${layoutName}".`);
  const wedgeIdx = L.seatsToWedges[n];
  if (!wedgeIdx) fail(`Board layout "${layoutName}" has no setup for ${n} players.`);

  const tiles = L.tiles.map((t) => ({
    id: t.id,
    q: t.q,
    r: t.r,
    kind: t.id === L.village ? 'village' : t.sea ? 'sea' : 'land',
    biome: t.sea ? 'sea' : null,
    owner: null, // seat that owns it (home territory), or null for open tiles
    role: null, // 'capital' | 'province' | null
    controller: null, // seat currently holding it (differs from owner when occupied)
    units: {}, // War with stationed units: { seat: number of units on this tile }
    factory: null, // Base with factories: { owner, kind: 'sustainable' | 'unsustainable', built }
    ...(t.fish ? { fish: true } : {}), // fishing ground: earns its holder income
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

  if (L.sectors) balanceBiomes(state, tiles);
  // Every other land tile is open, with a random biome.
  for (const t of tiles) {
    if (t.kind === 'land' && t.biome === null) t.biome = SINGLE_BIOMES[randomInt(state, SINGLE_BIOMES.length)];
  }
  if (withTerritories) assignTerrain(state, tiles);
  return { layout: layoutName, tiles, ...(L.seaLanes ? { seaLanes: true } : {}) };
}

/**
 * Balanced, fair resources (Base board): the open tiles get an EVEN deck of forest,
 * quarry and riverbank (equal numbers, ±1), shuffled. Shuffles are tried until every
 * home has much the same mix nearby (within 2 tiles): each home must see all three
 * resources, and no resource may differ by more than 1 tile between any two homes.
 * The fairest of up to 300 shuffles is kept.
 */
function balanceBiomes(state, tiles) {
  const open = tiles.filter((t) => t.kind === 'land' && t.biome === null);
  const homes = tiles.filter((t) => t.role === 'capital');
  const deck = open.map((_, i) => SINGLE_BIOMES[i % 3]);
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const near = homes.map((h) => open.map((t, i) => (dist(h, t) <= 2 ? i : -1)).filter((i) => i >= 0));
  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 300 && bestScore > 0; attempt++) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(state, i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Score: spread of each resource across homes, plus a big penalty for a missing one.
    let score = 0;
    for (const b of SINGLE_BIOMES) {
      const counts = near.map((list) => list.filter((i) => deck[i] === b).length);
      score += Math.max(0, Math.max(...counts) - Math.min(...counts) - 1) + 10 * counts.filter((c) => c === 0).length;
    }
    if (score < bestScore) {
      bestScore = score;
      best = deck.slice();
    }
  }
  open.forEach((t, i) => (t.biome = best[i]));
}

function areAdjacent(a, b) {
  return DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

/** Sea bays are joined by the open ocean: ships can sail from any bay to any other. */
function seaLinked(a, b) {
  return a.kind === 'sea' && b.kind === 'sea' && a.id !== b.id;
}

/** Land neighbours of a tile (the village is never a neighbour you can use). */
function landNeighbours(board, tileId) {
  const t = board.tiles.find((x) => x.id === tileId);
  return board.tiles.filter((o) => o.kind === 'land' && areAdjacent(t, o));
}

module.exports = { BIOMES, SINGLE_BIOMES, TERRAINS, BIOME_TERRAIN, terrainOf, LAYOUTS, defaultBiomeList, buildBoard, areAdjacent, seaLinked, landNeighbours };
