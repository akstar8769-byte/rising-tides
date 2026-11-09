/**
 * Small helpers shared by the rules engine: errors, material "bags",
 * the seeded dice roller and the event log.
 */
'use strict';

/** Thrown when a player tries something the rules don't allow. */
class RuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuleError';
  }
}
function fail(message) {
  throw new RuleError(message);
}

// ---------- Materials ----------
// A "bag" is an object like { wood: 2, stone: 0, sandbag: 1 }.

const MATERIALS = ['wood', 'stone', 'sandbag'];

function emptyBag() {
  return { wood: 0, stone: 0, sandbag: 0 };
}

/** Check a bag sent by a player and return a clean copy (or throw). */
function cleanBag(input, what = 'materials') {
  if (!input || typeof input !== 'object') fail(`Invalid ${what}.`);
  for (const k of Object.keys(input)) {
    if (!MATERIALS.includes(k)) fail(`Unknown material "${k}".`);
  }
  const bag = emptyBag();
  for (const m of MATERIALS) {
    const v = input[m] === undefined ? 0 : input[m];
    if (!Number.isInteger(v) || v < 0 || v > 999) fail(`Invalid amount of ${m}.`);
    bag[m] = v;
  }
  return bag;
}

function bagTotal(b) {
  return b.wood + b.stone + b.sandbag;
}
function hasBag(have, need) {
  return MATERIALS.every((m) => have[m] >= need[m]);
}
function addBag(into, b) {
  for (const m of MATERIALS) into[m] += b[m];
  return into;
}
function subBag(from, b) {
  for (const m of MATERIALS) from[m] -= b[m];
  return from;
}
function scaleBag(b, k) {
  return { wood: b.wood * k, stone: b.stone * k, sandbag: b.sandbag * k };
}
/** "2 wood, 1 stone, 3 sandbags" */
function describeBag(b) {
  const parts = MATERIALS.filter((m) => b[m] > 0).map((m) => {
    const name = m === 'sandbag' && b[m] !== 1 ? 'sandbags' : m;
    return `${b[m]} ${name}`;
  });
  return parts.length ? parts.join(', ') : 'nothing';
}

// ---------- Randomness ----------
// The game keeps its own random-number state (state.rng), so the server
// rolls all dice and a whole game can be replayed from its seed.
// The rng value is never sent to players, so nobody can predict rolls.

function nextRandom(state) {
  // mulberry32: a tiny, well-known seeded random generator
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randomInt(state, n) {
  return Math.floor(nextRandom(state) * n);
}
/** Roll one die. Tests can preload results in state.forcedDice. */
function rollDie(state) {
  if (state.forcedDice && state.forcedDice.length) return state.forcedDice.shift();
  return 1 + randomInt(state, state.settings.general.diceSides);
}

// ---------- Log ----------
/** Add a plain-English line to the game log. `extra` can hold dice etc. */
function addLog(state, text, extra = {}) {
  state.seq += 1;
  state.log.push({ id: state.seq, round: state.round, text, ...extra });
}

module.exports = {
  RuleError,
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
  nextRandom,
  randomInt,
  rollDie,
  addLog,
};
