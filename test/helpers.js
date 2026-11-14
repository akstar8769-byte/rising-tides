'use strict';
// Shared helpers for the tests.
const engine = require('../engine');
const { cloneDefaults } = require('../config');

const NAMES = ['Ana', 'Ben', 'Cara', 'Dev', 'Eli'];
const BIOMES4 = ['forest', 'quarry', 'riverbank', 'mixed', 'forest'];

/** New game. opts: { n, biomes, settings: fn(settings) to tweak, seed } */
function newGame(opts = {}) {
  const n = opts.n || 3;
  const settings = cloneDefaults();
  // The older Base tests check the rulebook game: Flood starts at 2, no factories.
  // Factory tests pass { factories: true } to get the playtest defaults.
  if (!opts.factories) {
    settings.base.startingFlood = 2;
    settings.base.factoriesEnabled = false;
    // ...on the rulebook's 19-tile board, with the rulebook's Flood rule (each Unsustainable +1).
    settings.base.boardLayout = 'standard19';
    settings.base.floodByMajority = false;
  }
  // Factory tests check the first in-person playtest (v1.1: Flood 5, 19 tiles, every factory
  // moving the Flood); the current Base rules are tested with { latest: true }.
  if (opts.factories && !opts.latest) {
    Object.assign(settings.base, { startingFlood: 5, boardLayout: 'standard19', floodByMajority: false, factorySusMakes: 1, factoryUnsPer: 1 });
  }
  // Older Total War tests attack in round 1; truce tests pass { truce: true }.
  if (!opts.truce) settings.totalwar.truceRounds = 0;
  // Older Total War tests use the 37-hex sea board's tile names; ocean tests pass { oceans: true }.
  if (!opts.oceans) settings.totalwar.boardLayout = 'sea37';
  // Older Empire tests check provinces going back to the puppet; the new rule passes { takeAll: true }.
  if (!opts.takeAll) settings.empire.capitalTakesAll = false;
  if (opts.settings) opts.settings(settings);
  const biomes = opts.biomes || BIOMES4.slice(0, n);
  return engine.createGame({
    mode: opts.mode || 'base',
    settings,
    players: biomes.map((b, i) => ({ name: NAMES[i], biome: b })),
    seed: opts.seed || 42,
  });
}

/** Apply an action and return the new state. */
function act(state, actor, type, extra = {}) {
  return engine.applyAction(state, actor, { type, ...extra });
}

/** Everyone presses Ready. */
function allReady(state) {
  for (const p of state.players) if (!p.ready) state = act(state, p.seat, 'ready');
  return state;
}

/** Everyone chooses; `choices` maps seat -> choose payload (default Sustainable). */
function allChoose(state, choices = {}) {
  for (const p of state.players) {
    const c = choices[p.seat] || { action: 'sustainable', mix: p.biome === 'mixed' ? { wood: 1, stone: 1 } : undefined };
    state = act(state, p.seat, 'choose', c);
  }
  return state;
}

/** Set a player's materials directly (tests only). */
function setMats(state, seat, mats) {
  const s = structuredClone(state);
  s.players[seat].materials = { wood: 0, stone: 0, sandbag: 0, ...mats };
  return s;
}

/** Preload dice results (tests only). */
function forceDice(state, dice) {
  const s = structuredClone(state);
  s.forcedDice = dice.slice();
  return s;
}

const U4 = { wood: 2, stone: 1, sandbag: 1 }; // a 4-material Unsustainable mix

module.exports = { engine, newGame, act, allReady, allChoose, setMats, forceDice, U4 };
