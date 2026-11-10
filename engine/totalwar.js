/**
 * TOTAL WAR — LIVE BATTLES
 * ========================
 * When an attack in Total War meets defenders, the two players fight a short
 * real-time battle on a small map. Every unit is a dot. Players tap their dots
 * and tap where to send them; the server moves everything a little every tick.
 *
 * What decides battles (all numbers are in config.js -> totalwar):
 *  - Unit types: militia (cheap), infantry (tough), cavalry (fast; rides down
 *    militia and ENCIRCLED infantry, but struggles against supplied infantry
 *    and in forests).
 *  - Terrain: forests and hills protect whoever stands in them; rivers are slow
 *    to cross except at fords.
 *  - FLANKING: a dot being hit from two different sides takes extra damage.
 *  - ENCIRCLEMENT: every half second we check which dots can still trace a path
 *    back to their own side's edge of the map without crossing ground the enemy
 *    controls. Dots that can't are CUT OFF: they take much more damage, deal
 *    less, and surrender if they stay cut off too long.
 *  - The attacker wins by holding the objective (the flag) with nobody
 *    defending it, or by destroying every defender. The defender wins by
 *    destroying the attackers or holding out until time runs out.
 *
 * This file only knows about battles. engine/war.js starts them and applies the
 * results to the board. stepBattle() changes a battle IN PLACE (it runs ten
 * times a second, so copying the whole game each time would be too slow).
 */
'use strict';

const MAP_W = 60;
const MAP_H = 40;
const TCELL = 4; // terrain cell size -> 15 x 10 terrain grid
const SCELL = 2; // supply cell size -> 30 x 20 supply grid
const CONTACT = 2.4; // dots this close fight each other
const ZOC = 4; // "zone of control" radius used for supply lines
const TYPES = ['militia', 'infantry', 'cavalry'];
const SIDES = ['A', 'D'];
const AI_EVERY = 1.2; // seconds between AI decisions
const IDLE_AUTO = 15; // a side that gives no order for this long is put on auto-battle

const sum = (c) => TYPES.reduce((a, k) => a + (c[k] || 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- map

/**
 * Terrain grid (rows of characters): '.' plain, 'f' forest, 'h' hill,
 * 'w' river, '=' ford. Built from the defended tile's biome (the right side,
 * around the objective) and the attacker's tile (the left side).
 */
function makeTerrain(defBiome, attBiome, rand) {
  const cols = MAP_W / TCELL;
  const rows = MAP_H / TCELL;
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
  if (ch === 'f') return type === 'cavalry' ? 0.45 : 0.7;
  if (ch === 'h') return 0.75;
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
 * Create a battle. aTroops / dTroops are { militia, infantry, cavalry }.
 * `rand` is the game's seeded random number function, so battles replay exactly.
 */
function createBattle({ id, tile, from, attacker, defender, aTroops, dTroops, cfg, rand }) {
  const b = {
    id,
    tile: tile.id,
    from: from.id,
    attacker,
    defender,
    terrain: makeTerrain(tile.biome, from.biome, rand),
    obj: { x: 47, y: 20, r: 5 },
    dots: [],
    time: 0,
    capture: 0,
    limit: cfg.battleSeconds,
    captureNeeded: cfg.captureSeconds,
    auto: { A: false, D: false },
    ordered: { A: false, D: false },
    ai: { A: 0, D: 0 },
    supplyTimer: 0,
    losses: { A: zero(), D: zero() },
    surrendered: { A: zero(), D: zero() },
    status: 'live',
    winner: null,
    reason: null,
  };
  let next = 1;
  const add = (side, seat, type, x, y) => {
    const hp = cfg[type].hp;
    b.dots.push({ id: next++, side, seat, type, x, y, tx: x, ty: y, hp, max: hp, cut: false, cutT: 0 });
  };
  // Attackers enter from the left edge in a column.
  const aList = TYPES.flatMap((t) => Array(aTroops[t] || 0).fill(t));
  aList.forEach((t, i) => add('A', attacker, t, 4 + (i % 2) * 2 + (t === 'cavalry' ? 2 : 0), MAP_H / 2 + (Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 3)));
  // Defenders: infantry on the flag, militia in front, cavalry in reserve behind.
  const dList = TYPES.flatMap((t) => Array(dTroops[t] || 0).fill(t));
  const counters = { militia: 0, infantry: 0, cavalry: 0 };
  for (const t of dList) {
    const k = counters[t]++;
    const spread = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * 3;
    const x = t === 'infantry' ? b.obj.x : t === 'militia' ? b.obj.x - 6 : b.obj.x + 6;
    add('D', defender, t, x, clamp(b.obj.y + spread, 2, MAP_H - 2));
  }
  for (const d of b.dots) {
    d.x = clamp(d.x, 1, MAP_W - 1);
    d.y = clamp(d.y, 1, MAP_H - 1);
    d.tx = d.x;
    d.ty = d.y;
  }
  computeSupply(b);
  return b;
}

function zero() {
  return { militia: 0, infantry: 0, cavalry: 0 };
}

// ---------------------------------------------------------------- orders

/** Send some of your dots to (x, y). */
function order(b, side, ids, x, y) {
  const tx = clamp(Number(x), 0.5, MAP_W - 0.5);
  const ty = clamp(Number(y), 0.5, MAP_H - 0.5);
  let moved = 0;
  for (const d of b.dots) {
    if (d.side !== side || !ids.includes(d.id)) continue;
    d.tx = tx;
    d.ty = ty;
    moved++;
  }
  b.ordered[side] = true;
  return moved;
}

// ---------------------------------------------------------------- supply lines

/**
 * Which dots are cut off? A supply cell belongs to whoever has the nearest dot
 * within ZOC. From each side's edge we flood out through cells the enemy doesn't
 * control; a dot whose cell can't be reached is cut off.
 */
function computeSupply(b) {
  const cols = MAP_W / SCELL;
  const rows = MAP_H / SCELL;
  const owner = new Array(cols * rows).fill(null);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const p = { x: (cx + 0.5) * SCELL, y: (cy + 0.5) * SCELL };
      let best = ZOC;
      for (const d of b.dots) {
        const dd = dist(d, p);
        if (dd < best) {
          best = dd;
          owner[cy * cols + cx] = d.side;
        }
      }
    }
  }
  for (const side of SIDES) {
    const enemy = side === 'A' ? 'D' : 'A';
    const seen = new Uint8Array(cols * rows);
    const queue = [];
    const edge = side === 'A' ? 0 : cols - 1; // attackers are supplied from the left, defenders from the right
    for (let cy = 0; cy < rows; cy++) {
      const i = cy * cols + edge;
      if (owner[i] !== enemy) {
        seen[i] = 1;
        queue.push(i);
      }
    }
    while (queue.length) {
      const i = queue.pop();
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (seen[j] || owner[j] === enemy) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    for (const d of b.dots) {
      if (d.side !== side) continue;
      const cx = clamp(Math.floor(d.x / SCELL), 0, cols - 1);
      const cy = clamp(Math.floor(d.y / SCELL), 0, rows - 1);
      d.cut = !seen[cy * cols + cx];
    }
  }
}

// ---------------------------------------------------------------- AI (bots and auto-battle)

function centroid(list) {
  return { x: list.reduce((a, d) => a + d.x, 0) / list.length, y: list.reduce((a, d) => a + d.y, 0) / list.length };
}

function runAI(b, side) {
  const mine = b.dots.filter((d) => d.side === side);
  const foes = b.dots.filter((d) => d.side !== side);
  if (!mine.length || !foes.length) return;
  const o = b.obj;
  const foeC = centroid(foes);
  const nearest = (d) => foes.reduce((a, f) => (dist(d, f) < dist(d, a) ? f : a));
  if (side === 'A') {
    // Foot soldiers march on the flag together; cavalry swings round a flank and hits from behind.
    const flankY = foeC.y > MAP_H / 2 ? 6 : MAP_H - 6;
    mine.forEach((d, i) => {
      if (d.type === 'cavalry') {
        const behind = { x: Math.min(MAP_W - 3, foeC.x + 8), y: flankY };
        const there = dist(d, behind) < 4 || d.x > foeC.x;
        const t = there ? nearest(d) : behind;
        d.tx = t.x;
        d.ty = t.y;
      } else {
        d.tx = o.x - 1 + (i % 3);
        d.ty = o.y + ((i % 5) - 2) * 1.5;
      }
    });
  } else {
    // Infantry hold the flag; militia meet attackers who come close; cavalry
    // rides behind the attackers to cut their supply line.
    const attackers = foes;
    const aC = centroid(attackers);
    mine.forEach((d, i) => {
      let t;
      if (d.type === 'infantry') t = { x: o.x + ((i % 3) - 1) * 1.5, y: o.y + ((i % 4) - 1.5) * 1.5 };
      else if (d.type === 'cavalry') {
        const rear = { x: Math.max(3, aC.x - 8), y: aC.y > MAP_H / 2 ? MAP_H - 5 : 5 };
        t = dist(d, rear) < 4 ? nearest(d) : rear;
      } else {
        const close = attackers.filter((a) => dist(a, o) < 16);
        t = close.length ? nearest(d) : { x: o.x - 6, y: o.y + ((i % 5) - 2) * 2.5 };
      }
      d.tx = t.x;
      d.ty = t.y;
    });
  }
}

// ---------------------------------------------------------------- the simulation

/**
 * Damage multiplier for unit-type matchups. Infantry hold firm against cavalry —
 * until they're encircled: then cavalry can ride them down.
 */
function matchup(att, def, cfg, defCut = false) {
  if (att === 'cavalry' && def === 'militia') return cfg.cavalryVsMilitiaPct / 100;
  if (att === 'cavalry' && def === 'infantry') return (defCut ? cfg.cavalryVsCutOffInfantryPct : cfg.cavalryVsInfantryPct) / 100;
  return 1;
}

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

/** Advance one battle by dt seconds. Returns true if it just ended. */
function stepBattle(b, dt, cfg) {
  if (b.status !== 'live') return false;
  b.time += dt;

  // Sides that never gave an order get the computer's help.
  for (const side of SIDES) {
    if (!b.ordered[side] && b.time > IDLE_AUTO) b.auto[side] = true;
    if (b.auto[side]) {
      b.ai[side] -= dt;
      if (b.ai[side] <= 0) {
        runAI(b, side);
        b.ai[side] = AI_EVERY;
      }
    }
  }

  // Who is in contact with whom
  const contact = new Map();
  for (const d of b.dots) contact.set(d, b.dots.filter((e) => e.side !== d.side && dist(d, e) <= CONTACT));

  // Movement: dots in contact can still move, but slowly.
  for (const d of b.dots) {
    const togo = Math.hypot(d.tx - d.x, d.ty - d.y);
    if (togo < 0.2) continue;
    const sp = cfg[d.type].speed * speedFactor(terrainAt(b, d.x, d.y), d.type) * (contact.get(d).length ? 0.35 : 1) * dt;
    const k = Math.min(1, sp / togo);
    d.x += (d.tx - d.x) * k;
    d.y += (d.ty - d.y) * k;
  }
  // Keep friendly dots from piling on top of each other.
  for (let i = 0; i < b.dots.length; i++) {
    for (let j = i + 1; j < b.dots.length; j++) {
      const a = b.dots[i];
      const c = b.dots[j];
      if (a.side !== c.side) continue;
      const dd = dist(a, c);
      if (dd > 0 && dd < 1.4) {
        const push = (1.4 - dd) / 2;
        const ux = (a.x - c.x) / dd;
        const uy = (a.y - c.y) / dd;
        a.x = clamp(a.x + ux * push, 0.5, MAP_W - 0.5);
        a.y = clamp(a.y + uy * push, 0.5, MAP_H - 0.5);
        c.x = clamp(c.x - ux * push, 0.5, MAP_W - 0.5);
        c.y = clamp(c.y - uy * push, 0.5, MAP_H - 0.5);
      }
    }
  }

  // Combat: every dot hits the nearest enemy in contact.
  const damage = new Map();
  for (const d of b.dots) {
    const foes = contact.get(d);
    if (!foes.length) continue;
    const target = foes.reduce((a, f) => (dist(d, f) < dist(d, a) ? f : a));
    let dmg = cfg[d.type].attack * matchup(d.type, target.type, cfg, target.cut) * dt;
    if (d.cut) dmg *= 0.75; // cut-off troops are low on supplies
    damage.set(target, (damage.get(target) || 0) + dmg);
  }
  for (const [t, dmg] of damage) {
    let mult = 1 / defenceFactor(terrainAt(b, t.x, t.y), cfg);
    if (t.cut) mult *= cfg.cutOffDamagePct / 100;
    if (flanked(t, contact.get(t))) mult *= cfg.flankDamagePct / 100;
    t.hp -= dmg * mult;
  }
  b.dots = b.dots.filter((d) => {
    if (d.hp > 0) return true;
    b.losses[d.side][d.type]++;
    return false;
  });

  // Supply lines and surrender
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

  // The objective
  const onFlag = (side) => b.dots.some((d) => d.side === side && dist(d, b.obj) <= b.obj.r);
  if (onFlag('A') && !onFlag('D')) b.capture += dt;
  else b.capture = Math.max(0, b.capture - dt * 0.5);

  // Has someone won?
  const left = (side) => b.dots.some((d) => d.side === side);
  if (!left('A')) return finish(b, 'D', left('D') ? 'the attack was destroyed' : 'both armies were destroyed');
  if (!left('D')) return finish(b, 'A', 'every defender fell');
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

/** Surviving troops per side, by type. */
function survivors(b, side) {
  const c = zero();
  for (const d of b.dots) if (d.side === side) c[d.type]++;
  return c;
}

/** A small copy of a battle for sending to browsers ten times a second. */
function snapshot(b) {
  return {
    id: b.id,
    time: Math.round(b.time * 10) / 10,
    capture: Math.round(b.capture * 10) / 10,
    status: b.status,
    winner: b.winner,
    auto: b.auto,
    dots: b.dots.map((d) => [d.id, d.side, d.type, Math.round(d.x * 10) / 10, Math.round(d.y * 10) / 10, Math.round((d.hp / d.max) * 100), d.cut ? 1 : 0, Math.round(d.tx * 10) / 10, Math.round(d.ty * 10) / 10]),
  };
}

module.exports = { MAP_W, MAP_H, TCELL, TYPES, createBattle, stepBattle, order, runAI, survivors, snapshot, sum, makeTerrain, computeSupply };
