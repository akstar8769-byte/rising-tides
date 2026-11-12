/**
 * BOTS — simple computer players, so you can test with fewer people.
 * ==================================================================
 * A bot only sees what a human in its seat would see (engine.viewFor), so it
 * can't peek at secret choices. Every time it's the bot's move, the server
 * calls decide() and applies the ONE action it returns, then asks again.
 *
 *   decide(view, memory) -> { action, key } or null
 *
 * `memory` is per bot: { personality, tried: Set, phaseKey, failures }.
 * `key` names the step; if the rules engine rejects an action, the server
 * adds its key to memory.tried so the bot moves on to its next idea.
 *
 * Personalities (change the numbers to make bots braver or more careful):
 */
'use strict';

const PERSONALITIES = {
  // wallMargin: how much protection to keep above the Flood they expect at the end
  // wallsPerRound: most walls built in one round (people save materials — they're points)
  // trust: chance to accept a pact/treaty; betray: chance to break a pact when a target is tempting
  // pactChance: chance per round to offer someone a pact
  cautious: { unsus: 0.1, raid: 0, attack: 0.1, army: 2, revolt: 0.1, donates: true, wallMargin: 2, wallsPerRound: 2, trust: 0.9, betray: 0.02, pactChance: 0.5 },
  balanced: { unsus: 0.35, raid: 0.15, attack: 0.4, army: 4, revolt: 0.3, donates: true, wallMargin: 0, wallsPerRound: 1, trust: 0.7, betray: 0.15, pactChance: 0.3 },
  warlike: { unsus: 0.5, raid: 0.45, attack: 0.8, army: 8, revolt: 0.6, donates: false, wallMargin: -1, wallsPerRound: 1, trust: 0.5, betray: 0.4, pactChance: 0.35 },
};
const PERSONALITY_ORDER = ['balanced', 'cautious', 'warlike', 'balanced'];
const BOT_NAMES = ['Bot Ada', 'Bot Bram', 'Bot Cleo', 'Bot Dax', 'Bot Eve'];

const MATS = ['wood', 'stone', 'sandbag'];
const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const total = (b) => (b ? b.wood + b.stone + b.sandbag : 0);
const empty = () => ({ wood: 0, stone: 0, sandbag: 0 });
const has = (have, need) => MATS.every((m) => have[m] >= need[m]);
const adjacent = (a, b) => DIRS.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
const unitsOn = (t, seat) => (t.units && t.units[seat]) || 0;
const chance = (p) => Math.random() < p;

function wallCost(g) {
  const b = g.settings.base;
  return { wood: b.wallCostWood, stone: b.wallCostStone, sandbag: b.wallCostSandbag };
}

/** Pick n materials (only from `allowed`), favouring what the next walls need. */
function pickMix(g, me, n, allowed = MATS) {
  const cost = wallCost(g);
  const planned = { ...me.materials };
  const mix = empty();
  for (let i = 0; i < n; i++) {
    const m = allowed.reduce((best, x) => (cost[x] * 2 - planned[x] > cost[best] * 2 - planned[best] ? x : best), allowed[0]);
    planned[m]++;
    mix[m]++;
  }
  return mix;
}

/** Take n tokens from `from`, the ones we need most first. */
function pickFrom(g, me, from, n) {
  const cost = wallCost(g);
  const left = { ...from };
  const take = empty();
  for (let i = 0; i < n; i++) {
    const options = MATS.filter((m) => left[m] > 0);
    if (!options.length) break;
    const m = options.reduce((best, x) => (cost[x] * 2 - me.materials[x] - take[x] > cost[best] * 2 - me.materials[best] - take[best] ? x : best), options[0]);
    left[m]--;
    take[m]++;
  }
  return take;
}

/**
 * Materials to keep for the start of next round: militia upkeep (after recruiting
 * `extraUnits` more) plus the garrison for our puppets. Spend nothing below this,
 * or puppets go free and units are disbanded.
 */
function reserve(g, me, extraUnits = 0) {
  if (!g.war) return 0;
  const upkeep = Math.floor((me.units + extraUnits) / g.settings.war.upkeepUnitsPerMaterial);
  return upkeep + (me.garrisonDue || 0);
}

/**
 * Total War: pick the best land unit we have unlocked and can afford. Warlike bots
 * like tanks and cavalry, balanced bots a mix with guns, cautious bots solid infantry
 * and anti-tank / anti-air. Militia when money is short.
 */
const UNIT_WISHES = {
  warlike: [['heavyTank', 'mediumTank', 'lightTank', 'cavalry'], ['bomber', 'interceptor'], ['mechanised', 'motorised', 'infantry'], ['spArtillery', 'artillery']],
  balanced: [['mediumTank', 'lightTank', 'cavalry'], ['mechanised', 'motorised', 'infantry'], ['bomber', 'interceptor'], ['spArtillery', 'artillery', 'antitank']],
  cautious: [['mechanised', 'motorised', 'infantry'], ['antitank', 'antiair'], ['interceptor', 'mediumTank', 'lightTank'], ['spArtillery', 'artillery']],
};
/**
 * The unit type to recruit now, or null to save up for it. Picks a group (mostly the
 * first, sometimes another, so armies are mixed) and wants the best unlocked type in it.
 * With a small army we take what we can afford; once we have a few units we save
 * for the good stuff instead of filling up on militia.
 */
function pickUnitType(g, me, P, roll = Math.random()) {
  const unit = (t) => g.tw.units.find((u) => u.type === t);
  const budget = total(me.materials) - reserve(g, me, 1);
  const name = P === PERSONALITIES.warlike ? 'warlike' : P === PERSONALITIES.balanced ? 'balanced' : 'cautious';
  const groups = UNIT_WISHES[name];
  const r = roll;
  const order = r < 0.45 ? [0, 1, 2, 3] : r < 0.75 ? [1, 0, 2, 3] : r < 0.9 ? [2, 0, 1, 3] : [3, 0, 1, 2];
  const unlocked = (t) => unit(t) && unit(t).unlocked;
  let want = null;
  for (const gi of order) {
    want = groups[gi].find(unlocked);
    if (want) break;
  }
  if (want && budget >= unit(want).cost) return want;
  if (me.units >= 4 && want && unit(want).cost > unit('infantry').cost) return null; // save up for it
  for (const gi of order) for (const t of groups[gi]) if (unlocked(t) && budget >= unit(t).cost) return t;
  return budget >= unit('infantry').cost ? 'infantry' : 'militia';
}

/** Total War research plans, in order, by personality. */
const RESEARCH_PLAN = {
  warlike: ['artillery', 'lightTanks', 'mediumTanks', 'aircraft', 'motorised', 'heavyTanks', 'selfPropelled', 'mechanised', 'antiAir', 'shipyards'],
  balanced: ['artillery', 'motorised', 'lightTanks', 'mediumTanks', 'aircraft', 'selfPropelled', 'mechanised', 'antiTank', 'antiAir', 'heavyTanks'],
  cautious: ['motorised', 'antiTank', 'artillery', 'lightTanks', 'aircraft', 'mechanised', 'antiAir', 'mediumTanks', 'selfPropelled'],
};
function researchIdea(g, me, P) {
  if (!me.research || me.research.current) return null;
  const name = P === PERSONALITIES.warlike ? 'warlike' : P === PERSONALITIES.balanced ? 'balanced' : 'cautious';
  const done = new Set(me.research.done);
  const avail = (t) => t && !done.has(t.id) && t.needs.every((x) => done.has(x));
  let plan = RESEARCH_PLAN[name];
  // Ocean boards: with enemies across the sea, a navy comes early.
  if (overseas(g)) plan = [plan[0], 'shipyards', ...plan.slice(1, 3), 'cruisers', ...plan.slice(3)];
  let tech = plan.map((id) => g.tw.techs.find((t) => t.id === id)).find(avail);
  // Unit levels: improve the type we field the most (once we have a few of them),
  // sometimes ahead of the next new technology, always once the plan is finished.
  const owned = {};
  for (const t of g.board.tiles) for (const [k, n] of Object.entries((t.troops || {})[g.you] || {})) owned[k] = (owned[k] || 0) + n;
  const lvTech = Object.entries(owned)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => g.tw.techs.find((t) => t.level && t.level.type === k && avail(t)))
    .find(Boolean);
  if (lvTech && (!tech || (done.size >= 3 && chance(0.4)))) tech = lvTech;
  if (!tech) return null;
  // Keep a real army: after the first tech, research only with a few units in the field.
  if (done.size >= 1 && me.units < Math.min(P.army, 4)) return null;
  // Research comes first in Total War: keep only a little back for upkeep.
  if (total(me.materials) - tech.cost < reserve(g, me) + 1) return null;
  return { key: `research-${tech.id}`, action: { type: 'research', tech: tech.id, materials: payFromLargest(me, tech.cost) } };
}

/**
 * Total War: upgrade old units on our tiles to the best type we have unlocked
 * (infantry to mechanised, light tanks to heavy...). One unit at a time.
 */
function upgradeIdea(g, me, P) {
  const unit = (t) => g.tw.units.find((u) => u.type === t);
  // Build up numbers first: only upgrade once the army is a decent size.
  if (me.units < 3) return null;
  const spare = total(me.materials) - reserve(g, me) - 1;
  const owned = {};
  for (const t of g.board.tiles) for (const [k, n] of Object.entries((t.troops || {})[g.you] || {})) owned[k] = (owned[k] || 0) + n;
  for (const t of g.board.tiles) {
    if (t.controller !== g.you) continue;
    const here = (t.troops || {})[g.you] || {};
    for (const [from, n] of Object.entries(here)) {
      if (!n) continue;
      // Walk up the upgrade chain and take the highest unlocked step we can pay for.
      let best = null;
      for (const u of g.tw.units) {
        if (!u.unlocked || u.domain !== unit(from).domain) continue;
        let k = u.type;
        const seen = new Set();
        let ok = false;
        while (unit(k) && unit(k).from && !seen.has(k)) {
          seen.add(k);
          if (unit(k).from === from) { ok = true; break; }
          k = unit(k).from;
        }
        if (!ok) continue;
        // Militia make cheap anti-tank / anti-air squads, but only a few of each.
        if (from === 'militia' && (owned[u.type] || 0) >= 3) continue;
        const each = Math.max(1, u.cost - unit(from).cost);
        if (each > spare) continue;
        if (!best || u.cost > best.u.cost) best = { u, each };
      }
      if (best) return { key: `upgrade-${g.round}-${t.id}-${from}-${n}`, action: { type: 'upgradeUnits', tile: t.id, from, to: best.u.type, count: 1, materials: payFromLargest(me, best.each) } };
    }
  }
  return null;
}

/** Total War: now and then launch a ship into a bay next to our coast. */
function shipIdea(g, me, P) {
  if (g.board.seaLanes) return oceanShipIdea(g, me, P);
  if (P === PERSONALITIES.cautious || !g.tw.seas || !g.tw.seas.length || me.units < 6 || !chance(0.12)) return null;
  const t = ['battleship', 'cruiser', 'destroyer'].map((k) => g.tw.units.find((u) => u.type === k)).find((u) => u.unlocked && total(me.materials) - u.cost >= reserve(g, me, 1) + 2);
  if (!t) return null;
  return { key: `ship-${g.round}`, action: { type: 'recruit', count: 1, unit: t.type, tile: g.tw.seas[0], materials: payFromLargest(me, t.cost) } };
}

// ---------------------------------------------------------------- ocean boards (sea lanes)
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
const ships = (g) => g.board.tiles.filter((t) => t.kind === 'sea' && t.controller === g.you);
const fleetSize = (g) => ships(g).reduce((a, t) => a + unitsOn(t, g.you), 0);

/** Land tiles joined to this one by land. */
function landmass(g, start) {
  const seen = new Set([start.id]);
  const queue = [start];
  while (queue.length) {
    const t = queue.shift();
    for (const n of g.board.tiles) if (n.kind === 'land' && !seen.has(n.id) && adjacent(t, n)) { seen.add(n.id); queue.push(n); }
  }
  return seen;
}
/** Ocean board where some rival's capital is on another continent. */
function overseas(g) {
  if (!g.board.seaLanes) return false;
  const home = g.board.tiles.find((t) => t.id === g.players[g.you].homeTile);
  if (!home) return false;
  const mine = landmass(g, home);
  return g.players.some((p) => p.seat !== g.you && !mine.has(p.homeTile));
}

/** Ocean boards: keep a fleet that grows with the game (fishing, then invasions). */
function oceanShipIdea(g, me, P) {
  if (!g.tw.seas || !g.tw.seas.length || me.units < 3) return null;
  const want = (P === PERSONALITIES.cautious ? 2 : overseas(g) ? 3 : 2) + Math.floor(g.round / (P === PERSONALITIES.warlike ? 3 : 4));
  if (fleetSize(g) >= want || !chance(P === PERSONALITIES.cautious ? 0.3 : 0.55)) return null;
  const t = ['battleship', 'cruiser', 'destroyer'].map((k) => g.tw.units.find((u) => u.type === k)).find((u) => u && u.unlocked && total(me.materials) - u.cost >= reserve(g, me, 1));
  if (!t) return null;
  // Launch next to the fleet if we have one, so the chain stays joined.
  const fleet = ships(g);
  const tile = g.tw.seas.find((id) => fleet.some((f) => f.id === id)) || g.tw.seas[0];
  return { key: `ship-${g.round}-${fleetSize(g)}`, action: { type: 'recruit', count: 1, unit: t.type, tile, materials: payFromLargest(me, t.cost) } };
}

/**
 * Ocean boards: spread the fleet one hex at a time. Take fishing grounds first, then
 * stretch a chain of ships toward the nearest enemy coast so troops can cross.
 */
function fleetMoveIdea(g, me, P) {
  if (!g.board.seaLanes) return null;
  const fleet = ships(g);
  const stack = fleet.filter((t) => unitsOn(t, g.you) >= 2).sort((a, b) => unitsOn(b, g.you) - unitsOn(a, g.you))[0];
  if (!stack) return null;
  const free = g.board.tiles.filter((t) => t.kind === 'sea' && t.controller == null && fleet.some((f) => adjacent(f, t)));
  if (!free.length) return null;
  const home = g.board.tiles.find((t) => t.id === me.homeTile);
  const mine = home ? landmass(g, home) : new Set();
  const enemyCoast = g.board.tiles.filter((t) => t.kind === 'land' && t.controller != null && t.controller !== g.you && !mine.has(t.id) && g.board.tiles.some((x) => x.kind === 'sea' && adjacent(x, t)));
  const score = (t) => (t.fish ? 10 : 0) - (enemyCoast.length ? Math.min(...enemyCoast.map((c) => hexDist(c, t))) : 0);
  const to = free.sort((a, b) => score(b) - score(a))[0];
  const troops = { ...((stack.troops || {})[g.you] || {}) };
  // Move the cheapest ship, keep the big ones where they are.
  const type = ['destroyer', 'cruiser', 'battleship'].find((k) => troops[k] > 0);
  if (!type) return null;
  return { key: `fleet-${g.round}-${stack.id}-${to.id}`, action: { type: 'moveUnits', from: stack.id, to: to.id, count: 1, troops: { [type]: 1 } } };
}

/** Shell an enemy coast from our cruisers / battleships: the most units there, from players we'd hit. */
function bombardIdea(g, me, P) {
  const opts = Object.entries(g.bombardTargets || {});
  if (!opts.length || P === PERSONALITIES.cautious) return null;
  let best = null;
  for (const [from, list] of opts) {
    for (const id of list) {
      const t = g.board.tiles.find((x) => x.id === id);
      if (!willHit(g, t.controller, P) || g.limits.protectedSeats[t.controller]) continue;
      const n = unitsOn(t, t.controller);
      if (!best || n > best.n) best = { from, id, n };
    }
  }
  if (!best || !best.n) return null;
  return { key: `bombard-${g.round}-${best.from}`, action: { type: 'bombard', from: best.from, target: best.id } };
}

/**
 * Factories (Base). Cautious bots only build sustainable ones; balanced bots build a dirty
 * one now and then while the Flood is low; warlike bots like cheap dirty factories.
 * Everyone but warlike bots demolishes a dirty factory when the Flood gets close.
 */
function factoryIdea(g, me, P, mem) {
  const b = g.settings.base;
  const F = g.factories;
  const danger = g.threshold - g.flood;
  const mineDirty = F.mine.filter((x) => x.kind === 'unsustainable');
  if (mineDirty.length && (danger <= 2 || (P !== PERSONALITIES.warlike && (danger <= 3 || floodDanger(g, me))))) {
    return { key: `demolish-${mineDirty[0].tile}-${g.round}`, action: { type: 'demolishFactory', tile: mineDirty[0].tile } };
  }
  if (mem.factoryRound === g.round || !F.sites.length) return null;
  const cost = (k) => (k === 'sustainable' ? { wood: b.factorySusWood, stone: b.factorySusStone, sandbag: b.factorySusSandbag } : { wood: b.factoryUnsWood, stone: b.factoryUnsStone, sandbag: b.factoryUnsSandbag });
  const affordable = (k) => has(me.materials, cost(k)) && total(me.materials) - total(cost(k)) >= reserve(g, me);
  const dirtyOk = !g.limits.noUnsustainable && mineDirty.length < F.unsMax && danger > (P === PERSONALITIES.warlike ? 3 : P === PERSONALITIES.balanced ? 5 : 99);
  let kind = null;
  if (dirtyOk && affordable('unsustainable') && (!affordable('sustainable') || chance(P.unsus))) kind = 'unsustainable';
  else if (affordable('sustainable')) kind = 'sustainable';
  if (!kind) return null;
  // Build where the resource we have least of comes from.
  const res = (id) => {
    const t = g.board.tiles.find((x) => x.id === id);
    return t.biome === 'forest' ? 'wood' : t.biome === 'quarry' ? 'stone' : t.biome === 'riverbank' ? 'sandbag' : null;
  };
  const site = F.sites.slice().sort((a, c) => (me.materials[res(a)] ?? 0) - (me.materials[res(c)] ?? 0))[0];
  mem.factoryRound = g.round;
  return { key: `factory-${site}`, action: { type: 'buildFactory', tile: site, kind } };
}

/** Pay n materials from the biggest piles. */
function payFromLargest(me, n) {
  const left = { ...me.materials };
  const pay = empty();
  for (let i = 0; i < n; i++) {
    const m = MATS.reduce((best, x) => (left[x] > left[best] ? x : best), MATS[0]);
    if (left[m] <= 0) break;
    left[m]--;
    pay[m]++;
  }
  return pay;
}

function decide(g, mem) {
  const me = g.players[g.you];
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  const phaseKey = `${g.round}-${g.phase}`;
  if (mem.phaseKey !== phaseKey) {
    mem.phaseKey = phaseKey;
    mem.tried = new Set();
    mem.failures = 0;
  }
  const fresh = (key) => !mem.tried.has(key);

  if (g.phase === 'loot') {
    const L = g.pendingLoot;
    if (!L || L.raider !== g.you) return null;
    const from = g.players[L.target].materials || { wood: 99, stone: 99, sandbag: 99 };
    return { key: 'loot', action: { type: 'pickLoot', materials: pickFrom(g, me, from, L.count) } };
  }
  if (g.phase === 'talk' || g.phase === 'trade') return buildStep(g, me, P, mem, fresh);
  if (g.phase === 'choose' && !me.choice) return chooseStep(g, me, P, fresh);
  return null;
}

// ---------------------------------------------------------------- Talk & Build
function buildStep(g, me, P, mem, fresh) {
  const cost = wallCost(g);
  const danger = g.threshold - g.flood;

  // 1. Answer trade offers: accept if we can pay and we get at least as much as we give.
  for (const t of g.trades.filter((x) => x.to === g.you)) {
    const key = `trade-${t.id}`;
    if (!fresh(key)) continue;
    const fair = total(t.give) >= total(t.get) && has(me.materials, t.get) && !me.sanctioned;
    return { key, action: { type: fair ? 'acceptTrade' : 'rejectTrade', id: t.id } };
  }
  // 1b. Diplomacy: answer pact offers and treaty invitations.
  const d = diplomacyStep(g, me, P, mem, fresh);
  if (d) return d;
  if (me.ready) return null; // already done building this phase

  // 1c. Total War: research first, then upgrade old units — that's what wins wars.
  if (g.tw && g.war) {
    const r = researchIdea(g, me, P);
    if (r && fresh(r.key)) return r;
    const up = upgradeIdea(g, me, P);
    if (up && fresh(up.key)) return up;
  }

  // 2. Build a wall only if we expect to need it by the end of the game, at most a
  //    couple per round — spare materials are points, so bots save like people do.
  if (mem.wallRound !== g.round) {
    mem.wallRound = g.round;
    mem.wallsThisRound = 0;
  }
  const wallKey = `wall-${me.walls}`;
  if ((!g.tw || floodDanger(g, me)) && has(me.materials, cost) && total(me.materials) - total(cost) >= reserve(g, me) && fresh(wallKey) && mem.wallsThisRound < P.wallsPerRound && me.protection < wallTarget(g, P)) {
    mem.wallsThisRound++;
    return { key: wallKey, action: { type: 'buildWall', count: 1 } };
  }

  // 2b. Factories (Base): build one a round when we can spare it; tear down dirty ones when the Flood is close.
  if (g.factories) {
    const f = factoryIdea(g, me, P, mem);
    if (f && fresh(f.key)) return f;
  }

  if (g.war) {
    const w = g.settings.war;
    // 3. Recruit up to the personality's army size — but walls come first unless warlike,
    //    and cautious/balanced bots stay under the army-emissions limit.
    let target = g.tw ? P.army * 2 + 6 : P.army;
    // Big armies pollute (army emissions). Careful bots always stay under that size;
    // warlike bots too once the Flood is getting high or their own home is at risk.
    const armyPollutes = w.armyFloodPerUnits > 0 && (P !== PERSONALITIES.warlike || g.threshold - g.flood <= 8 || floodDanger(g, me));
    if (armyPollutes) target = Math.min(target, w.armyFloodPerUnits - 1);
    const wallsOk = g.tw || me.protection >= g.flood + 1 || P === PERSONALITIES.warlike;
    // Total War: pick a unit type that suits the personality and the budget.
    if (g.tw) {
      const sh = shipIdea(g, me, P);
      if (sh && fresh(sh.key)) return sh;
    }
    // One dice roll per unit bought, so a decision to save up sticks for the round.
    const rollKey = `${g.round}-${me.units}`;
    if (mem.rollKey !== rollKey) {
      mem.rollKey = rollKey;
      mem.roll = Math.random();
    }
    const unit = g.tw ? pickUnitType(g, me, P, mem.roll) : 'militia';
    const unitCost = !unit ? Infinity : g.tw ? g.tw.units.find((u) => u.type === unit).cost : w.unitCost;
    if (unit && me.units < target && wallsOk && total(me.materials) - unitCost >= reserve(g, me, 1) && fresh(`recruit-${me.units}`)) {
      const action = { type: 'recruit', count: 1, materials: payFromLargest(me, unitCost) };
      if (g.tw) action.unit = unit;
      if (g.stationed) action.tile = frontier(g).find((id) => g.board.tiles.find((t) => t.id === id).kind === 'land') || me.homeTile;
      return { key: `recruit-${me.units}`, action };
    }
    // 4. Stationed units: put units where they're useful.
    if (g.stationed) {
      const mv = moveIdea(g, me, P);
      if (mv && fresh(mv.key)) return mv;
      const fm = g.tw ? fleetMoveIdea(g, me, P) : null;
      if (fm && fresh(fm.key)) return fm;
      const bb = g.tw ? bombardIdea(g, me, P) : null;
      if (bb && fresh(bb.key)) return bb;
    }
    // 5. Overlords give their puppets orders.
    for (const q of me.puppets || []) {
      const want = P === PERSONALITIES.cautious ? 'sustainable' : 'unsustainable';
      const cur = g.players[q].command;
      if ((!cur || cur.action !== want) && fresh(`cmd-${q}`)) return { key: `cmd-${q}`, action: { type: 'setCommand', puppet: q, action: want } };
    }
  }

  // 6. Market: swap a big pile for what the next wall needs.
  if (!me.sanctioned && fresh('market')) {
    const b = g.settings.base;
    const need = MATS.filter((m) => me.materials[m] < cost[m]);
    const spare = MATS.filter((m) => me.materials[m] >= b.marketGive + cost[m]);
    if (need.length && spare.length && total(me.materials) - b.marketGive + b.marketGet >= reserve(g, me)) return { key: 'market', action: { type: 'market', give: spare[0], get: need[0] } };
  }

  // 6b. Offer a trade to someone who has what we need.
  const offer = tradeOffer(g, me, fresh);
  if (offer) return offer;

  // 7. When the Flood is getting close, careful bots chip in to the seawall.
  if (P.donates && danger <= 4 && g.seawallBonus < g.settings.base.seawallMaxSteps && total(me.materials) - 2 >= reserve(g, me) + 4 && fresh('donate')) {
    return { key: 'donate', action: { type: 'donate', materials: payFromLargest(me, 2) } };
  }

  // 8. Done.
  if (fresh('ready')) return { key: 'ready', action: { type: 'ready' } };
  return null;
}

/**
 * The protection this bot wants: the Flood it expects at the end of the game
 * (current Flood + the average rise per round so far x rounds left), plus its margin.
 * In the last round that's just "enough to survive right now".
 */
function wallTarget(g, P) {
  const rounds = g.mode === 'base' ? g.settings.base.rounds : g.settings.war.rounds;
  const done = Math.max(1, g.round - (g.phase === 'talk' ? 1 : 0)); // rounds whose Flood we've seen
  const start = g.mode === 'base' ? g.settings.base.startingFlood : g.settings.general.startingFlood;
  const rate = Math.max(0.5, (g.flood - start) / done);
  const left = Math.max(0, rounds - g.round + (g.phase === 'talk' ? 1 : 0));
  const expected = g.flood + Math.ceil(rate * left);
  if (left === 0) return g.flood; // last chance: only build what keeps the home dry
  return Math.min(expected + P.wallMargin, g.threshold); // no point beyond the catastrophe line
}

/** My tiles that touch someone else's (or open) land, most exposed first. */
function frontier(g) {
  const land = g.board.tiles.filter((t) => t.kind === 'land');
  return land
    .filter((t) => t.controller === g.you)
    .map((t) => ({ t, threat: land.filter((o) => adjacent(o, t) && o.controller !== g.you).length }))
    .filter((x) => x.threat > 0)
    .sort((a, b) => b.threat - a.threat)
    .map((x) => x.t.id);
}

/** Move one batch of units: fill empty frontier tiles, then push spare units forward. */
function moveIdea(g, me, P) {
  const stand = new Set(g.standTiles || []);
  const mine = g.board.tiles.filter((t) => stand.has(t.id) && t.controller === g.you);
  const front = frontier(g);
  const withUnits = mine.filter((t) => unitsOn(t, g.you) > 0).sort((a, b) => unitsOn(b, g.you) - unitsOn(a, g.you));
  if (!withUnits.length) return null;
  const big = withUnits[0];
  // Cautious and balanced bots make sure no frontier tile is empty.
  if (P !== PERSONALITIES.warlike) {
    const emptyFront = front.find((id) => unitsOn(g.board.tiles.find((t) => t.id === id), g.you) === 0);
    if (emptyFront && unitsOn(big, g.you) >= 2) return { key: `move-${big.id}-${emptyFront}`, action: { type: 'moveUnits', from: big.id, to: emptyFront, count: 1 } };
  }
  // Push spare units from the capital to the most exposed frontier tile.
  const cap = g.board.tiles.find((t) => t.id === me.homeTile);
  const dest = front.find((id) => id !== cap.id);
  const spare = unitsOn(cap, g.you) - (P === PERSONALITIES.warlike ? 0 : 1);
  if (dest && spare > 0) return { key: `move-${cap.id}-${dest}`, action: { type: 'moveUnits', from: cap.id, to: dest, count: spare } };
  return null;
}

// ---------------------------------------------------------------- Choose secretly
function chooseStep(g, me, P, fresh) {
  const danger = g.threshold - g.flood;
  const ideas = g.war ? warIdeas(g, me, P, danger) : baseIdeas(g, me, P, danger);
  for (const idea of ideas) if (fresh(idea.key)) return idea;
  return null;
}

function baseIdeas(g, me, P, danger) {
  const b = g.settings.base;
  const ideas = [];
  const sustainable = { key: 'sus', action: { type: 'choose', action: 'sustainable' } };
  if (me.biome === 'mixed') sustainable.action.mix = pickMix(g, me, b.sustainableCollect);
  if (g.factories && me.materials.wood >= b.claimCostWood + 1 && chance(P.raid + 0.1) && !g.limits.noAttacks) {
    // Claim a factory: prefer unsustainable ones (they make more) of players we're willing to hit.
    const t = g.factories.claimTargets
      .map((id) => g.board.tiles.find((x) => x.id === id))
      .filter((x) => !g.limits.protectedSeats[x.factory.owner] && willHit(g, x.factory.owner, P))
      .sort((a, c) => (c.factory.kind === 'unsustainable') - (a.factory.kind === 'unsustainable'))[0];
    if (t) ideas.push({ key: 'claim', action: { type: 'choose', action: 'claim', target: t.id } });
  }
  if (!g.factories && me.materials.wood >= b.raidCostWood + 1 && chance(P.raid) && !g.limits.noAttacks) {
    const target = g.players
      .filter((p) => p.seat !== g.you && !g.limits.protectedSeats[p.seat] && willHit(g, p.seat, P))
      .sort((a, c) => raidValue(g, c) - raidValue(g, a))[0];
    if (target && target.materialTotal >= 3) ideas.push({ key: 'raid', action: { type: 'choose', action: 'raid', target: target.seat } });
  }
  if (danger > (P === PERSONALITIES.cautious ? 5 : 3) && chance(P.unsus) && !g.limits.noUnsustainable && !floodDanger(g, me)) {
    ideas.push({ key: 'unsus', action: { type: 'choose', action: 'unsustainable', mix: pickMix(g, me, b.unsustainableCollect) } });
  }
  ideas.push(sustainable);
  return ideas;
}

function warIdeas(g, me, P, danger) {
  const prod = me.production;
  const dev = (action) => {
    const a = { type: 'choose', action };
    a.mix = action === 'sustainable' ? pickMix(g, me, prod.free, prod.allowed) : pickMix(g, me, prod.unsustainable);
    if (me.aidEligible) a.aid = MATS.reduce((best, m) => (me.materials[m] < me.materials[best] ? m : best), MATS[0]);
    return { key: action, action: a };
  };
  const best = (list) => (list || []).reduce((a, x) => (!a || x.units > a.units ? x : a), null);
  const ideas = [];

  // Puppets: obey, or sometimes revolt.
  if (me.puppetOf != null) {
    const src = g.stationed ? best(g.revoltSources) : null;
    if ((g.stationed ? src : me.units >= 1) && chance(P.revolt) && !g.limits.noAttacks && !g.limits.protectedSeats[me.puppetOf]) {
      ideas.push({ key: 'revolt', action: { type: 'choose', action: 'revolt', ...(src ? { from: src.tile, count: src.units } : {}) } });
    }
    const cmd = me.effectiveCommand;
    if (cmd.action === 'attack') {
      const s = g.stationed ? best(g.attackSources[cmd.target]) : null;
      ideas.push({ key: 'obey', action: { type: 'choose', action: 'attack', target: cmd.target, ...(s ? { from: s.tile, count: s.units } : {}) } });
    } else ideas.push(dev(cmd.action));
    return ideas;
  }

  // Free players: attack a good target if feeling brave and the planet can take it.
  if (danger > (P === PERSONALITIES.warlike ? 2 : 4) && chance(P.attack) && !g.limits.noAttacks) {
    const target = pickTarget(g, me, P);
    if (target) ideas.push(target);
  }
  // Total War's Flood line is far away, so Unsustainable (much more income) is usually worth it.
  const unsus = g.tw && danger > 8 ? Math.min(0.9, P.unsus + 0.45) : P.unsus;
  if (danger > (P === PERSONALITIES.cautious ? 6 : 4) && chance(unsus) && !g.limits.noUnsustainable && !floodDanger(g, me)) ideas.push(dev('unsustainable'));
  ideas.push(dev('sustainable'));
  return ideas;
}

/** Score possible attacks; only take ones we expect to win. */
function pickTarget(g, me, P) {
  let bestIdea = null;
  let bestScore = 0;
  for (const id of g.attackTargets) {
    const t = g.board.tiles.find((x) => x.id === id);
    let sent;
    let from = null;
    let defenders;
    if (g.stationed) {
      const srcs = g.attackSources[id] || [];
      if (!srcs.length) continue;
      const s = srcs.reduce((a, x) => (x.units > a.units ? x : a));
      from = s.tile;
      sent = s.units;
      defenders = Object.values(t.units || {}).reduce((a, n) => a + n, 0);
    } else {
      sent = me.units + (me.puppets || []).reduce((a, q) => a + g.players[q].units, 0);
      defenders = t.controller != null ? g.players[t.controller].units : 0;
    }
    if (sent < 1) continue;
    if (t.controller != null && (g.limits.protectedSeats[t.controller] || !willHit(g, t.controller, P))) continue;
    let score;
    if (t.controller == null) score = 2; // open tile: free claim
    else if (t.owner === g.you) score = sent >= defenders ? 5 : 0; // take back our land
    else if (sent > defenders || defenders === 0) score = 3 + (t.role === 'capital' ? 2 : 0);
    else score = P === PERSONALITIES.warlike && sent === defenders ? 1 : 0;
    if (score && t.controller != null) score += grudge(g, t.controller); // pay back those who hit us
    if (score && t.controller != null && allianceEnemies(g).includes(t.controller)) score += 2; // our alliance's target
    if (score > bestScore) {
      bestScore = score;
      const troops = g.tw && from ? { ...((g.board.tiles.find((x) => x.id === from).troops || {})[g.you] || {}) } : null;
      bestIdea = { key: `attack-${id}`, action: { type: 'choose', action: 'attack', target: id, ...(from ? { from, count: sent } : {}), ...(troops && Object.keys(troops).length ? { troops } : {}) } };
    }
  }
  return bestIdea;
}

// ---------------------------------------------------------------- diplomacy

/** How many times this player has raided/attacked us. */
function grudge(g, seat) {
  return (g.players[g.you].hits || {})[seat] || 0;
}
function pactWith(g, seat) {
  return (g.pacts || []).find((p) => p.status === 'active' && ((p.a === g.you && p.b === seat) || (p.b === g.you && p.a === seat)));
}
/** Would we hit this player? Pact partners only if we decide to betray them. */
function willHit(g, seat, P) {
  return !pactWith(g, seat) || chance(P.betray);
}
/** Do we trust this player? Betrayers and people who hit us are trusted less. */
function trusts(g, seat, P) {
  const p = g.players[seat];
  const doubt = (p.betrayals || 0) * 0.4 + (p.treatyBreaks || 0) * 0.3 + grudge(g, seat) * 0.3;
  return chance(Math.max(0, P.trust - doubt));
}

function diplomacyStep(g, me, P, mem, fresh) {
  const gen = g.settings.general;
  const name = (seat) => g.players[seat].name;

  // Answer pact offers made to us.
  for (const p of (g.pacts || []).filter((x) => x.status === 'proposed' && x.b === g.you)) {
    const key = `pact-${p.id}`;
    if (!fresh(key)) continue;
    // Warlike bots like alliances against someone; everyone prefers people they trust.
    const accept = trusts(g, p.a, P) && !(p.kind === 'alliance' && p.enemy != null && pactWith(g, p.enemy));
    return {
      key,
      action: { type: 'respondPact', id: p.id, accept },
      say: accept ? pick([`Deal, ${name(p.a)}.`, `Agreed — ${p.rounds} round${p.rounds === 1 ? '' : 's'} of peace.`, `Fine by me, ${name(p.a)}.`]) : pick([`No thanks, ${name(p.a)}.`, `I don't trust you, ${name(p.a)}.`]),
    };
  }

  // Answer treaty invitations.
  for (const t of (g.treaties || []).filter((x) => x.invited.includes(g.you) && ![...x.signed, ...x.declined, ...x.broken].includes(g.you))) {
    const key = `treaty-${t.id}`;
    if (!fresh(key)) continue;
    const verdict = judgeTreaty(g, me, P, t);
    return {
      key,
      action: { type: verdict.sign ? 'signTreaty' : 'declineTreaty', id: t.id },
      say: verdict.say,
    };
  }

  // Warlike bots tear up an army-limit treaty only when a real conquest is on offer.
  if (g.limits.maxUnits && P === PERSONALITIES.warlike && me.units >= g.limits.maxUnits.n && expansionPlans(g, me).length && !floodDanger(g, me) && chance(0.5)) {
    const t = (g.treaties || []).find((x) => x.name === g.limits.maxUnits.name && x.signed.includes(g.you));
    if (t && fresh(`break-${t.id}`)) return { key: `break-${t.id}`, action: { type: 'breakTreaty', id: t.id }, say: `"${t.name}" is over for me.` };
  }

  if (me.ready || g.phase !== 'talk') return null;

  // Offer a pact (at most one a round).
  if (gen.pactsEnabled && fresh('offer-pact') && chance(P.pactChance)) {
    mem.tried.add('offer-pact');
    mem.asked = mem.asked || {}; // seat -> round we last offered them a pact
    const others = g.players.filter((p) => p.seat !== g.you && !(mem.asked[p.seat] > g.round - 3) && !pactWith(g, p.seat) && !(g.pacts || []).some((x) => x.status === 'proposed' && (x.a === g.you || x.b === g.you) && (x.a === p.seat || x.b === p.seat)));
    const strength = (p) => (p.units || 0) * 2 + (p.materialTotal || 0);
    if (others.length) {
      if (P === PERSONALITIES.warlike && g.players.length >= 3) {
        // Ally with someone against the strongest player.
        const enemy = g.players.filter((p) => p.seat !== g.you).sort((a, b) => strength(b) - strength(a))[0];
        const ally = others.filter((p) => p.seat !== enemy.seat && grudge(g, p.seat) === 0)[0];
        if (ally) {
          mem.asked[ally.seat] = g.round;
          return {
            key: 'offer-pact',
            action: { type: 'proposePact', to: ally.seat, kind: 'alliance', enemy: enemy.seat, rounds: 2 },
            say: pick([`${ally.name}, join me against ${enemy.name}?`, `${enemy.name} is getting too strong. Alliance, ${ally.name}?`, null]),
          };
        }
      } else {
        // Peace with the most dangerous neighbour we don't hold a grudge against.
        const partner = others.filter((p) => grudge(g, p.seat) === 0).sort((a, b) => strength(b) - strength(a))[0];
        if (partner) {
          mem.asked[partner.seat] = g.round;
          return {
            key: 'offer-pact',
            action: { type: 'proposePact', to: partner.seat, kind: 'peace', rounds: Math.min(2, gen.maxPactRounds) },
            say: pick([`${partner.name}, how about a truce for a couple of rounds?`, `Peace, ${partner.name}? Check your Trade tab.`, `I'd rather build walls than fight you, ${partner.name}.`, null, null]),
          };
        }
      }
    }
  }

  // Propose a green treaty when the Flood is getting dangerous (once a game). Cautious bots
  // do it early; others when their own home is at risk too.
  const danger = g.threshold - g.flood;
  const worried = P === PERSONALITIES.cautious ? danger <= 6 : floodDanger(g, me);
  if (gen.treatiesEnabled && worried && !mem.proposedTreaty && !(g.treaties || []).some((t) => t.signed.includes(g.you))) {
    mem.proposedTreaty = true;
    const invite = g.players.filter((p) => p.seat !== g.you).map((p) => p.seat);
    return {
      key: 'offer-treaty',
      action: { type: 'proposeTreaty', name: 'Green Pledge', note: 'Save the village.', clauses: { noUnsustainable: true }, rounds: 2, invite },
      say: `The Flood is at ${g.flood}. Please sign the Green Pledge — no Unsustainable for 2 rounds.`,
    };
  }
  return null;
}

/**
 * Is the Flood a real threat to us? True when it's within 5 of catastrophe, or
 * when our walls already can't hold back the current Flood.
 */
function floodDanger(g, me) {
  return g.threshold - g.flood <= 5 || me.protection < g.flood;
}

/** Players we've named as the enemy in an alliance. */
function allianceEnemies(g) {
  return (g.pacts || []).filter((p) => p.status === 'active' && p.kind === 'alliance' && (p.a === g.you || p.b === g.you)).map((p) => p.enemy);
}

function raidValue(g, p) {
  return (p.materialTotal || 0) + grudge(g, p.seat) * 3 + (allianceEnemies(g).includes(p.seat) ? 4 : 0);
}

/**
 * Conquests we could realistically make soon: seats (null = open land) whose tiles
 * we could win with the units next to them. Base mode: rich players we could raid.
 */
function expansionPlans(g, me) {
  if (!g.war) {
    if (me.materials.wood < g.settings.base.raidCostWood + 1) return [];
    return g.players.filter((p) => p.seat !== g.you && (p.materialTotal || 0) >= 4).map((p) => p.seat);
  }
  const plans = [];
  for (const id of g.attackTargets || []) {
    const t = g.board.tiles.find((x) => x.id === id);
    let sent;
    let defenders;
    if (g.stationed) {
      const srcs = g.attackSources[id] || [];
      if (!srcs.length) continue;
      sent = Math.max(...srcs.map((x) => x.units));
      defenders = Object.values(t.units || {}).reduce((a, n) => a + n, 0);
    } else {
      sent = me.units + (me.puppets || []).reduce((a, q) => a + g.players[q].units, 0);
      defenders = t.controller != null ? g.players[t.controller].units : 0;
    }
    if (sent >= 1 && (t.controller == null || sent > defenders)) plans.push(t.controller);
  }
  return plans;
}

/**
 * Should we sign this treaty? Judged on the situation, then nudged by personality.
 * Returns { sign, say }.
 */
function judgeTreaty(g, me, P, t) {
  const c = t.clauses;
  const warlike = P === PERSONALITIES.warlike;
  const fear = floodDanger(g, me);
  const desperate = g.threshold - g.flood <= 3;
  const plans = expansionPlans(g, me);
  const members = [...t.invited, t.by].filter((x) => x !== g.you);
  const no = (say) => ({ sign: false, say });
  const yes = (say) => ({ sign: true, say });

  // Untrustworthy proposers get refused — unless the village is about to drown.
  if (!desperate && !trusts(g, t.by, P)) return no(pick([`I don't trust ${g.players[t.by].name}'s treaties.`, `I'll pass on that treaty.`]));
  if (c.maxUnits != null) {
    if (me.units > c.maxUnits) return no(`I can't sign "${t.name}" — my army is already bigger than that.`);
    // Refuse an army limit only if we have conquests planned (and the limit would stop them).
    if (plans.length && c.maxUnits < P.army && !desperate) return no(pick([`I have plans for my army. No to "${t.name}".`, 'Limit my army? Not now.']));
  }
  if (c.noAttacks && plans.length && !desperate && !fear) return no(`I won't promise peace with everyone — not yet.`);
  if (c.noAttackSignatories && plans.some((s) => s != null && members.includes(s)) && !desperate && !(fear && !warlike)) {
    return no(`I can't promise not to attack everyone on that list.`);
  }
  if (c.noUnsustainable && !fear && warlike && chance(0.6)) return no('I need Unsustainable to pay for my army. Ask me again when the water is higher.');
  if (fear && (c.noUnsustainable || c.noAttacks)) return yes(pick([`The Flood is at ${g.flood}. I'll sign "${t.name}".`, 'Fine — saving the village comes first.']));
  return yes(pick([`I'll sign "${t.name}".`, 'Count me in.']));
}

/** Offer 2 of our most plentiful material for 1 of what the next wall needs. */
function tradeOffer(g, me, fresh) {
  if (me.sanctioned || !fresh('trade-offer') || g.trades.some((t) => t.from === g.you)) return null;
  const cost = wallCost(g);
  const need = MATS.find((m) => me.materials[m] < cost[m]);
  const spare = MATS.filter((m) => m !== need && me.materials[m] >= cost[m] + 2).sort((a, b) => me.materials[b] - me.materials[a])[0];
  if (!need || !spare) return null;
  const partner = g.players
    .filter((p) => p.seat !== g.you && !p.sanctioned && (!p.materials || p.materials[need] >= 1) && grudge(g, p.seat) === 0)
    .sort((a, b) => (b.materials ? b.materials[need] : 0) - (a.materials ? a.materials[need] : 0))[0];
  if (!partner) return null;
  const give = empty();
  const get = empty();
  give[spare] = 2;
  get[need] = 1;
  return { key: 'trade-offer', action: { type: 'proposeTrade', to: partner.seat, give, get }, say: chance(0.5) ? `${partner.name}, I've sent you an offer: 2 ${spare} for 1 ${need}.` : null };
}

// ---------------------------------------------------------------- chat

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Things a bot might say after something happened. Called after every update;
 * returns at most one line, and only for events it hasn't reacted to yet.
 */
function react(g, mem) {
  const me = g.players[g.you];
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  mem.lastHits = mem.lastHits || {};
  mem.lastLogId = mem.lastLogId == null ? (g.log.length ? g.log[g.log.length - 1].id : 0) : mem.lastLogId;
  let line = null;
  // Someone attacked or raided us.
  for (const [seat, n] of Object.entries(me.hits || {})) {
    if (n > (mem.lastHits[seat] || 0) && !line) {
      const who = g.players[seat].name;
      line = P === PERSONALITIES.warlike ? pick([`You'll pay for that, ${who}.`, `Big mistake, ${who}.`]) : pick([`Ouch. I'll remember that, ${who}.`, `Why, ${who}? I thought we were friends.`]);
    }
  }
  mem.lastHits = { ...(me.hits || {}) };
  // A pact with us was broken, or someone broke a treaty.
  for (const e of g.log.filter((x) => x.id > mem.lastLogId)) {
    if (line) break;
    if (e.event === 'pactBroken' && e.victim === g.you) line = `Traitor, ${g.players[e.breaker].name}! Everyone saw that.`;
    else if (e.event === 'treatyBroken' && e.breaker !== g.you && chance(0.4)) line = `So much for treaties, ${g.players[e.breaker].name}.`;
  }
  mem.lastLogId = g.log.length ? g.log[g.log.length - 1].id : mem.lastLogId;
  // The Flood is close to catastrophe (once a round, careful bots only).
  const danger = g.threshold - g.flood;
  if (!line && danger <= 3 && P !== PERSONALITIES.warlike && mem.floodWarned !== g.round && g.phase === 'talk') {
    mem.floodWarned = g.round;
    line = pick([`The Flood is at ${g.flood} — ${danger} from disaster. Everyone go Sustainable this round, please!`, `We're ${danger} away from losing the village. No Unsustainable, please.`]);
  }
  return line;
}

/**
 * Reply to a human's chat message. Returns { say, action } or null.
 * Bots only understand a few keywords — they're not real conversation partners.
 */
function reply(text, from, g, mem, botName) {
  const P = PERSONALITIES[mem.personality] || PERSONALITIES.balanced;
  const t = text.toLowerCase();
  const short = botName.replace(/^bot\s+/i, '').toLowerCase();
  const named = t.includes(short);
  if (!named && !/\b(bots?|everyone|all|anyone|guys)\b/.test(t)) return null;
  const who = g.players[from].name;
  const build = g.phase === 'talk' || g.phase === 'trade';
  if (/\b(peace|truce|pact|ally|alliance|friends?|deal)\b/.test(t)) {
    if (!g.settings.general.pactsEnabled) return { say: 'Pacts are switched off in this game.' };
    if (pactWith(g, from)) return { say: `We already have a pact, ${who}.` };
    if (!trusts(g, from, P)) return { say: pick([`Not with you, ${who}. I remember.`, `No deal, ${who}.`]) };
    if (!build) return { say: `Ask me again in the next Talk & Build, ${who}.` };
    return { say: `Sure, ${who} — I've sent you a pact offer.`, action: { type: 'proposePact', to: from, kind: 'peace', rounds: Math.min(2, g.settings.general.maxPactRounds) } };
  }
  if (/\b(trade|swap|need|spare|give|sell|buy)\b/.test(t)) {
    const me = g.players[g.you];
    const cost = wallCost(g);
    const need = MATS.find((m) => me.materials[m] < cost[m]);
    const spare = MATS.filter((m) => m !== need).sort((a, b) => me.materials[b] - me.materials[a])[0];
    if (!need || !spare || me.materials[spare] < 2) return { say: `I don't have much to spare right now, ${who}.` };
    if (!build || me.sanctioned) return { say: `I could use ${need}. I'd give ${spare} for it.` };
    const give = empty();
    const get = empty();
    give[spare] = 2;
    get[need] = 1;
    return { say: `I need ${need}. Sent you an offer: 2 ${spare} for 1 ${need}.`, action: { type: 'proposeTrade', to: from, give, get } };
  }
  if (/\b(attack|war|raid|fight|invade)\b/.test(t)) {
    return { say: P === PERSONALITIES.warlike ? pick(['Bring it on.', 'War pays — for the winner.']) : pick(['Please, no fighting. The Flood is high enough.', 'Every battle floods us all.']) };
  }
  if (/\b(flood|sustainable|seawall|help|save|wall)\b/.test(t)) {
    return { say: P === PERSONALITIES.warlike ? 'Walls are for the weak. …Fine, I might build one.' : pick(['Agreed. Sustainable from me.', "I'll do my part for the seawall."]) };
  }
  if (/\b(hi|hello|hey|yo|gl|good luck)\b/.test(t)) return { say: pick([`Hi ${who}!`, 'Good luck, everyone.', 'Hello! May the waters stay low.']) };
  return named ? { say: pick(["I'm just a bot — try words like pact, trade, flood or attack.", 'Beep. I understand pact, trade, flood and attack.']) } : null;
}

module.exports = { decide, react, reply, wallTarget, judgeTreaty, expansionPlans, floodDanger, PERSONALITIES, PERSONALITY_ORDER, BOT_NAMES };

