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
const diplomacy = require('./diplomacy');
const factories = require('./factories');
const { playtestRecord, recordToCsv } = require('./record');
const SCEN = require('./scenarios');

const MODES = ['base', 'war', 'empire', 'totalwar'];
const BUILT_MODES = ['base', 'war', 'empire', 'totalwar'];

// Which actions exist in each mode. War modes add/replace some Base actions.
const HANDLERS = {
  base: { ...base.handlers, ...factories.handlers, ...diplomacy.handlers },
  war: { ...base.handlers, ...war.handlers, ...diplomacy.handlers },
  empire: { ...base.handlers, ...war.handlers, ...diplomacy.handlers },
  totalwar: { ...base.handlers, ...war.handlers, ...diplomacy.handlers },
};

/**
 * Total War reuses the War rules with its own numbers: copy them into
 * settings.war so the War code reads them, and switch off the climate politics.
 */
function totalWarSettings(settings) {
  const tw = settings.totalwar;
  settings.war = {
    ...settings.war,
    rounds: tw.rounds,
    catastrophe: { ...tw.catastrophe },
    accordLine: 999,
    startUnits: tw.startMilitia,
    unitCost: tw.militia.cost,
    upkeepUnitsPerMaterial: tw.upkeepPointsPerMaterial,
    upkeepFromRound: 2,
    maxLoot: tw.maxLoot,
    attackFlood: 0, // battles add Flood instead (claiming empty land is free)
    occupationFlood: 0,
    passivePerTile: tw.passivePerTile,
    sustainableBonus: tw.sustainableBonus,
    unsustainableBonus: tw.unsustainableBonus,
    damagedPenalty: 0,
    aidAmount: 0,
    sanctionRounds: 0,
    openTilesClaimable: true,
    stationedUnits: true,
    armyFloodPerUnits: 0,
    destructionFloodPerUnits: 0,
    capitalOpensAfter: tw.capitalOpensAfter,
  };
  return settings;
}

/**
 * Start a new game.
 *   players: [{ name, biome }] in seat order (biome: forest | quarry | riverbank | mixed)
 *   seed:    any whole number; the same seed + same actions = the same game
 */
function createGame({ mode = 'base', settings, players, seed = 1 }) {
  if (!MODES.includes(mode)) fail(`Unknown mode "${mode}".`);
  const scenario = mode === 'totalwar' && settings.totalwar && settings.totalwar.scenario && settings.totalwar.scenario !== 'none' ? settings.totalwar.scenario : null;
  const minPlayers = scenario ? 2 : 3;
  if (!Array.isArray(players) || players.length < minPlayers || players.length > 5) fail(scenario ? 'A scenario needs 2 to 5 players.' : 'Rising Tides needs 3 to 5 players.');
  if (scenario && !SCEN.SCENARIOS[scenario]) fail(`Unknown scenario "${scenario}".`);
  for (const p of players) if (!BIOMES[p.biome]) fail(`Unknown biome "${p.biome}".`);
  if (mode === 'totalwar') settings = totalWarSettings(JSON.parse(JSON.stringify(settings)));
  if (scenario) {
    // Scenarios: the war starts at once, runs the scenario's rounds, and the Flood is off.
    settings.totalwar.truceRounds = 0;
    settings.totalwar.rounds = SCEN.SCENARIOS[scenario].rounds;
    settings.war.rounds = SCEN.SCENARIOS[scenario].rounds;
  }
  const b = settings.base;

  const state = {
    mode,
    settings: JSON.parse(JSON.stringify(settings)),
    battles: [], // Total War: live battles this round
    battleQueueTW: [],
    nextBattleId: 1,
    rng: seed >>> 0,
    seq: 0, // log entry counter
    round: 1,
    phase: 'talk',
    startingPlayer: 0,
    flood: mode === 'base' ? settings.base.startingFlood : settings.general.startingFlood,
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
    // Diplomacy
    pacts: [],
    treaties: [],
    nextDiploId: 1,
    destroyedPool: 0, // units destroyed in battle that haven't added Flood yet
    floodFromArmies: 0,
    floodFromDestruction: 0,
    players: players.map((p, seat) => ({
      seat,
      name: p.name,
      biome: p.biome,
      bot: !!p.bot, // a computer player (Total War bot difficulty gives these extra income)
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
      hits: {}, // seat -> times that player raided/attacked this one (public)
      betrayals: 0, // pacts this player has broken (public)
      treatyBreaks: 0, // treaties this player has broken (public)
      research: { done: [], current: null }, // Total War: finished research and the project under way
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
        pactsMade: 0,
        pactsKept: 0,
        pactsBroken: 0,
        treatiesSigned: 0,
        treatiesBroken: 0,
        sustainable: 0,
        unsustainable: 0,
        raid: 0,
        claim: 0,
        claimsWon: 0,
        claimsLost: 0,
        factoriesBuilt: 0,
        greenFactories: 0,
        factoriesLost: 0,
        factoryMade: 0,
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
  const layout = mode === 'totalwar' ? settings.totalwar.boardLayout || 'standard19' : mode === 'base' ? settings.base.boardLayout || settings.general.boardLayout : settings.general.boardLayout;
  if (scenario) SCEN.setupScenario(state, scenario, settings.totalwar.scenarioStyle);
  else state.board = buildBoard(state, layout, mode !== 'base');
  if (mode !== 'base' && settings.war.stationedUnits && !scenario) {
    // Stationed units: everyone's starting militia stands on their capital.
    for (const p of state.players) state.board.tiles.find((t) => t.id === p.homeTile).units[p.seat] = p.units;
  }
  // Total War: everyone starts with one general on their capital.
  if (mode === 'totalwar') for (const p of state.players) war.newGeneral(state, p.seat, p.homeTile);
  const modeName = { base: 'Base', war: 'War', empire: 'War + Empire', totalwar: 'Total War' }[mode];
  if (scenario) {
    const sc = SCEN.SCENARIOS[scenario];
    addLog(state, `Scenario: ${sc.name} (${sc.styles[state.scenario.style].label}). ${sc.sides.map((side) => `${side.name}: ${state.players.filter((p) => p.side === side.id).map((p) => `${p.name} (${p.nation})`).join(', ')}`).join(' vs ')}.`, { kind: 'round' });
    for (const side of sc.sides) addLog(state, `🎯 ${sc.victory.text[side.id]}`, { kind: 'round' });
    addLog(state, `Round 1 begins. ${state.players[0].name} moves first. Talk & build, then press Ready.`, { kind: 'round' });
    return state;
  }
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
  if (state.phase === 'battle') {
    const seats = new Set();
    for (const b of state.battles || []) {
      if (b.status !== 'live') continue;
      if (!b.auto.A) seats.add(b.attacker);
      if (!b.auto.D) seats.add(b.defender);
    }
    return [...seats];
  }
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
  // Battles are public: anyone can watch. Send the territory as a short string, not the raw grids.
  if (state.mode === 'totalwar') v.battles = (state.battles || []).map(({ reach, territory, ...b }) => ({ ...b, terr: require('./totalwar').territoryString({ territory, reach }) }));
  diplomacy.decorateView(v, state, seat);
  factories.decorateView(v, state, seat);
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
  stepBattles: war.stepBattles,
  attackSources: war.attackSources,
  battleSnapshot: require('./totalwar').snapshot,
  troopsAt: war.troopsAt,
  production: war.production,
  attackTargets: war.attackTargets,
  defaultBiomeList,
  BUILD_PHASES: base.BUILD_PHASES,
  playtestRecord,
  recordToCsv,
};
