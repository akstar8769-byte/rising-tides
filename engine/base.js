/**
 * BASE GAME RULES
 * ===============
 * Every function here changes a game `state` object. They are only called by
 * engine/index.js on a fresh COPY of the state, so the outside world sees
 * pure "state + action -> new state" behaviour.
 *
 * Round order (prompt 3.1):
 *   'talk'   1. Talk & build — trade, give, build walls, market, donate. Everyone presses Ready.
 *   'choose' 2. Choose secretly — everyone picks an action (and raid target).
 *            3. Reveal & collect — happens automatically once everyone has chosen.
 *   'loot'   4. Resolve raids — automatic, but pauses while a winning raider picks loot.
 *   'trade'  5. Trade & build again. Everyone presses Ready. Starting player passes clockwise.
 *   'ended'  Game over (see state.outcome).
 */
'use strict';

const {
  fail,
  MATERIALS,
  emptyBag,
  cleanBag,
  bagTotal,
  hasBag,
  addBag,
  subBag,
  scaleBag,
  describeBag,
  randomInt,
  rollDie,
  addLog,
} = require('./util');
const { BIOMES } = require('./board');

const BUILD_PHASES = ['talk', 'trade'];
const ACTION_NAMES = { sustainable: 'Sustainable', unsustainable: 'Unsustainable', raid: 'Raid' };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function cfg(state) {
  return state.settings.base;
}

/** Seats in clockwise order, starting with the round's starting player. */
function clockwise(state) {
  const n = state.players.length;
  return Array.from({ length: n }, (_, k) => (state.startingPlayer + k) % n);
}

/** Current catastrophe threshold, including the seawall bonus. */
function threshold(state) {
  const c = cfg(state);
  const table = state.mode === 'base' ? c.catastrophe : state.settings.war.catastrophe;
  return table[state.players.length] + seawallBonus(state);
}

function seawallBonus(state) {
  const c = cfg(state);
  return Math.min(Math.floor(state.seawall / c.seawallPerStep), c.seawallMaxSteps);
}

function protection(state, p) {
  return p.walls * cfg(state).wallProtection;
}

function wallCost(state) {
  const c = cfg(state);
  return { wood: c.wallCostWood, stone: c.wallCostStone, sandbag: c.wallCostSandbag };
}

function player(state, actor) {
  if (typeof actor !== 'number' || !state.players[actor]) fail('Only seated players can do that.');
  return state.players[actor];
}

function otherPlayer(state, actor, seat) {
  if (!Number.isInteger(seat) || !state.players[seat]) fail('Pick a valid player.');
  if (seat === actor) fail("You can't do that to yourself.");
  return state.players[seat];
}

function requireBuildPhase(state) {
  if (!BUILD_PHASES.includes(state.phase)) fail('You can only do that during a Talk & Build or Trade & Build phase.');
}

function requireHost(actor) {
  if (actor !== 'host') fail('Only the host can do that.');
}

/** Spread `amount` materials evenly: used when a skipped Mixed player needs a mix. */
function evenMix(amount) {
  const b = emptyBag();
  for (let i = 0; i < amount; i++) b[MATERIALS[i % 3]]++;
  return b;
}

// ---------------------------------------------------------------------------
// Trade & Build actions
// ---------------------------------------------------------------------------

function ready(state, actor) {
  requireBuildPhase(state);
  player(state, actor).ready = true;
  maybeAdvanceBuildPhase(state);
}

function unready(state, actor) {
  requireBuildPhase(state);
  player(state, actor).ready = false;
}

function buildWall(state, actor, { count = 1 } = {}) {
  requireBuildPhase(state);
  const p = player(state, actor);
  if (!Number.isInteger(count) || count < 1 || count > 50) fail('Invalid number of walls.');
  const cost = scaleBag(wallCost(state), count);
  if (!hasBag(p.materials, cost)) fail(`You need ${describeBag(cost)} to build ${count === 1 ? 'a wall' : count + ' walls'}.`);
  subBag(p.materials, cost);
  p.walls += count;
  p.stats.wallsBuilt += count;
  addLog(state, `${p.name} built ${count === 1 ? 'a wall' : count + ' walls'} (protection now ${protection(state, p)}).`);
}

function market(state, actor, { give, get, times = 1 } = {}) {
  requireBuildPhase(state);
  const p = player(state, actor);
  if (!MATERIALS.includes(give) || !MATERIALS.includes(get)) fail('Pick materials to give and get.');
  if (give === get) fail('Pick two different materials.');
  if (!Number.isInteger(times) || times < 1 || times > 50) fail('Invalid number of market trades.');
  const c = cfg(state);
  const pay = c.marketGive * times;
  if (p.materials[give] < pay) fail(`You need ${pay} ${give} for that.`);
  p.materials[give] -= pay;
  p.materials[get] += c.marketGet * times;
  p.stats.marketTrades += times;
  addLog(state, `${p.name} traded ${describeBag({ ...emptyBag(), [give]: pay })} at the market for ${describeBag({ ...emptyBag(), [get]: c.marketGet * times })}.`);
}

function donate(state, actor, { materials } = {}) {
  requireBuildPhase(state);
  const p = player(state, actor);
  const bag = cleanBag(materials);
  const n = bagTotal(bag);
  if (n === 0) fail('Choose some materials to donate.');
  if (!hasBag(p.materials, bag)) fail("You don't have those materials.");
  const before = seawallBonus(state);
  subBag(p.materials, bag);
  p.donated += n;
  state.seawall += n;
  const after = seawallBonus(state);
  let text = `${p.name} donated ${describeBag(bag)} to the village seawall (total ${state.seawall}).`;
  if (after > before) text += ` The catastrophe threshold rises to ${threshold(state)}!`;
  addLog(state, text, { kind: after > before ? 'good' : undefined });
}

function gift(state, actor, { to, materials } = {}) {
  requireBuildPhase(state);
  const p = player(state, actor);
  const q = otherPlayer(state, actor, to);
  const bag = cleanBag(materials);
  if (bagTotal(bag) === 0) fail('Choose some materials to give.');
  if (!hasBag(p.materials, bag)) fail("You don't have those materials.");
  subBag(p.materials, bag);
  addBag(q.materials, bag);
  p.stats.gifts += 1;
  addLog(state, `${p.name} gave ${q.name} ${describeBag(bag)}.`);
}

function proposeTrade(state, actor, { to, give, get } = {}) {
  requireBuildPhase(state);
  const p = player(state, actor);
  const q = otherPlayer(state, actor, to);
  const g = cleanBag(give, 'offer');
  const w = cleanBag(get, 'request');
  if (bagTotal(g) === 0 || bagTotal(w) === 0) fail('A trade needs materials on both sides. Use Give for a gift.');
  if (!hasBag(p.materials, g)) fail("You don't have what you're offering.");
  if (state.trades.filter((t) => t.from === actor).length >= 10) fail('You have too many open offers. Cancel some first.');
  const id = state.nextTradeId++;
  state.trades.push({ id, from: actor, to: q.seat, give: g, get: w });
  return id;
}

function findTrade(state, id) {
  const t = state.trades.find((x) => x.id === id);
  if (!t) fail('That offer is no longer open.');
  return t;
}

function acceptTrade(state, actor, { id } = {}) {
  requireBuildPhase(state);
  const t = findTrade(state, id);
  if (t.to !== actor) fail('That offer is not for you.');
  const from = state.players[t.from];
  const to = state.players[t.to];
  if (!hasBag(from.materials, t.give)) fail(`${from.name} no longer has what they offered.`);
  if (!hasBag(to.materials, t.get)) fail("You don't have what they asked for.");
  subBag(from.materials, t.give);
  addBag(to.materials, t.give);
  subBag(to.materials, t.get);
  addBag(from.materials, t.get);
  from.stats.tradesCompleted += 1;
  to.stats.tradesCompleted += 1;
  state.trades = state.trades.filter((x) => x.id !== id);
  addLog(state, `${from.name} and ${to.name} traded: ${describeBag(t.give)} for ${describeBag(t.get)}.`);
}

function rejectTrade(state, actor, { id } = {}) {
  const t = findTrade(state, id);
  if (t.to !== actor) fail('That offer is not for you.');
  state.trades = state.trades.filter((x) => x.id !== id);
}

function cancelTrade(state, actor, { id } = {}) {
  const t = findTrade(state, id);
  if (t.from !== actor) fail('That is not your offer.');
  state.trades = state.trades.filter((x) => x.id !== id);
}

/** When everyone is Ready, move on. */
function maybeAdvanceBuildPhase(state) {
  if (!state.players.every((p) => p.ready)) return;
  state.players.forEach((p) => (p.ready = false));
  if (state.phase === 'talk') startChoosing(state);
  else if (state.phase === 'trade') endRound(state);
}

// ---------------------------------------------------------------------------
// Choose secretly
// ---------------------------------------------------------------------------

function startChoosing(state) {
  state.phase = 'choose';
  state.trades = []; // trading is closed until the next Trade & Build phase
  state.players.forEach((p) => (p.choice = null));
  addLog(state, 'Everyone is ready. Choose your action secretly.', { kind: 'phase' });
}

/**
 * Pick (or change) your secret action. Choices can be changed until the last
 * player locks in; then everything is revealed at once.
 *   { action: 'sustainable' }                       (Mixed home: also mix: {..} totalling 2)
 *   { action: 'unsustainable', mix: { wood: 2, stone: 1, sandbag: 1 } }
 *   { action: 'raid', target: 2 }
 */
function choose(state, actor, { action, mix, target } = {}) {
  if (state.phase !== 'choose') fail('It is not time to choose an action.');
  const p = player(state, actor);
  const c = cfg(state);
  const choice = { action };
  if (action === 'sustainable') {
    if (p.biome === 'mixed') {
      choice.mix = cleanBag(mix, 'mix');
      if (bagTotal(choice.mix) !== c.sustainableCollect) fail(`Pick exactly ${c.sustainableCollect} materials.`);
    }
  } else if (action === 'unsustainable') {
    choice.mix = cleanBag(mix, 'mix');
    if (bagTotal(choice.mix) !== c.unsustainableCollect) fail(`Pick exactly ${c.unsustainableCollect} materials.`);
  } else if (action === 'raid') {
    if (state.mode !== 'base') fail('Raids are replaced by attacks in War mode.');
    otherPlayer(state, actor, target);
    if (p.materials.wood < c.raidCostWood) fail(`You need at least ${c.raidCostWood} wood to raid.`);
    choice.target = target;
  } else {
    fail('Choose Sustainable, Unsustainable or Raid.');
  }
  p.choice = choice;
  if (state.players.every((x) => x.choice)) reveal(state);
}

// ---------------------------------------------------------------------------
// Reveal & collect
// ---------------------------------------------------------------------------

function choiceText(state, p) {
  const ch = p.choice;
  if (ch.action === 'raid') return `Raid on ${state.players[ch.target].name}`;
  return ACTION_NAMES[ch.action];
}

function reveal(state) {
  const c = cfg(state);
  const order = clockwise(state);
  addLog(state, 'Revealed: ' + order.map((i) => `${state.players[i].name} — ${choiceText(state, state.players[i])}`).join('; ') + '.', {
    kind: 'reveal',
  });

  let rise = 0;
  for (const i of order) {
    const p = state.players[i];
    const ch = p.choice;
    p.stats[ch.action] += 1;
    if (ch.action === 'sustainable') {
      const res = BIOMES[p.biome].resource;
      const gained = res ? { ...emptyBag(), [res]: c.sustainableCollect } : ch.mix;
      addBag(p.materials, gained);
      addLog(state, `${p.name} collected ${describeBag(gained)}.`);
    } else if (ch.action === 'unsustainable') {
      addBag(p.materials, ch.mix);
      rise += c.unsustainableFlood;
      addLog(state, `${p.name} collected ${describeBag(ch.mix)} (Flood +${c.unsustainableFlood}).`);
    }
  }
  if (rise > 0) {
    state.flood += rise;
    addLog(state, `The Flood rises by ${rise} to ${state.flood} (catastrophe at ${threshold(state)}).`, { kind: 'flood' });
  }
  if (checkCatastrophe(state)) return;

  state.raidQueue = order.filter((i) => state.players[i].choice.action === 'raid').map((i) => ({ raider: i, target: state.players[i].choice.target }));
  continueRaids(state);
}

/** If the Flood has reached the threshold, everyone loses at once. */
function checkCatastrophe(state) {
  if (state.flood < threshold(state)) return false;
  addLog(state, `CATASTROPHE! The Flood reached ${state.flood}, the catastrophe threshold. The whole village is lost — everyone loses.`, {
    kind: 'bad',
  });
  finishGame(state, 'catastrophe');
  return true;
}

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

/** Resolve queued raids in order. Stops (phase 'loot') when a raider must pick loot. */
function continueRaids(state) {
  while (state.raidQueue.length) {
    const raid = state.raidQueue.shift();
    if (resolveRaid(state, raid) === 'pick') {
      state.phase = 'loot';
      return;
    }
  }
  state.pendingLoot = null;
  startTradePhase(state);
}

function resolveRaid(state, { raider, target }) {
  const c = cfg(state);
  const A = state.players[raider];
  const D = state.players[target];
  if (A.materials.wood < c.raidCostWood) {
    addLog(state, `${A.name}'s raid on ${D.name} fizzles: ${A.name} has no wood left to pay for it.`);
    return;
  }
  A.materials.wood -= c.raidCostWood;
  D.stats.timesRaided += 1;

  let won;
  let text;
  let dice = null;
  if (D.materials.wood >= c.raidDefenceWood && c.raidDefenceWood > 0) {
    D.materials.wood -= c.raidDefenceWood;
    const a = rollDie(state);
    const d = rollDie(state);
    won = a > d; // raider must roll strictly higher; a tie is a defence
    text = `${A.name} raided ${D.name}: ${a} vs ${d}. ` + (won ? `${A.name} wins.` : a === d ? `Tie — ${D.name} defends.` : `${D.name} defends.`);
    dice = { title: `Raid: ${A.name} → ${D.name}`, sides: [{ seat: raider, rolls: [a] }, { seat: target, rolls: [d] }], winner: won ? raider : target };
  } else {
    won = true;
    text = `${A.name} raided ${D.name}, who had no wood to defend. ${A.name} wins automatically.`;
  }

  if (!won) {
    A.stats.raidsLost += 1;
    addLog(state, text, { kind: 'battle', dice });
    return;
  }
  A.stats.raidsWon += 1;
  const available = bagTotal(D.materials);
  const count = Math.min(c.raidMaxLoot, available);
  const kindsHeld = MATERIALS.filter((m) => D.materials[m] > 0).length;
  if (count === 0) {
    addLog(state, text + ` But ${D.name} had nothing to take.`, { kind: 'battle', dice });
    return;
  }
  if (available <= c.raidMaxLoot || kindsHeld === 1) {
    // No real choice to make: take everything / the only kind there is.
    const take = available <= c.raidMaxLoot ? { ...D.materials } : { ...emptyBag(), [MATERIALS.find((m) => D.materials[m] > 0)]: count };
    moveLoot(state, D, A, take);
    addLog(state, text + ` ${A.name} takes ${describeBag(take)}.`, { kind: 'battle', dice });
    return;
  }
  addLog(state, text + ` ${A.name} is choosing ${count} tokens to take…`, { kind: 'battle', dice });
  state.pendingLoot = { id: state.seq, raider, target, count };
  return 'pick';
}

function moveLoot(state, from, to, bag) {
  subBag(from.materials, bag);
  addBag(to.materials, bag);
  to.stats.tokensStolen += bagTotal(bag);
}

/** The winning raider picks which tokens to take. */
function pickLoot(state, actor, { materials } = {}) {
  if (state.phase !== 'loot' || !state.pendingLoot) fail('There is no loot to pick.');
  const L = state.pendingLoot;
  if (actor !== L.raider) fail('Only the winning raider picks the loot.');
  const bag = cleanBag(materials);
  const D = state.players[L.target];
  if (bagTotal(bag) !== L.count) fail(`Pick exactly ${L.count} tokens.`);
  if (!hasBag(D.materials, bag)) fail(`${D.name} doesn't have those.`);
  finishLoot(state, bag, '');
}

/** Pick loot at random (timer ran out, or host skipped). */
function randomLoot(state, why) {
  const L = state.pendingLoot;
  const D = state.players[L.target];
  const pool = { ...D.materials };
  const bag = emptyBag();
  for (let k = 0; k < L.count; k++) {
    let r = randomInt(state, bagTotal(pool));
    for (const m of MATERIALS) {
      if (r < pool[m]) {
        pool[m]--;
        bag[m]++;
        break;
      }
      r -= pool[m];
    }
  }
  finishLoot(state, bag, why);
}

function finishLoot(state, bag, why) {
  const L = state.pendingLoot;
  const A = state.players[L.raider];
  const D = state.players[L.target];
  moveLoot(state, D, A, bag);
  addLog(state, `${A.name} took ${describeBag(bag)} from ${D.name}${why}.`);
  state.pendingLoot = null;
  state.phase = 'raids';
  continueRaids(state);
}

function lootTimeout(state, actor) {
  if (actor !== 'system') fail('Only the server can do that.');
  if (state.phase !== 'loot') return; // the raider already picked
  randomLoot(state, ' (time ran out, picked at random)');
}

// ---------------------------------------------------------------------------
// Trade & build again, end of round, end of game
// ---------------------------------------------------------------------------

function startTradePhase(state) {
  state.phase = 'trade';
  state.players.forEach((p) => (p.ready = false));
  addLog(state, 'Trade & build. Press Ready when you are done.', { kind: 'phase' });
}

function endRound(state) {
  const c = cfg(state);
  const rounds = state.mode === 'base' ? c.rounds : state.settings.war.rounds;
  if (state.round >= rounds) {
    addLog(state, `Round ${state.round} was the last round.`, { kind: 'phase' });
    finishGame(state, 'rounds');
    return;
  }
  if (c.stormEnabled && state.round >= c.stormFromRound) {
    const roll = rollDie(state);
    const ends = roll <= c.stormEndMax;
    addLog(state, `Storm roll: ${roll}. ` + (ends ? 'The storm hits — the game ends now!' : 'The storm passes.'), {
      kind: 'battle',
      dice: { title: 'Storm roll', sides: [{ seat: null, label: 'Storm', rolls: [roll] }], winner: null },
    });
    if (ends) {
      finishGame(state, 'storm');
      return;
    }
  }
  state.round += 1;
  state.startingPlayer = (state.startingPlayer + 1) % state.players.length;
  state.phase = 'talk';
  addLog(state, `Round ${state.round} begins. Starting player: ${state.players[state.startingPlayer].name}.`, { kind: 'round' });
}

/**
 * Work out the final result.
 * A home survives if wall protection >= final Flood (no one survives a catastrophe).
 * Survivors score spare materials + seawall points. Highest score wins; ties share.
 */
function scoreGame(state, reason) {
  const c = cfg(state);
  const catastrophe = reason === 'catastrophe';
  const results = state.players.map((p) => {
    const prot = protection(state, p);
    const survived = !catastrophe && prot >= state.flood;
    const spare = bagTotal(p.materials);
    const seawallPoints = p.donated * c.seawallPointsPerMaterial;
    return { seat: p.seat, name: p.name, walls: p.walls, protection: prot, survived, spare, seawallPoints, score: survived ? spare + seawallPoints : 0 };
  });
  const survivors = results.filter((r) => r.survived);
  const best = survivors.length ? Math.max(...survivors.map((r) => r.score)) : null;
  const winners = survivors.filter((r) => r.score === best).map((r) => r.seat);
  return { reason, catastrophe, finalFlood: state.flood, threshold: threshold(state), results, winners };
}

function finishGame(state, reason) {
  state.phase = 'ended';
  state.pendingLoot = null;
  state.raidQueue = [];
  state.trades = [];
  state.outcome = scoreGame(state, reason);
  const o = state.outcome;
  if (o.catastrophe) return;
  if (!o.winners.length) addLog(state, `Game over. Final Flood ${o.finalFlood}. No home survived — nobody wins.`, { kind: 'bad' });
  else {
    const names = o.winners.map((s) => state.players[s].name).join(' and ');
    addLog(state, `Game over. Final Flood ${o.finalFlood}. ${names} ${o.winners.length > 1 ? 'share the win' : 'wins'}!`, { kind: 'good' });
  }
}

// ---------------------------------------------------------------------------
// Host controls
// ---------------------------------------------------------------------------

/** Host moves a stuck (e.g. disconnected) player along. */
function skip(state, actor, { seat } = {}) {
  requireHost(actor);
  if (!Number.isInteger(seat) || !state.players[seat]) fail('Pick a valid player.');
  const p = state.players[seat];
  if (BUILD_PHASES.includes(state.phase)) {
    if (p.ready) fail(`${p.name} is already ready.`);
    addLog(state, `The host marked ${p.name} as ready.`);
    p.ready = true;
    maybeAdvanceBuildPhase(state);
  } else if (state.phase === 'choose') {
    if (p.choice) fail(`${p.name} has already chosen.`);
    addLog(state, `The host skipped ${p.name}'s turn: they play Sustainable.`);
    p.choice = { action: 'sustainable' };
    if (p.biome === 'mixed') p.choice.mix = evenMix(cfg(state).sustainableCollect);
    if (state.players.every((x) => x.choice)) reveal(state);
  } else if (state.phase === 'loot') {
    if (state.pendingLoot.raider !== seat) fail(`${p.name} is not picking loot.`);
    randomLoot(state, ' (skipped by the host, picked at random)');
  } else {
    fail('There is nothing to skip right now.');
  }
}

function endGame(state, actor) {
  requireHost(actor);
  addLog(state, 'The host ended the game. Scoring at the current Flood.', { kind: 'phase' });
  finishGame(state, 'host');
}

const handlers = {
  ready,
  unready,
  buildWall,
  market,
  donate,
  gift,
  proposeTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade,
  choose,
  pickLoot,
  lootTimeout,
  skip,
  endGame,
};

module.exports = { handlers, threshold, seawallBonus, protection, wallCost, clockwise, scoreGame, BUILD_PHASES };
