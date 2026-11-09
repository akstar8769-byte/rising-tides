/**
 * RULES ENGINE — public interface
 * ===============================
 * No networking here. Everything is "state + action -> new state":
 *
 *   const state = createGame({ mode, settings, players, seed });
 *   const next  = applyAction(state, actor, action);   // throws RuleError if not allowed
 *   const view  = viewFor(next, seat);                  // what one player is allowed to see
 *
 * `actor` is a seat number (0, 1, 2…), or 'host' for host controls, or
 * 'system' for things the server does by itself (like the loot timer).
 */
'use strict';

const { fail, RuleError, addLog, bagTotal } = require('./util');
const { BIOMES, buildBoard, defaultBiomeList } = require('./board');
const base = require('./base');
const war = require('./war');
const { playtestRecord, recordToCsv } = require('./record');

const MODES = ['base', 'war', 'empire'];
const BUILT_MODES = ['base', 'war', 'empire'];

// Which actions exist in each mode. War modes add/replace some Base actions.
const HANDLERS = {
  base: base.handlers,
  war: { ...base.handlers, ...war.handlers },
  empire: { ...base.handlers, ...war.handlers },
};

/**
 * Start a new game.
 *   players: [{ name, biome }] in seat order (biome: forest | quarry | riverbank | mixed)
 *   seed:    any whole number; the same seed + same actions = the same game
 */
function createGame({ mode = 'base', settings, players, seed = 1 }) {
  if (!MODES.includes(mode)) fail(`Unknown mode "${mode}".`);
  if (!Array.isArray(players) || players.length < 3 || players.length > 5) fail('Rising Tides needs 3 to 5 players.');
  for (const p of players) if (!BIOMES[p.biome]) fail(`Unknown biome "${p.biome}".`);
  const b = settings.base;

  const state = {
    mode,
    settings: JSON.parse(JSON.stringify(settings)),
    rng: seed >>> 0,
    seq: 0, // log entry counter
    round: 1,
    phase: 'talk',
    startingPlayer: 0,
    flood: settings.general.startingFlood,
    seawall: 0, // total materials donated by everyone
    nextTradeId: 1,
    trades: [],
    raidQueue: [],
    pendingLoot: null,
    outcome: null,
    log: [],
    // War modes
    accordBroken: false,
    accordBrokeRound: null,
    clashCount: 0,
    battleQueue: [],
    destroyedPool: 0, // units destroyed in battle that haven't added Flood yet
    floodFromArmies: 0,
    floodFromDestruction: 0,
    players: players.map((p, seat) => ({
      seat,
      name: p.name,
      biome: p.biome,
      materials: { wood: b.startWood, stone: b.startStone, sandbag: b.startSandbag },
      walls: b.startWalls,
      donated: 0,
      ready: false,
      choice: null,
      // War modes
      units: mode === 'base' ? 0 : settings.war.startUnits,
      damaged: false,
      sanctionedThrough: null, // sanctioned until the end of this round number
      puppetOf: null, // Empire: seat of overlord
      puppetSince: null,
      command: null, // Empire: what the overlord ordered this puppet to do
      plans: { withdraw: [], release: [] }, // carried out at the next upkeep
      stats: {
        attack: 0,
        revolt: 0,
        attacksWon: 0,
        attacksLost: 0,
        revoltsWon: 0,
        claims: 0,
        captures: 0,
        clashes: 0,
        timesAttacked: 0,
        unitsRecruited: 0,
        unitsLost: 0,
        unitsDisbanded: 0,
        upkeepPaid: 0,
        garrisonPaid: 0,
        aidReceived: 0,
        tributePaid: 0,
        tributeReceived: 0,
        sanctions: 0,
        armyFlood: 0,
        sustainable: 0,
        unsustainable: 0,
        raid: 0,
        raidsWon: 0,
        raidsLost: 0,
        timesRaided: 0,
        tokensStolen: 0,
        wallsBuilt: 0,
        marketTrades: 0,
        tradesCompleted: 0,
        gifts: 0,
      },
    })),
  };
  state.board = buildBoard(state, settings.general.boardLayout, mode !== 'base');
  if (mode !== 'base' && settings.war.stationedUnits) {
    // Stationed units: everyone's starting militia stands on their capital.
    for (const p of state.players) state.board.tiles.find((t) => t.id === p.homeTile).units[p.seat] = p.units;
  }
  const modeName = { base: 'Base', war: 'War', empire: 'War + Empire' }[mode];
  addLog(state, `Game started: ${players.length} players, ${modeName} mode. Flood starts at ${state.flood}; catastrophe at ${base.threshold(state)}${mode === 'base' ? '' : `; the Climate Accord breaks at ${settings.war.accordLine}`}.`, { kind: 'round' });
  addLog(state, `Round 1 begins. Starting player: ${state.players[0].name}. Talk & build, then press Ready.`, { kind: 'round' });
  return state;
}

/** Apply one action. Returns a NEW state; the old one is never changed. */
function applyAction(state, actor, action) {
  if (!action || typeof action.type !== 'string') fail('Invalid action.');
  if (state.phase === 'ended') fail('The game is over.');
  const table = HANDLERS[state.mode];
  const handler = Object.prototype.hasOwnProperty.call(table, action.type) && table[action.type];
  if (!handler) fail(`Unknown action "${action.type}".`);
  const next = structuredClone(state);
  handler(next, actor, action);
  return next;
}

/** Seats the game is waiting on right now. */
function waitingFor(state) {
  if (base.BUILD_PHASES.includes(state.phase)) return state.players.filter((p) => !p.ready).map((p) => p.seat);
  if (state.phase === 'choose') return state.players.filter((p) => !p.choice).map((p) => p.seat);
  if (state.phase === 'loot' && state.pendingLoot) return [state.pendingLoot.raider];
  return [];
}

/**
 * What one player is allowed to see. Hides other players' secret choices
 * during the Choose phase, other people's trade offers, the dice seed and
 * (if the setting is on) other players' exact materials.
 */
function viewFor(state, seat) {
  const v = structuredClone(state);
  delete v.rng;
  delete v.forcedDice;
  delete v.raidQueue;
  v.you = seat;
  v.threshold = base.threshold(state);
  v.seawallBonus = base.seawallBonus(state);
  v.waitingFor = waitingFor(state);
  const hide = state.settings.general.hideOtherMaterials && state.phase !== 'ended';
  for (const p of v.players) {
    p.hasChosen = !!p.choice;
    p.protection = base.protection(state, p);
    p.materialTotal = bagTotal(p.materials);
    if (p.seat === seat) continue;
    if (state.phase === 'choose') p.choice = null;
    if (hide) p.materials = null;
  }
  v.trades = v.trades.filter((t) => t.from === seat || t.to === seat);
  if (state.mode !== 'base') war.decorateView(v, state, seat);
  return v;
}

module.exports = {
  MODES,
  BUILT_MODES,
  BIOMES,
  RuleError,
  createGame,
  applyAction,
  viewFor,
  waitingFor,
  threshold: base.threshold,
  compareDice: war.compareDice,
  production: war.production,
  attackTargets: war.attackTargets,
  defaultBiomeList,
  playtestRecord,
  recordToCsv,
};
