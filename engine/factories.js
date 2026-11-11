/**
 * FACTORIES (Base game, playtest rules)
 * =====================================
 * - During Talk & Build / Trade & Build you may build a factory on your home tile, or on
 *   an empty land tile next to your home or next to one of your factories. That is the
 *   only way to expand in the Base game. One factory per tile; never on another
 *   player's home tile or the village.
 * - Sustainable factories cost more and make less, but for every `factoryGreenPer` of
 *   them on the board (everyone's counted together) the Flood drops `factoryGreenDrop`
 *   each round. Teamwork lowers the Flood.
 * - Unsustainable factories are cheap and make more, but each adds `factoryUnsFlood`
 *   to the Flood every round it stands. A player may own at most `factoryUnsMax`.
 * - Each round (at Reveal & collect) every factory makes materials of its tile's
 *   resource for its owner (a Mixed home tile makes whatever the owner has least of).
 * - Claim: instead of Raid, the round action "Claim a factory" targets another player's
 *   factory (not one on their home tile). The claimer pays wood, both roll one die,
 *   higher wins and ties go to the owner. A win moves the factory to the claimer.
 * - You may demolish your own factory during a build phase (e.g. to replace a dirty one).
 */
'use strict';

const { fail, MATERIALS, emptyBag, hasBag, subBag, addBag, describeBag, rollDie, addLog } = require('./util');
const { BIOMES, areAdjacent } = require('./board');
const diplomacy = require('./diplomacy');

const KINDS = ['sustainable', 'unsustainable'];

function cfg(state) {
  return state.settings.base;
}

/** Factories are a Base-game rule (switchable in the lobby). */
function factoriesOn(state) {
  return state.mode === 'base' && !!cfg(state).factoriesEnabled;
}

function factoryCost(state, kind) {
  const c = cfg(state);
  return kind === 'sustainable'
    ? { wood: c.factorySusWood, stone: c.factorySusStone, sandbag: c.factorySusSandbag }
    : { wood: c.factoryUnsWood, stone: c.factoryUnsStone, sandbag: c.factoryUnsSandbag };
}

function factoryMakes(state, kind) {
  const c = cfg(state);
  return kind === 'sustainable' ? c.factorySusMakes : c.factoryUnsMakes;
}

function tile(state, id) {
  const t = state.board.tiles.find((x) => x.id === id);
  if (!t) fail('Pick a tile on the board.');
  return t;
}

function factoriesOf(state, seat, kind) {
  return state.board.tiles.filter((t) => t.factory && t.factory.owner === seat && (!kind || t.factory.kind === kind));
}

/** Board-wide counts. */
function counts(state) {
  const all = state.board.tiles.filter((t) => t.factory);
  return { sustainable: all.filter((t) => t.factory.kind === 'sustainable').length, unsustainable: all.filter((t) => t.factory.kind === 'unsustainable').length };
}

/** Flood change from factories at the end of a round: { up, down }. */
function floodEffect(state) {
  const c = cfg(state);
  const n = counts(state);
  return { up: n.unsustainable * c.factoryUnsFlood, down: Math.floor(n.sustainable / Math.max(1, c.factoryGreenPer)) * c.factoryGreenDrop };
}

/** Tiles where `seat` may build a factory right now. */
function buildSites(state, seat) {
  const p = state.players[seat];
  const anchors = state.board.tiles.filter((t) => t.id === p.homeTile || (t.factory && t.factory.owner === seat));
  return state.board.tiles
    .filter((t) => t.kind === 'land' && !t.factory && (t.owner == null || t.owner === seat))
    .filter((t) => t.id === p.homeTile || anchors.some((a) => areAdjacent(a, t)))
    .map((t) => t.id);
}

/** Factories `seat` may try to claim (other players', not on their home tile). */
function claimTargets(state, seat) {
  const atCap = factoriesOf(state, seat, 'unsustainable').length >= cfg(state).factoryUnsMax;
  return state.board.tiles
    .filter((t) => t.factory && t.factory.owner !== seat && !(t.owner === t.factory.owner && t.role === 'capital'))
    .filter((t) => !(atCap && t.factory.kind === 'unsustainable'))
    .map((t) => t.id);
}

// ---------------------------------------------------------------- build-phase actions

function buildFactory(state, actor, { tile: id, kind } = {}) {
  if (!factoriesOn(state)) fail('Factories are switched off in this game.');
  if (!['talk', 'trade'].includes(state.phase)) fail('You can only build during a Talk & Build or Trade & Build phase.');
  const p = state.players[actor];
  if (!p) fail('Only seated players can do that.');
  if (!KINDS.includes(kind)) fail('Choose a sustainable or unsustainable factory.');
  const t = tile(state, id);
  if (t.factory) fail('That tile already has a factory.');
  if (!buildSites(state, actor).includes(id)) fail('You can only build on your home tile or an empty tile next to your home or one of your factories.');
  const c = cfg(state);
  if (kind === 'unsustainable') {
    diplomacy.checkMove(state, actor, 'unsustainable');
    if (factoriesOf(state, actor, 'unsustainable').length >= c.factoryUnsMax) fail(`You already have the most unsustainable factories allowed (${c.factoryUnsMax}).`);
  }
  const cost = factoryCost(state, kind);
  if (!hasBag(p.materials, cost)) fail(`You need ${describeBag(cost)} to build that factory.`);
  subBag(p.materials, cost);
  t.factory = { owner: actor, kind, built: state.round };
  if (t.owner == null) t.controller = actor;
  p.stats.factoriesBuilt = (p.stats.factoriesBuilt || 0) + 1;
  if (kind === 'sustainable') p.stats.greenFactories = (p.stats.greenFactories || 0) + 1;
  const e = floodEffect(state);
  addLog(state, `${p.name} built ${kind === 'sustainable' ? 'a 🌿 sustainable' : 'an 🏭 unsustainable'} factory on ${t.id}. Factories now: Flood +${e.up} / −${e.down} each round.`, {
    kind: kind === 'sustainable' ? 'good' : undefined,
  });
}

function demolishFactory(state, actor, { tile: id } = {}) {
  if (!factoriesOn(state)) fail('Factories are switched off in this game.');
  if (!['talk', 'trade'].includes(state.phase)) fail('You can only do that during a Talk & Build or Trade & Build phase.');
  const p = state.players[actor];
  if (!p) fail('Only seated players can do that.');
  const t = tile(state, id);
  if (!t.factory || t.factory.owner !== actor) fail("That isn't your factory.");
  const kind = t.factory.kind;
  t.factory = null;
  if (t.owner == null) t.controller = null;
  addLog(state, `${p.name} demolished their ${kind} factory on ${t.id}.`);
}

// ---------------------------------------------------------------- choose: claim

/** Validate a 'claim' choice. Returns the choice object. */
function checkClaim(state, actor, target) {
  if (!factoriesOn(state)) fail('Factories are switched off in this game.');
  const p = state.players[actor];
  const t = tile(state, target);
  if (!t.factory) fail('There is no factory there.');
  if (t.factory.owner === actor) fail("That's already your factory.");
  if (!claimTargets(state, actor).includes(target)) {
    if (t.factory.kind === 'unsustainable') fail(`You can't own more than ${cfg(state).factoryUnsMax} unsustainable factories.`);
    fail("You can't claim a factory on someone's home tile.");
  }
  diplomacy.checkMove(state, actor, 'attack', t.factory.owner);
  if (p.materials.wood < cfg(state).claimCostWood) fail(`You need at least ${cfg(state).claimCostWood} wood to claim a factory.`);
  return { action: 'claim', target };
}

/** Resolve one claim (called in clockwise order after collecting). */
function resolveClaim(state, claimer, target) {
  const c = cfg(state);
  const A = state.players[claimer];
  const t = state.board.tiles.find((x) => x.id === target);
  if (!t.factory || t.factory.owner === claimer) {
    addLog(state, `${A.name}'s claim on ${target} fizzles: that factory has changed hands.`);
    return;
  }
  if (t.factory.kind === 'unsustainable' && factoriesOf(state, claimer, 'unsustainable').length >= c.factoryUnsMax) {
    addLog(state, `${A.name}'s claim on ${target} fizzles: they can't own another unsustainable factory.`);
    return;
  }
  if (A.materials.wood < c.claimCostWood) {
    addLog(state, `${A.name}'s claim on ${target} fizzles: no wood left to pay for it.`);
    return;
  }
  A.materials.wood -= c.claimCostWood;
  const ownerSeat = t.factory.owner;
  const D = state.players[ownerSeat];
  diplomacy.onHostile(state, claimer, ownerSeat);
  const a = rollDie(state);
  const d = rollDie(state);
  const won = a > d; // ties go to the owner
  const dice = { title: `Claim: ${A.name} → ${D.name}'s factory (${t.id})`, sides: [{ seat: claimer, rolls: [a] }, { seat: ownerSeat, rolls: [d] }], winner: won ? claimer : ownerSeat };
  if (won) {
    t.factory = { ...t.factory, owner: claimer };
    if (t.owner == null) t.controller = claimer;
    A.stats.claimsWon = (A.stats.claimsWon || 0) + 1;
    D.stats.factoriesLost = (D.stats.factoriesLost || 0) + 1;
    addLog(state, `${A.name} claims ${D.name}'s ${t.factory.kind} factory on ${t.id}: ${a} vs ${d}. It's ${A.name}'s now!`, { kind: 'battle', dice });
  } else {
    A.stats.claimsLost = (A.stats.claimsLost || 0) + 1;
    addLog(state, `${A.name} tried to claim ${D.name}'s factory on ${t.id}: ${a} vs ${d}. ${a === d ? 'Tie — ' : ''}${D.name} keeps it.`, { kind: 'battle', dice });
  }
}

// ---------------------------------------------------------------- reveal: production

/** Every factory makes materials for its owner. */
function produce(state) {
  const made = state.players.map(() => emptyBag());
  for (const t of state.board.tiles) {
    if (!t.factory) continue;
    const owner = state.players[t.factory.owner];
    const n = factoryMakes(state, t.factory.kind);
    const res = BIOMES[t.biome] && BIOMES[t.biome].resource;
    for (let k = 0; k < n; k++) {
      // Mixed tile: whatever the owner has least of (counting what they've just made).
      const m = res || MATERIALS.reduce((best, x) => (owner.materials[x] + made[owner.seat][x] < owner.materials[best] + made[owner.seat][best] ? x : best), MATERIALS[0]);
      made[owner.seat][m]++;
    }
  }
  const lines = [];
  for (const p of state.players) {
    const bag = made[p.seat];
    const n = bag.wood + bag.stone + bag.sandbag;
    if (!n) continue;
    addBag(p.materials, bag);
    p.stats.factoryMade = (p.stats.factoryMade || 0) + n;
    lines.push(`${p.name} ${describeBag(bag)}`);
  }
  if (lines.length) addLog(state, `Factories made: ${lines.join('; ')}.`);
}

/** Extra view data for one player. */
function decorateView(v, state, seat) {
  if (!factoriesOn(state)) return;
  const c = cfg(state);
  v.factories = {
    counts: counts(state),
    effect: floodEffect(state),
    sites: seat != null && state.players[seat] ? buildSites(state, seat) : [],
    claimTargets: seat != null && state.players[seat] ? claimTargets(state, seat) : [],
    mine: seat != null ? factoriesOf(state, seat).map((t) => ({ tile: t.id, kind: t.factory.kind })) : [],
    unsMax: c.factoryUnsMax,
  };
}

const handlers = { buildFactory, demolishFactory };

module.exports = { handlers, factoriesOn, factoryCost, factoryMakes, buildSites, claimTargets, counts, floodEffect, checkClaim, resolveClaim, produce, factoriesOf, decorateView };
