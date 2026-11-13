/**
 * RANDOM MAPS (Total War "random" board)
 * =====================================
 * Makes a new map for every game: 2–4 continents grown from random seeds, an
 * ocean between them (all one connected sea, with sea lanes), the Village on an
 * island near the middle, fishing grounds, and a fair starting spot (capital +
 * two provinces) for each player.
 *
 * `rand` is a function returning a number in [0, 1) — the game's seeded random,
 * so the same seed always makes the same map. Returns a layout object in the same
 * shape as engine/layouts.js, or null if no good map came out (very rare; the
 * caller then falls back to the fixed oceans map).
 */
'use strict';

const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const LETTERS = 'ABCDEFGHIJKLMNOP';
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

function grid(cols, rows) {
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) cells.push({ c, r, q: c - (r - (r & 1)) / 2, id: `${LETTERS[c]}${r + 1}`, cont: -1 });
  const at = new Map(cells.map((x) => [`${x.q},${x.r}`, x]));
  for (const x of cells) x.nbrs = DIRS.map(([dq, dr]) => at.get(`${x.q + dq},${x.r + dr}`)).filter(Boolean);
  return cells;
}

/** Connected groups of cells passing `test`. */
function groups(cells, test) {
  const seen = new Set();
  const out = [];
  for (const x of cells) {
    if (!test(x) || seen.has(x)) continue;
    const g = [x];
    seen.add(x);
    for (let i = 0; i < g.length; i++) for (const y of g[i].nbrs) if (test(y) && !seen.has(y)) { seen.add(y); g.push(y); }
    out.push(g);
  }
  return out;
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** Farthest-point sampling: k items from `list`, spread out, the first one random. */
function spread(rand, list, k, minGap = 0) {
  if (!list.length) return [];
  const chosen = [pick(rand, list)];
  while (chosen.length < k) {
    let best = null;
    let bestD = -1;
    for (const x of list) {
      if (chosen.includes(x)) continue;
      const d = Math.min(...chosen.map((c) => dist(c, x))) + rand() * 0.5; // a little noise breaks ties
      if (d > bestD) { bestD = d; best = x; }
    }
    if (!best || bestD < minGap) break;
    chosen.push(best);
  }
  return chosen;
}

function tryMap(rand, n) {
  const cols = 10 + n; // 13–15 columns
  const rows = n >= 5 ? 9 : 8;
  const cells = grid(cols, rows);
  const land = (x) => x.cont >= 0;

  // 1. Continents: 2–4 seeds spread over the map, each grown to its share of the land.
  const k = 2 + Math.floor(rand() * (n >= 4 ? 3 : 2));
  const inner = cells.filter((x) => x.c > 0 && x.c < cols - 1 && x.r > 0 && x.r < rows - 1);
  const seeds = spread(rand, inner, k, 4);
  if (seeds.length < 2) return null;
  const target = Math.round(cells.length * (0.5 + rand() * 0.1));
  const share = seeds.map(() => 0.6 + rand() * 0.8);
  const quota = share.map((w) => Math.round((target * w) / share.reduce((a, b) => a + b, 0)));
  seeds.forEach((x, i) => (x.cont = i));
  const size = seeds.map(() => 1);
  // Grow: a continent may take a sea cell that doesn't touch another continent (so they stay apart).
  for (let guard = 0; guard < 5000 && size.reduce((a, b) => a + b, 0) < target; guard++) {
    const open = seeds.map((_, i) => i).filter((i) => size[i] < quota[i]);
    if (!open.length) break;
    const ci = pick(rand, open);
    const frontier = cells.filter((x) => !land(x) && x.nbrs.some((y) => y.cont === ci) && !x.nbrs.some((y) => land(y) && y.cont !== ci));
    if (!frontier.length) {
      quota[ci] = size[ci]; // boxed in
      continue;
    }
    // Prefer cells with more of our land around them: rounder coasts, fewer thin arms.
    const weight = (x) => x.nbrs.filter((y) => y.cont === ci).length ** 2;
    const total = frontier.reduce((a, x) => a + weight(x), 0);
    let r = rand() * total;
    let chosen = frontier[0];
    for (const x of frontier) if ((r -= weight(x)) <= 0) { chosen = x; break; }
    chosen.cont = ci;
    size[ci]++;
  }

  // 2. Lakes: sea cut off from the main ocean becomes land (if it only touches one continent).
  const seas = groups(cells, (x) => !land(x)).sort((a, b) => b.length - a.length);
  for (const lake of seas.slice(1)) {
    const conts = new Set(lake.flatMap((x) => x.nbrs.filter(land).map((y) => y.cont)));
    if (conts.size > 1) return null;
    const c = [...conts][0];
    for (const x of lake) x.cont = c;
  }
  // No continent may be tiny.
  for (let i = 0; i < seeds.length; i++) if (cells.filter((x) => x.cont === i).length < 6) return null;

  // 3. The Village: an all-sea spot near the middle that doesn't cut the ocean in two.
  const mid = { q: Math.floor(cols / 2) - (Math.floor(rows / 2) - (Math.floor(rows / 2) & 1)) / 2, r: Math.floor(rows / 2) };
  const villageSpots = cells
    .filter((x) => !land(x) && x.nbrs.length === 6 && x.nbrs.every((y) => !land(y)))
    .sort((a, b) => dist(a, mid) - dist(b, mid));
  let village = null;
  for (const v of villageSpots.slice(0, 6)) {
    v.village = true;
    if (groups(cells, (x) => !land(x) && !x.village).length === 1) {
      village = v;
      break;
    }
    v.village = false;
  }
  if (!village) {
    // No open water in the middle: put the Village on a sea cell that touches land but keeps the sea joined.
    for (const v of cells.filter((x) => !land(x)).sort((a, b) => dist(a, mid) - dist(b, mid)).slice(0, 10)) {
      v.village = true;
      if (groups(cells, (x) => !land(x) && !x.village).length === 1) {
        village = v;
        break;
      }
      v.village = false;
    }
  }
  if (!village) return null;
  village.id = 'V';
  const sea = cells.filter((x) => !land(x) && !x.village);

  // 4. Fishing grounds: a few sea cells spread around the ocean.
  for (const f of spread(rand, sea, 4 + Math.floor(rand() * 3), 2)) f.fish = true;

  // 5. Starting spots: capitals spread out over the land, each with two neighbouring provinces.
  const ok = (x) => land(x) && x.nbrs.filter(land).length >= 3;
  const caps = spread(rand, cells.filter(ok), n, 3);
  if (caps.length < n) return null;
  const used = new Set(caps);
  const wedges = [];
  for (const cap of caps) {
    const coastal = (x) => x.nbrs.some((y) => !land(y) && !y.village);
    const options = cap.nbrs.filter((y) => land(y) && !used.has(y) && !caps.some((c) => c !== cap && c.nbrs.includes(y)));
    options.sort((a, b) => coastal(b) - coastal(a) || rand() - 0.5);
    if (options.length < 2) return null;
    const provs = options.slice(0, 2);
    provs.forEach((p) => used.add(p));
    if (![cap, ...provs].some(coastal)) {
      // Every player needs a coast to launch ships from: swap in a coastal neighbour if there is one.
      const c2 = cap.nbrs.find((y) => land(y) && !used.has(y) && coastal(y));
      if (!c2) return null;
      used.delete(provs[1]);
      provs[1] = c2;
      used.add(c2);
    }
    wedges.push({ capital: cap.id, provinces: provs.map((p) => p.id), cap });
  }

  // 6. Fairness: count the land closest to each capital; nobody may have much less than the others.
  const near = caps.map(() => 0);
  for (const x of cells.filter(land)) {
    const d = caps.map((c) => dist(c, x));
    const m = Math.min(...d);
    if (d.filter((v) => v === m).length === 1) near[d.indexOf(m)]++;
  }
  if (Math.min(...near) < 0.55 * Math.max(...near)) return null;

  // Seats go round the map (by angle from the middle), like sitting round a table.
  const cx = cells.reduce((a, x) => a + x.q + x.r / 2, 0) / cells.length;
  const cy = cells.reduce((a, x) => a + x.r, 0) / cells.length;
  const angle = (w) => Math.atan2(w.cap.r - cy, w.cap.q + w.cap.r / 2 - cx);
  wedges.sort((a, b) => angle(a) - angle(b));

  return {
    description: 'A new random map every game: continents, an ocean with sea lanes, fishing grounds',
    village: 'V',
    seaLanes: true,
    tiles: cells.map((x) => ({ id: x.id, q: x.q, r: x.r, ...(land(x) || x.village ? {} : { sea: true }), ...(x.fish ? { fish: true } : {}) })),
    wedges: wedges.map(({ capital, provinces }) => ({ capital, provinces })),
    seatsToWedges: { [n]: wedges.map((_, i) => i) },
    continents: seeds.length,
  };
}

/** A random map for n players, or null after too many failed tries. */
function generateMap(rand, n) {
  for (let i = 0; i < 250; i++) {
    const m = tryMap(rand, n);
    if (m) return m;
  }
  return null;
}

module.exports = { generateMap };
