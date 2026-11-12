/**
 * TOTAL WAR — LIVE BATTLES
 * ========================
 * When an attack in Total War meets defenders, the two players fight a short
 * real-time battle on a small map. Every unit becomes a small group of DOTS
 * (3 by default) that move together. Players tap a unit to select it and tap
 * where to send it; the server moves everything a little every tick.
 *
 * Three kinds of battle (b.kind):
 *  - 'land': the full battle — terrain, territory, frontline, supply and
 *    encirclement, and the flag. Bombers of the side that won the air battle fly
 *    over it, and cruisers/battleships in a neighbouring sea bay shell the coast.
 *  - 'air':  fought first when both sides bring aircraft. Interceptors hunt
 *    bombers; the winner gets air superiority for the land battle.
 *  - 'sea':  ships fight for a sea bay. No supply lines at sea; the flag still counts.
 *
 * What decides battles (all numbers are in config.js -> totalwar):
 *  - Unit types and matchups (engine/arsenal.js): tanks shrug off rifles, anti-tank
 *    guns shred tanks, only anti-air can hit aircraft from the ground, cavalry rides
 *    down militia and ENCIRCLED infantry. Artillery, anti-air and big ships shoot at range.
 *  - Terrain: forests and hills protect whoever stands in them; rivers are slow.
 *  - TERRITORY and SUPPLY (land only): a dot is supplied if it can trace a path to
 *    its own edge of the map without crossing enemy territory. Cut-off dots take
 *    more damage, deal less and surrender if they stay cut off.
 *  - FLANKING: a dot hit from two different sides takes extra damage.
 *  - FORMATIONS: each side can pick a formation at any time (which ones depends on
 *    its units). Picking one arranges the army and gives its bonuses until changed.
 *    Auto-battle picks and changes formations by itself as the fight goes.
 *
 * This file only knows about battles. engine/war.js starts them and applies the
 * results to the board. stepBattle() changes a battle IN PLACE (it runs ten
 * times a second, so copying the whole game each time would be too slow).
 */
'use strict';

const ARS = require('./arsenal');

const MAP_W = 60;
const MAP_H = 40;
const TCELL = 4; // terrain cell size -> 15 x 10 terrain grid
const SCELL = 2; // territory / supply cell size -> 30 x 20 grid
const COLS = MAP_W / SCELL;
const ROWS = MAP_H / SCELL;
const CONTACT = 2.2; // dots this close fight each other
const PAINT = 3; // dots claim ground within this distance
const TYPES = ARS.TYPES;
const SIDES = ['A', 'D'];
const AI_EVERY = 1.2; // seconds between AI decisions
const IDLE_AUTO = 15; // a side that gives no order for this long is put on auto-battle
const FORMATION_COOLDOWN = 2; // seconds between formation changes
// Where each dot of a unit stands relative to the unit's centre (a small triangle)
const SLOTS = [
  [0, -0.9],
  [-0.9, 0.6],
  [0.9, 0.6],
  [0, 0.9],
  [-1, -0.5],
  [1, -0.5],
];

const sum = ARS.sum;
const zero = ARS.zero;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cellOf = (x, y) => clamp(Math.floor(y / SCELL), 0, ROWS - 1) * COLS + clamp(Math.floor(x / SCELL), 0, COLS - 1);
const isAir = (d) => ARS.UNITS[d.type].domain === 'air';
const groundOf = (b, side) => b.dots.filter((d) => d.side === side && !isAir(d));

// ---------------------------------------------------------------- formations

/**
 * Formations. `needs` gets the side's unit counts (by type) and says whether the
 * formation is available. Bonuses are in config.js -> totalwar.formations.
 */
const has = (c, list) => list.some((k) => (c[k] || 0) > 0);
const FORMATIONS = {
  line: { name: 'Line', desc: 'A steady front with support behind. Extra protection.', needs: () => true },
  square: { name: 'Defensive square', desc: 'Close ranks all round. Much tougher, slower, hits a little less.', needs: () => true },
  wedge: { name: 'Wedge', desc: 'Fast units at the point to break through. More attack.', needs: (c, kind) => kind === 'land' && has(c, ARS.FAST) },
  pincer: { name: 'Pincer', desc: 'Two wings swing round the enemy flanks to encircle them.', needs: (c, kind) => kind === 'land' && sum(c) >= 4 },
  spearhead: { name: 'Armour spearhead', desc: 'Tanks lead in a column, the rest follow. Big attack and speed.', needs: (c, kind) => kind === 'land' && has(c, ARS.TANKS) },
  combined: {
    name: 'Combined arms',
    desc: 'Infantry, armour and support guns working together. Better at everything.',
    needs: (c, kind) => kind === 'land' && has(c, ['militia', 'infantry', 'motorised', 'mechanised']) && has(c, ['cavalry', ...ARS.TANKS]) && has(c, ['artillery', 'antitank', 'antiair']),
  },
  firebase: { name: 'Artillery screen', desc: 'Guns at the back, a wall in front. Artillery reaches further.', needs: (c, kind) => kind === 'land' && (c.artillery || 0) > 0 },
};
const FORMATION_IDS = Object.keys(FORMATIONS);

function countsOf(b, side) {
  const c = zero();
  const seen = new Set();
  for (const d of b.dots) {
    if (d.side !== side || seen.has(d.unit) || isAir(d)) continue;
    seen.add(d.unit);
    c[d.type]++;
  }
  return c;
}

/** Formations this side can use right now. */
function availableFormations(b, side) {
  if (b.kind === 'air') return [];
  const c = countsOf(b, side);
  return FORMATION_IDS.filter((id) => FORMATIONS[id].needs(c, b.kind));
}

function formationBonus(b, side, cfg) {
  const id = b.formation && b.formation[side];
  const f = id && cfg.formations && cfg.formations[id];
  return f ? { att: f.attackPct / 100, def: f.defencePct / 100, spd: f.speedPct / 100 } : { att: 1, def: 1, spd: 1 };
}

/**
 * Place this side's units in the formation's shape. The shape is built around
 * the army's centre, facing the enemy (attackers with nobody in sight face the flag).
 */
function arrange(b, side, id) {
  const units = unitsOf(b, side).filter((u) => ARS.UNITS[u.type].domain !== 'air');
  if (!units.length) return;
  const anchor = centroid(units);
  const foes = groundOf(b, side === 'A' ? 'D' : 'A');
  const aim = foes.length ? centroid(foes) : side === 'A' ? b.obj : { x: anchor.x - 10, y: anchor.y };
  let dx = aim.x - anchor.x;
  let dy = aim.y - anchor.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const px = -dy; // perpendicular (across the front)
  const py = dx;
  const at = (fwd, across) => ({ x: clamp(anchor.x + dx * fwd + px * across, 2, MAP_W - 2), y: clamp(anchor.y + dy * fwd + py * across, 2, MAP_H - 2) });
  const role = (u) => (['artillery', 'antiair'].includes(u.type) || ARS.UNITS[u.type].domain === 'sea' && ['battleship'].includes(u.type) ? 'back' : ARS.FAST.includes(u.type) && !['motorised', 'mechanised'].includes(u.type) ? 'fast' : 'front');
  const front = units.filter((u) => role(u) === 'front');
  const fast = units.filter((u) => role(u) === 'fast');
  const back = units.filter((u) => role(u) === 'back');
  const spread = (list, fwd, gap = 3.5, offset = 0) => list.map((u, i) => [u, at(fwd, offset + (i - (list.length - 1) / 2) * gap)]);
  let spots = [];
  if (id === 'line') spots = [...spread([...front, ...fast], 0), ...spread(back, -6)];
  else if (id === 'square') {
    const ring = [...front, ...fast];
    const r = 2.5 + ring.length * 0.55;
    spots = ring.map((u, i) => {
      const a = (2 * Math.PI * i) / Math.max(1, ring.length);
      return [u, at(Math.cos(a) * r, Math.sin(a) * r)];
    });
    spots.push(...spread(back, 0, 2));
  } else if (id === 'wedge') {
    const order = [...fast, ...front];
    spots = order.map((u, i) => {
      const row = Math.ceil(i / 2);
      return [u, at(4 - row * 2.6, (i % 2 ? 1 : -1) * row * 2.4)];
    });
    spots.push(...spread(back, -8));
  } else if (id === 'pincer') {
    const wings = [...fast, ...front];
    spots = wings.map((u, i) => [u, at(3 + Math.floor(i / 2) * 1.5, (i % 2 ? 1 : -1) * (9 + Math.floor(i / 2) * 1.2))]);
    spots.push(...spread(back, -5));
  } else if (id === 'spearhead') {
    const tanks = units.filter((u) => ARS.TANKS.includes(u.type));
    const rest = units.filter((u) => !ARS.TANKS.includes(u.type) && role(u) !== 'back');
    spots = tanks.map((u, i) => [u, at(6 - i * 2.4, (i % 2 ? 0.8 : -0.8))]);
    spots.push(...spread(rest, -4 - tanks.length * 1.2), ...spread(back, -10 - tanks.length));
  } else if (id === 'combined') {
    spots = [...spread(front, 0), ...fast.map((u, i) => [u, at(-2, (i % 2 ? 1 : -1) * (front.length * 1.75 + 3 + Math.floor(i / 2) * 2.5))]), ...spread(back, -6)];
  } else if (id === 'firebase') {
    spots = [...spread([...front, ...fast], 5), ...spread(back, -4, 2.6)];
  }
  for (const [u, p] of spots) sendUnits(b, side, new Set([u.unit]), p.x, p.y);
}

/** Pick a formation for a side (players' choice, or the computer's). */
function setFormation(b, side, id, { arrangeNow = true } = {}) {
  if (id !== null && !availableFormations(b, side).includes(id)) return false;
  if (b.formation[side] === id) return true;
  if (b.time - (b.formationAt[side] ?? -99) < FORMATION_COOLDOWN && b.formation[side] != null) return false;
  b.formation[side] = id;
  b.formationAt[side] = b.time;
  if (id && arrangeNow) {
    arrange(b, side, id);
    if (b.gunsHeld) b.gunsHeld[side] = {}; // guns rejoin the formation and follow the army again
  }
  return true;
}

// ---------------------------------------------------------------- map

/**
 * Terrain grid (rows of characters): '.' plain, 'f' forest, 'h' hill,
 * 'w' river, '=' ford, 'o' open sea. Built from the defended tile's biome (the
 * right side, around the objective) and the attacker's tile (the left side).
 */
function makeTerrain(defBiome, attBiome, rand, kind = 'land') {
  const cols = MAP_W / TCELL;
  const rows = MAP_H / TCELL;
  if (kind === 'sea') return Array.from({ length: rows }, () => 'o'.repeat(cols));
  if (kind === 'air') return Array.from({ length: rows }, () => '.'.repeat(cols));
  const g = Array.from({ length: rows }, () => Array(cols).fill('.'));
  const blob = (cx, cy, r, ch) => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (Math.hypot(x - cx, y - cy) <= r + rand() * 0.6) g[y][x] = ch;
  };
  const scatter = (biome, x0, x1, count) => {
    for (let i = 0; i < count; i++) {
      const cx = x0 + rand() * (x1 - x0);
      const cy = 1 + rand() * (rows - 2);
      if (biome === 'forest') blob(cx, cy, 1 + rand(), 'f');
      else if (biome === 'quarry') blob(cx, cy, 0.8 + rand(), 'h');
      else if (biome === 'mixed') blob(cx, cy, 1, i % 2 ? 'f' : 'h');
    }
  };
  scatter(defBiome, 7, 14, defBiome === 'riverbank' ? 0 : 3);
  scatter(attBiome, 1, 6, attBiome === 'riverbank' ? 0 : 2);
  if (defBiome === 'riverbank' || attBiome === 'riverbank') {
    // A river crossing the map from top to bottom, with two fords.
    const rx = 6 + Math.floor(rand() * 2);
    for (let y = 0; y < rows; y++) g[y][rx] = 'w';
    g[1 + Math.floor(rand() * 3)][rx] = '=';
    g[rows - 2 - Math.floor(rand() * 3)][rx] = '=';
  }
  return g.map((r) => r.join(''));
}

function terrainAt(b, x, y) {
  const r = b.terrain[clamp(Math.floor(y / TCELL), 0, b.terrain.length - 1)];
  return r[clamp(Math.floor(x / TCELL), 0, r.length - 1)];
}

function speedFactor(ch, type) {
  if (ARS.UNITS[type].domain !== 'land') return 1;
  const wheeled = ARS.TANKS.includes(type) || type === 'motorised' || type === 'mechanised' || type === 'artillery';
  if (ch === 'f') return type === 'cavalry' ? 0.45 : wheeled ? 0.55 : 0.7;
  if (ch === 'h') return wheeled ? 0.65 : 0.75;
  if (ch === 'w') return 0.3;
  if (ch === '=') return 0.75;
  return 1;
}

function defenceFactor(ch, cfg) {
  if (ch === 'f') return cfg.forestDefencePct / 100;
  if (ch === 'h') return cfg.hillDefencePct / 100;
  if (ch === 'w') return 0.8; // standing in a river is a bad idea
  return 1;
}

// ---------------------------------------------------------------- setup

/**
 * Create a battle. aTroops / dTroops are { type: units } (any unit types; in a land
 * battle only bombers come as aircraft — the side that won the air battle).
 * Each unit becomes cfg.dotsPerUnit dots that share its toughness and damage.
 * `rand` is the game's seeded random number function, so battles replay exactly.
 * bombard: { A, D } shore-bombardment damage per second from ships offshore.
 */
function createBattle({ id, kind = 'land', tile, from, attacker, defender, aTroops, dTroops, cfg, rand, bombard = null }) {
  const dpu = Math.max(1, Math.min(SLOTS.length, cfg.dotsPerUnit || 1));
  const b = {
    id,
    kind,
    tile: tile.id,
    from: from.id,
    attacker,
    defender,
    terrain: makeTerrain(tile.biome, from.biome, rand, kind),
    obj: { x: 47, y: 20, r: 5 },
    dpu,
    initial: { A: { ...zero(), ...aTroops }, D: { ...zero(), ...dTroops } },
    // Territory (land battles): who holds each 2x2 square ('A', 'D' or '' for nobody yet).
    // The attacker starts with a strip on the left, the defender most of the rest.
    territory: Array.from({ length: COLS * ROWS }, (_, i) => (kind !== 'land' ? '' : (i % COLS) * SCELL < 8 ? 'A' : (i % COLS) * SCELL >= 26 ? 'D' : '')),
    reach: { A: [], D: [] }, // squares each side can supply (filled by computeSupply)
    dots: [],
    time: 0,
    capture: 0,
    limit: kind === 'air' ? cfg.airBattleSeconds || 45 : cfg.battleSeconds,
    speed: (cfg.battleSpeedPct || 100) / 100, // slow motion: battle seconds per real second
    captureNeeded: cfg.captureSeconds,
    auto: { A: false, D: false },
    ordered: { A: false, D: false },
    gunsHeld: { A: {}, D: {} }, // artillery units the player parked by hand (they stop following the army)
    ai: { A: 0, D: 0 },
    formation: { A: null, D: null },
    formationAt: { A: null, D: null },
    bombard: bombard || { A: 0, D: 0 },
    bombardAt: { A: null, D: null },
    shots: [], // recent shells, for the battle screen
    supplyTimer: 0,
    losses: { A: zero(), D: zero() }, // dots destroyed
    surrendered: { A: zero(), D: zero() }, // dots that surrendered
    status: 'live',
    winner: null,
    reason: null,
  };
  let nextDot = 1;
  let nextUnit = 1;
  const addUnit = (side, seat, type, cx, cy) => {
    const unit = nextUnit++;
    const hp = cfg[type].hp / dpu;
    for (let k = 0; k < dpu; k++) {
      const x = clamp(cx + SLOTS[k][0], 1, MAP_W - 1);
      const y = clamp(cy + SLOTS[k][1], 1, MAP_H - 1);
      b.dots.push({ id: nextDot++, unit, slot: k, side, seat, type, x, y, tx: x, ty: y, hp, max: hp, cut: false, cutT: 0 });
    }
  };
  // Where a unit starts, by how it fights: guns at the back, fast units forward,
  // aircraft high up on the flanks. Attackers enter from the left.
  const depth = (t) => (['artillery', 'antiair', 'battleship'].includes(t) ? 0 : ARS.UNITS[t].domain === 'air' ? 1 : ARS.FAST.includes(t) ? 3 : 2);
  const place = (side, seat, troops) => {
    const list = TYPES.flatMap((t) => Array(troops[t] || 0).fill(t)).sort((p, q) => depth(p) - depth(q));
    const perCol = {};
    for (const t of list) {
      const col = depth(t);
      const k = (perCol[col] = (perCol[col] || 0) + 1) - 1;
      const spreadY = clamp(MAP_H / 2 + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * 3.5, 3, MAP_H - 3);
      let x;
      if (side === 'A') x = 3 + col * 3 + (k % 2) * 1.2;
      else if (kind === 'land') x = t === 'infantry' || t === 'mechanised' || t === 'motorised' ? b.obj.x : col === 0 ? b.obj.x + 7 : col === 3 ? b.obj.x + 4 : t === 'militia' || t === 'antitank' ? b.obj.x - 6 : b.obj.x + 2;
      else x = MAP_W - 3 - col * 3 - (k % 2) * 1.2;
      const y = ARS.UNITS[t].domain === 'air' && kind === 'land' ? (k % 2 ? 4 : MAP_H - 4) : spreadY;
      addUnit(side, seat, t, x, y);
    }
  };
  place('A', attacker, aTroops);
  place('D', defender, dTroops);
  if (kind === 'land') computeSupply(b);
  return b;
}

// ---------------------------------------------------------------- orders

/** Send units (any of their dots' ids) to (x, y); each dot keeps its place in the unit. */
function order(b, side, ids, x, y) {
  const tx = clamp(Number(x), 1, MAP_W - 1);
  const ty = clamp(Number(y), 1, MAP_H - 1);
  const picked = b.dots.filter((d) => d.side === side && ids.includes(d.id));
  const units = new Set(picked.map((d) => d.unit));
  b.gunsHeld = b.gunsHeld || { A: {}, D: {} };
  for (const d of picked) if (d.type === 'artillery') b.gunsHeld[side][d.unit] = true;
  if (units.size > 1) {
    // Several units move as one block: the whole group shifts so its centre lands on the
    // spot, and every unit keeps its place in the formation.
    const group = b.dots.filter((d) => d.side === side && units.has(d.unit));
    const c = centroid(group);
    const dx = tx - c.x;
    const dy = ty - c.y;
    for (const d of group) {
      d.tx = clamp(d.x + dx, 0.5, MAP_W - 0.5);
      d.ty = clamp(d.y + dy, 0.5, MAP_H - 0.5);
    }
  } else sendUnits(b, side, units, tx, ty);
  b.ordered[side] = true;
  return units.size;
}

/**
 * Artillery follows the army: every so often, guns the player hasn't parked by hand
 * move to just inside their range of the nearest enemy, staying behind the line.
 */
function gunsFollow(b, side, cfg) {
  const foes = b.dots.filter((d) => d.side !== side && !isAir(d));
  if (!foes.length) return;
  const held = (b.gunsHeld && b.gunsHeld[side]) || {};
  for (const u of unitsOf(b, side)) {
    if (u.type !== 'artillery' || held[u.unit]) continue;
    const t = foes.reduce((a, f) => (dist(u, f) < dist(u, a) ? f : a));
    let range = cfg.artillery.range || 9;
    if (b.formation[side] === 'firebase') range += 3;
    const keep = range * 0.8; // a little inside the range so small moves don't take them out of it
    const d = dist(u, t) || 1;
    if (d > range * 0.95 || d < keep * 0.6) sendUnits(b, side, new Set([u.unit]), u.x + ((t.x - u.x) * (d - keep)) / d, u.y + ((t.y - u.y) * (d - keep)) / d);
  }
}

function sendUnits(b, side, units, tx, ty) {
  for (const d of b.dots) {
    if (d.side !== side || !units.has(d.unit)) continue;
    d.tx = clamp(tx + SLOTS[d.slot][0] * 1.2, 0.5, MAP_W - 0.5);
    d.ty = clamp(ty + SLOTS[d.slot][1] * 1.2, 0.5, MAP_H - 0.5);
  }
}

// ---------------------------------------------------------------- territory and supply

/**
 * Land battles only.
 * 1. Ground dots claim the ground around them (the nearest dot within PAINT wins).
 * 2. From each side's edge, flood out through squares the ENEMY doesn't hold.
 * 3. A dot whose square can't be reached is cut off. (Aircraft are never cut off.)
 */
function computeSupply(b) {
  if (b.kind !== 'land') return;
  const ground = b.dots.filter((d) => !isAir(d));
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const p = { x: (cx + 0.5) * SCELL, y: (cy + 0.5) * SCELL };
      let best = PAINT;
      let side = null;
      for (const d of ground) {
        const dd = dist(d, p);
        if (dd < best) {
          best = dd;
          side = d.side;
        }
      }
      if (side) b.territory[cy * COLS + cx] = side;
    }
  }
  for (const side of SIDES) {
    const enemy = side === 'A' ? 'D' : 'A';
    const seen = new Uint8Array(COLS * ROWS);
    const queue = [];
    const edge = side === 'A' ? 0 : COLS - 1; // attackers are supplied from the left, defenders from the right
    for (let cy = 0; cy < ROWS; cy++) {
      const i = cy * COLS + edge;
      if (b.territory[i] !== enemy) {
        seen[i] = 1;
        queue.push(i);
      }
    }
    while (queue.length) {
      const i = queue.pop();
      const cx = i % COLS;
      const cy = (i - cx) / COLS;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (seen[j] || b.territory[j] === enemy) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    b.reach[side] = seen;
    for (const d of b.dots) if (d.side === side) d.cut = !isAir(d) && !seen[cellOf(d.x, d.y)];
  }
}

/**
 * Territory for drawing: one character per square.
 * 'a' / 'd' = held and supplied, 'A' / 'D' = held but cut off (a pocket), '.' = nobody.
 */
function territoryString(b) {
  let s = '';
  for (let i = 0; i < b.territory.length; i++) {
    const t = b.territory[i];
    if (!t) s += '.';
    else s += b.reach[t] && b.reach[t][i] ? t.toLowerCase() : t;
  }
  return s;
}

// ---------------------------------------------------------------- AI (bots and auto-battle)

function centroid(list) {
  return { x: list.reduce((a, d) => a + d.x, 0) / list.length, y: list.reduce((a, d) => a + d.y, 0) / list.length };
}

/** Group a side's dots into units: [{ unit, type, x, y }] (x, y = centre). */
function unitsOf(b, side) {
  const map = new Map();
  for (const d of b.dots) {
    if (d.side !== side) continue;
    if (!map.has(d.unit)) map.set(d.unit, { unit: d.unit, type: d.type, dots: [] });
    map.get(d.unit).dots.push(d);
  }
  return [...map.values()].map((u) => ({ ...u, ...centroid(u.dots) }));
}

const strength = (list) => list.reduce((a, d) => a + d.hp, 0);

/** The computer chooses a formation for the situation (and changes it as things change). */
function aiFormation(b, side) {
  const avail = availableFormations(b, side);
  if (!avail.length) return;
  const mine = groundOf(b, side);
  const foes = groundOf(b, side === 'A' ? 'D' : 'A');
  if (!mine.length) return;
  const ratio = strength(mine) / Math.max(1, strength(foes));
  const cutShare = mine.filter((d) => d.cut).length / mine.length;
  const pick = (...ids) => ids.find((x) => avail.includes(x));
  let want;
  if (ratio < 0.6 || cutShare > 0.3) want = pick('square', 'line');
  else if (side === 'A') want = ratio > 1.4 ? pick('pincer', 'spearhead', 'combined', 'wedge', 'line') : pick('spearhead', 'combined', 'wedge', 'line');
  else want = pick('firebase', 'combined', 'line');
  if (want && want !== b.formation[side]) setFormation(b, side, want, { arrangeNow: false });
}

function runAI(b, side, cfg) {
  if (b.kind !== 'air') aiFormation(b, side);
  const mine = unitsOf(b, side);
  const foes = b.dots.filter((d) => d.side !== side);
  if (!mine.length || !foes.length) return;
  const o = b.obj;
  const nearest = (u, list = foes) => list.reduce((a, f) => (dist(u, f) < dist(u, a) ? f : a));
  const go = (u, t) => sendUnits(b, side, new Set([u.unit]), t.x, t.y);
  if (b.kind === 'air') {
    // Interceptors hunt bombers first; bombers stay out of the way.
    for (const u of mine) {
      const prey = foes.filter((f) => f.type === 'bomber');
      if (u.type === 'interceptor') go(u, nearest(u, prey.length ? prey : foes));
      else go(u, { x: side === 'A' ? 4 : MAP_W - 4, y: u.y });
    }
    return;
  }
  const foeGround = foes.filter((d) => !isAir(d));
  const foeC = centroid(foeGround.length ? foeGround : foes);
  for (const u of mine) {
    if (u.type === 'bomber') {
      // Bombers go for the biggest target: armour first, then whatever is near the flag.
      const armour = foeGround.filter((f) => ARS.UNITS[f.type].cls === 'armor');
      if (foeGround.length) go(u, nearest(u, armour.length ? armour : foeGround));
    } else if (['artillery', 'antiair'].includes(u.type)) {
      // Guns stay behind the line, in range of the enemy.
      const t = foeGround.length ? nearest(u, foeGround) : o;
      const rng = Math.max(3, ((cfg && cfg[u.type] && cfg[u.type].range) || (u.type === 'artillery' ? 9 : 7)) * 0.8);
      const d = dist(u, t) || 1;
      go(u, d > rng ? { x: u.x + ((t.x - u.x) * (d - rng)) / d, y: u.y + ((t.y - u.y) * (d - rng)) / d } : u);
    }
  }
  const rest = mine.filter((u) => !['bomber', 'artillery', 'antiair'].includes(u.type));
  if (b.kind === 'sea') {
    rest.forEach((u, i) => go(u, side === 'A' ? { x: o.x - 1 + (i % 3) * 1.5, y: o.y + ((i % 5) - 2) * 2.2 } : nearest(u, foeGround.length ? foeGround : foes)));
    return;
  }
  const fast = (t) => t === 'cavalry' || ARS.TANKS.includes(t);
  if (side === 'A') {
    // Foot soldiers march on the flag together; cavalry and tanks swing round a flank and hit from behind.
    const flankY = foeC.y > MAP_H / 2 ? 6 : MAP_H - 6;
    rest.forEach((u, i) => {
      if (fast(u.type) && foeGround.length) {
        const behind = { x: Math.min(MAP_W - 3, foeC.x + 8), y: flankY };
        go(u, dist(u, behind) < 4 || u.x > foeC.x ? nearest(u, foeGround) : behind);
      } else go(u, { x: o.x - 1 + (i % 3) * 1.5, y: o.y + ((i % 5) - 2) * 2.2 });
    });
  } else {
    // Infantry hold the flag; militia meet attackers who come close; fast units
    // ride behind the attackers to cut their supply line.
    rest.forEach((u, i) => {
      if (['infantry', 'motorised', 'mechanised'].includes(u.type)) go(u, { x: o.x + ((i % 3) - 1) * 2.4, y: o.y + ((i % 4) - 1.5) * 2.4 });
      else if (fast(u.type) && foeGround.length) {
        const rear = { x: Math.max(3, foeC.x - 8), y: foeC.y > MAP_H / 2 ? MAP_H - 5 : 5 };
        go(u, dist(u, rear) < 4 ? nearest(u, foeGround) : rear);
      } else {
        const close = foeGround.filter((a) => dist(a, o) < 16);
        go(u, close.length ? nearest(u, close) : { x: o.x - 6, y: o.y + ((i % 5) - 2) * 3.5 });
      }
    });
  }
}

// ---------------------------------------------------------------- the simulation

/** Is this dot being hit from two quite different directions? */
function flanked(d, attackers) {
  if (attackers.length < 2) return false;
  const angles = attackers.map((a) => Math.atan2(a.y - d.y, a.x - d.x));
  for (let i = 0; i < angles.length; i++) {
    for (let j = i + 1; j < angles.length; j++) {
      let diff = Math.abs(angles[i] - angles[j]);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > (100 * Math.PI) / 180) return true;
    }
  }
  return false;
}

/** Can dot d engage dot e up close? Ground fights ground, planes fight planes; bombers dive on ground troops. */
function canMelee(d, e) {
  const da = isAir(d);
  const ea = isAir(e);
  if (da === ea) return true;
  return da && d.type === 'bomber';
}

/**
 * Shots for the battle screen to animate: a gun fires a visible shell about once a
 * second (damage itself is dealt every tick). Kept until the next snapshot is sent.
 */
function shoot(b, d, target, type) {
  if (b.time - (d.firedAt ?? -9) < 1) return;
  d.firedAt = b.time;
  addShot(b, d, target, type);
}
function addShot(b, from, to, type) {
  if (!b.shots) b.shots = [];
  if (b.shots.length >= 80) return;
  b.shots.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, k: type });
}

/** Advance one battle by dt seconds. Returns true if it just ended. */
function stepBattle(b, dt, cfg) {
  if (b.status !== 'live') return false;
  b.time += dt;
  const dpu = b.dpu || 1;
  const bonus = { A: formationBonus(b, 'A', cfg), D: formationBonus(b, 'D', cfg) };

  // Sides that never gave an order get the computer's help.
  for (const side of SIDES) {
    if (!b.ordered[side] && b.time > IDLE_AUTO) b.auto[side] = true;
    if (!b.auto[side] && b.kind !== 'air') {
      // Guns follow the army even while the player gives the orders.
      b.gunT = b.gunT || { A: 0, D: 0 };
      b.gunT[side] -= dt;
      if (b.gunT[side] <= 0) {
        gunsFollow(b, side, cfg);
        b.gunT[side] = AI_EVERY;
      }
    }
    if (b.auto[side]) {
      b.ai[side] -= dt;
      if (b.ai[side] <= 0) {
        runAI(b, side, cfg);
        b.ai[side] = AI_EVERY;
      }
    }
  }

  // Who is in contact with whom
  const contact = new Map();
  for (const d of b.dots) contact.set(d, b.dots.filter((e) => e.side !== d.side && Math.abs(e.x - d.x) <= CONTACT && dist(d, e) <= CONTACT && canMelee(d, e)));

  // Movement: ground dots in contact can still move, but slowly. Aircraft fly freely.
  for (const d of b.dots) {
    const togo = Math.hypot(d.tx - d.x, d.ty - d.y);
    if (togo < 0.15) continue;
    const slowed = !isAir(d) && contact.get(d).length;
    const sp = cfg[d.type].speed * bonus[d.side].spd * speedFactor(terrainAt(b, d.x, d.y), d.type) * (slowed ? 0.3 : 1) * dt;
    const k = Math.min(1, sp / togo);
    d.x += (d.tx - d.x) * k;
    d.y += (d.ty - d.y) * k;
  }
  // Keep dots of the same side (and the same layer: ground or air) from piling up.
  for (let i = 0; i < b.dots.length; i++) {
    for (let j = i + 1; j < b.dots.length; j++) {
      const a = b.dots[i];
      const c = b.dots[j];
      if (a.side !== c.side || isAir(a) !== isAir(c)) continue;
      const dd = dist(a, c);
      if (dd > 0 && dd < 1.1) {
        const push = (1.1 - dd) / 2;
        const ux = (a.x - c.x) / dd;
        const uy = (a.y - c.y) / dd;
        a.x = clamp(a.x + ux * push, 0.5, MAP_W - 0.5);
        a.y = clamp(a.y + uy * push, 0.5, MAP_H - 0.5);
        c.x = clamp(c.x - ux * push, 0.5, MAP_W - 0.5);
        c.y = clamp(c.y - uy * push, 0.5, MAP_H - 0.5);
      }
    }
  }

  // Combat. Up close every dot hits the nearest enemy it can reach. Guns (artillery,
  // anti-air, big ships) also fire at range when nothing is in contact.
  const damage = new Map();
  const hit = (d, target, base) => {
    let dmg = (cfg[d.type].attack / dpu) * ARS.matchup(d.type, target.type, cfg, target.cut) * base * bonus[d.side].att * dt;
    if (d.cut) dmg *= 0.75; // cut-off troops are low on supplies
    if (dmg > 0) damage.set(target, (damage.get(target) || 0) + dmg);
  };
  for (const d of b.dots) {
    const foes = contact.get(d);
    if (foes.length) {
      const useful = foes.filter((f) => ARS.matchup(d.type, f.type, cfg) > 0);
      if (!useful.length) continue;
      // Hit what we're best against (anti-tank goes for tanks), then the nearest.
      const score = (f) => ARS.matchup(d.type, f.type, cfg) * 100 - dist(d, f);
      const target = useful.reduce((a, f) => (score(f) > score(a) ? f : a));
      // Artillery is almost helpless at close quarters.
      hit(d, target, d.type === 'artillery' ? (cfg.artilleryMeleeAttackPct ?? 15) / 100 : 1);
      // Bombers over ground troops: show a bomb run (about one bomb per dot each second).
      if (d.type === 'bomber' && !isAir(target)) shoot(b, d, target, 'bomb');
      continue;
    }
    let range = cfg[d.type].range || 0;
    if (!range) continue;
    if (d.type === 'artillery' && b.formation[d.side] === 'firebase') range += 3;
    let target = null;
    let best = range;
    for (const e of b.dots) {
      if (e.side === d.side || ARS.matchup(d.type, e.type, cfg) <= 0) continue;
      if (d.type === 'antiair' && !isAir(e)) continue; // anti-air saves its fire for aircraft
      const dd = dist(d, e);
      if (dd <= best) {
        best = dd;
        target = e;
      }
    }
    if (target) {
      hit(d, target, 1);
      shoot(b, d, target, d.type);
    }
  }
  // Shore bombardment: ships offshore shell the enemy troops nearest the flag.
  for (const side of SIDES) {
    const dps = b.bombard[side] || 0;
    if (!dps) continue;
    const foes = groundOf(b, side === 'A' ? 'D' : 'A');
    if (!foes.length) continue;
    const t = foes.reduce((a, f) => (dist(f, b.obj) < dist(a, b.obj) ? f : a));
    damage.set(t, (damage.get(t) || 0) + dps * dt);
    // A shell from offshore (the top or bottom edge), about once a second.
    if (b.time - (b.bombardAt[side] ?? -9) >= 1) {
      b.bombardAt[side] = b.time;
      addShot(b, { x: t.x + (side === 'A' ? -6 : 6), y: t.y < MAP_H / 2 ? 0 : MAP_H }, t, 'ship');
    }
  }
  for (const [t, dmg] of damage) {
    let mult = isAir(t) ? 1 : 1 / defenceFactor(terrainAt(b, t.x, t.y), cfg);
    mult /= bonus[t.side].def;
    if (t.cut) mult *= cfg.cutOffDamagePct / 100;
    if (flanked(t, contact.get(t))) mult *= cfg.flankDamagePct / 100;
    if (t.type === 'artillery' && contact.get(t).length) mult *= (cfg.artilleryMeleeDamageTakenPct ?? 150) / 100; // overrun guns
    t.hp -= dmg * mult;
  }
  b.dots = b.dots.filter((d) => {
    if (d.hp > 0) return true;
    b.losses[d.side][d.type]++;
    return false;
  });

  // Territory, supply lines and surrender (land battles)
  if (b.kind === 'land') {
    b.supplyTimer -= dt;
    if (b.supplyTimer <= 0) {
      computeSupply(b);
      b.supplyTimer = 0.5;
    }
    b.dots = b.dots.filter((d) => {
      d.cutT = d.cut ? d.cutT + dt : 0;
      if (d.cutT < cfg.surrenderSeconds) return true;
      b.surrendered[d.side][d.type]++;
      return false;
    });
  }

  const left = (side) => b.dots.some((d) => d.side === side);
  if (b.kind === 'air') {
    // Air battle: the last side with aircraft wins; at the time limit, the stronger side.
    if (!left('A')) return finish(b, 'D', left('D') ? 'the attacking aircraft were shot down' : 'both air forces were destroyed');
    if (!left('D')) return finish(b, 'A', 'the defending aircraft were shot down');
    if (b.time >= b.limit) {
      const a = strength(b.dots.filter((d) => d.side === 'A'));
      const dd = strength(b.dots.filter((d) => d.side === 'D'));
      return finish(b, a > dd ? 'A' : 'D', a > dd ? 'the attackers rule the skies' : 'the defenders hold the skies');
    }
    return false;
  }

  // The objective: only ground troops (or ships at sea) can hold the flag.
  const onFlag = (side) => b.dots.some((d) => d.side === side && !isAir(d) && dist(d, b.obj) <= b.obj.r);
  if (onFlag('A') && !onFlag('D')) b.capture += dt;
  else b.capture = Math.max(0, b.capture - dt * 0.5);

  // Has someone won?
  if (!left('A')) return finish(b, 'D', left('D') ? 'the attack was destroyed' : 'both sides were destroyed');
  if (!groundOf(b, 'D').length) return finish(b, 'A', 'every defender fell'); // bombers can't hold ground
  if (b.capture >= b.captureNeeded) return finish(b, 'A', 'the attackers took the objective');
  if (b.time >= b.limit) return finish(b, 'D', 'the defenders held out');
  return false;
}

function finish(b, winner, reason) {
  b.status = 'done';
  b.winner = winner;
  b.reason = reason;
  // The loser's cut-off troops can't get away: they're captured.
  for (const d of b.dots.filter((x) => x.side !== winner && x.cut)) b.surrendered[d.side][d.type]++;
  b.dots = b.dots.filter((x) => x.side === winner || !x.cut);
  return true;
}

/**
 * Units that come out of the battle, by type: the surviving dots of each type
 * are grouped back into whole units (rounding up), never more than went in.
 */
function survivors(b, side) {
  const dpu = b.dpu || 1;
  const dots = zero();
  for (const d of b.dots) if (d.side === side) dots[d.type]++;
  const c = zero();
  for (const k of TYPES) c[k] = Math.min(b.initial ? b.initial[side][k] : Infinity, Math.ceil(dots[k] / dpu));
  return c;
}

/** Units lost in the battle (destroyed or surrendered). */
function unitsLost(b, side) {
  const start = b.initial ? sum(b.initial[side]) : sum(survivors(b, side)) + Math.ceil((sum(b.losses[side]) + sum(b.surrendered[side])) / (b.dpu || 1));
  return start - sum(survivors(b, side));
}

/** Of the units lost, how many surrendered after being cut off. */
function unitsSurrendered(b, side) {
  return Math.min(unitsLost(b, side), Math.round(sum(b.surrendered[side]) / (b.dpu || 1)));
}

const r1 = (n) => Math.round(n * 10) / 10;

/** A small copy of a battle for sending to browsers several times a second. */
function snapshot(b) {
  return {
    id: b.id,
    kind: b.kind,
    time: Math.round(b.time * 10) / 10,
    capture: Math.round(b.capture * 10) / 10,
    status: b.status,
    winner: b.winner,
    auto: b.auto,
    formation: b.formation,
    forms: { A: availableFormations(b, 'A'), D: availableFormations(b, 'D') },
    terr: territoryString(b),
    // Shells fired since the last snapshot (each is sent once, then forgotten)
    shots: (b.shots || []).splice(0).map((s) => [r1(s.x1), r1(s.y1), r1(s.x2), r1(s.y2), s.k]),
    dots: b.dots.map((d) => [
      d.id,
      d.side,
      d.type,
      Math.round(d.x * 10) / 10,
      Math.round(d.y * 10) / 10,
      Math.round((d.hp / d.max) * 100),
      d.cut ? 1 : 0,
      Math.round(d.tx * 10) / 10,
      Math.round(d.ty * 10) / 10,
      d.unit,
    ]),
  };
}

module.exports = {
  MAP_W,
  MAP_H,
  TCELL,
  SCELL,
  TYPES,
  FORMATIONS,
  FORMATION_IDS,
  createBattle,
  stepBattle,
  order,
  runAI,
  setFormation,
  availableFormations,
  survivors,
  unitsLost,
  unitsSurrendered,
  snapshot,
  territoryString,
  sum,
  makeTerrain,
  computeSupply,
};
