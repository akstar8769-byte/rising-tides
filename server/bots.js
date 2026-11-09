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
  cautious: { unsus: 0.1, raid: 0, attack: 0.1, army: 2, revolt: 0.1, donates: true, wallMargin: 2, wallsPerRound: 2 },
  balanced: { unsus: 0.35, raid: 0.15, attack: 0.4, army: 4, revolt: 0.3, donates: true, wallMargin: 0, wallsPerRound: 1 },
  warlike: { unsus: 0.5, raid: 0.45, attack: 0.8, army: 8, revolt: 0.6, donates: false, wallMargin: -1, wallsPerRound: 1 },
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
  if (me.ready) return null; // already done building this phase

  // 2. Build a wall only if we expect to need it by the end of the game, at most a
  //    couple per round — spare materials are points, so bots save like people do.
  if (mem.wallRound !== g.round) {
    mem.wallRound = g.round;
    mem.wallsThisRound = 0;
  }
  const wallKey = `wall-${me.walls}`;
  if (has(me.materials, cost) && fresh(wallKey) && mem.wallsThisRound < P.wallsPerRound && me.protection < wallTarget(g, P)) {
    mem.wallsThisRound++;
    return { key: wallKey, action: { type: 'buildWall', count: 1 } };
  }

  if (g.war) {
    const w = g.settings.war;
    // 3. Recruit up to the personality's army size — but walls come first unless warlike,
    //    and cautious/balanced bots stay under the army-emissions limit.
    let target = P.army;
    if (w.armyFloodPerUnits > 0 && P !== PERSONALITIES.warlike) target = Math.min(target, w.armyFloodPerUnits - 1);
    const wallsOk = me.protection >= g.flood + 1 || P === PERSONALITIES.warlike;
    if (me.units < target && wallsOk && total(me.materials) >= w.unitCost && fresh(`recruit-${me.units}`)) {
      const action = { type: 'recruit', count: 1, materials: payFromLargest(me, w.unitCost) };
      if (g.stationed) action.tile = frontier(g)[0] || me.homeTile;
      return { key: `recruit-${me.units}`, action };
    }
    // 4. Stationed units: put units where they're useful.
    if (g.stationed) {
      const mv = moveIdea(g, me, P);
      if (mv && fresh(mv.key)) return mv;
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
    if (need.length && spare.length) return { key: 'market', action: { type: 'market', give: spare[0], get: need[0] } };
  }

  // 7. When the Flood is getting close, careful bots chip in to the seawall.
  if (P.donates && danger <= 4 && g.seawallBonus < g.settings.base.seawallMaxSteps && total(me.materials) > 6 && fresh('donate')) {
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
  const rate = Math.max(0.5, (g.flood - g.settings.general.startingFlood) / done);
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
  if (me.materials.wood >= b.raidCostWood + 1 && chance(P.raid)) {
    const target = g.players
      .filter((p) => p.seat !== g.you)
      .sort((a, c) => (c.materialTotal || 0) - (a.materialTotal || 0))[0];
    if (target && target.materialTotal >= 3) ideas.push({ key: 'raid', action: { type: 'choose', action: 'raid', target: target.seat } });
  }
  if (danger > (P === PERSONALITIES.cautious ? 5 : 3) && chance(P.unsus)) {
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
    if ((g.stationed ? src : me.units >= 1) && chance(P.revolt)) {
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
  if (danger > (P === PERSONALITIES.warlike ? 2 : 4) && chance(P.attack)) {
    const target = pickTarget(g, me, P);
    if (target) ideas.push(target);
  }
  if (danger > (P === PERSONALITIES.cautious ? 6 : 4) && chance(P.unsus)) ideas.push(dev('unsustainable'));
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
    let score;
    if (t.controller == null) score = 2; // open tile: free claim
    else if (t.owner === g.you) score = sent >= defenders ? 5 : 0; // take back our land
    else if (sent > defenders || defenders === 0) score = 3 + (t.role === 'capital' ? 2 : 0);
    else score = P === PERSONALITIES.warlike && sent === defenders ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIdea = { key: `attack-${id}`, action: { type: 'choose', action: 'attack', target: id, ...(from ? { from, count: sent } : {}) } };
    }
  }
  return bestIdea;
}

module.exports = { decide, wallTarget, PERSONALITIES, PERSONALITY_ORDER, BOT_NAMES };
