/**
 * TOTAL WAR ARSENAL: unit types, the research tree and upgrades
 * =============================================================
 * Facts about each unit that are not numbers live here (what it is, where it
 * fights, what research it needs). All the NUMBERS (cost, toughness, damage,
 * speed, range…) are in config.js -> totalwar.<unit>, so they show in the lobby.
 *
 * domain: 'land' | 'air' | 'sea'  — where the unit lives and fights
 * cls:    'soft' | 'armor' | 'air' | 'sea' — what kind of target it is
 * tech:   research needed before you can recruit it (null = from the start)
 * from:   the unit it can be UPGRADED from (pay the difference in cost)
 */
'use strict';

const UNITS = {
  militia: { name: 'Militia', domain: 'land', cls: 'soft', tech: null, shape: '●' },
  antitank: { name: 'Anti-tank', domain: 'land', cls: 'soft', tech: 'antiTank', from: 'militia', shape: '⊥' },
  antiair: { name: 'Anti-air', domain: 'land', cls: 'soft', tech: 'antiAir', from: 'militia', shape: '✱' },
  infantry: { name: 'Infantry', domain: 'land', cls: 'soft', tech: null, shape: '■' },
  motorised: { name: 'Motorised infantry', domain: 'land', cls: 'soft', tech: 'motorised', from: 'infantry', shape: '▣' },
  mechanised: { name: 'Mechanised infantry', domain: 'land', cls: 'armor', tech: 'mechanised', from: 'motorised', shape: '◩' },
  cavalry: { name: 'Cavalry', domain: 'land', cls: 'soft', tech: null, shape: '▲' },
  artillery: { name: 'Artillery', domain: 'land', cls: 'soft', tech: 'artillery', shape: '✚' },
  spArtillery: { name: 'Self-propelled artillery', domain: 'land', cls: 'armor', tech: 'selfPropelled', from: 'artillery', shape: '✜' },
  lightTank: { name: 'Light tank', domain: 'land', cls: 'armor', tech: 'lightTanks', from: 'cavalry', shape: '◆' },
  mediumTank: { name: 'Medium tank', domain: 'land', cls: 'armor', tech: 'mediumTanks', from: 'lightTank', shape: '⬢' },
  heavyTank: { name: 'Heavy tank', domain: 'land', cls: 'armor', tech: 'heavyTanks', from: 'mediumTank', shape: '⬣' },
  interceptor: { name: 'Interceptor', domain: 'air', cls: 'air', tech: 'aircraft', shape: '✈' },
  bomber: { name: 'Bomber', domain: 'air', cls: 'air', tech: 'aircraft', shape: '✈' },
  destroyer: { name: 'Destroyer', domain: 'sea', cls: 'sea', tech: 'shipyards', shape: '◗' },
  cruiser: { name: 'Cruiser', domain: 'sea', cls: 'sea', tech: 'cruisers', from: 'destroyer', shape: '◖' },
  battleship: { name: 'Battleship', domain: 'sea', cls: 'sea', tech: 'battleships', from: 'cruiser', shape: '⬬' },
};
const TYPES = Object.keys(UNITS);
const LAND = TYPES.filter((k) => UNITS[k].domain === 'land');
const AIR = TYPES.filter((k) => UNITS[k].domain === 'air');
const SEA = TYPES.filter((k) => UNITS[k].domain === 'sea');
const TANKS = ['lightTank', 'mediumTank', 'heavyTank'];
const FAST = ['cavalry', 'lightTank', 'mediumTank', 'heavyTank', 'motorised', 'mechanised'];
/** Long-range guns that sit at the back and shell from afar. */
const GUNS = ['artillery', 'spArtillery'];
const FOOT = ['militia', 'antitank', 'antiair', 'infantry', 'motorised', 'mechanised'];

/** The research tree. needs = research that must be finished first. */
const TECHS = {
  artillery: { name: 'Artillery', needs: [], unlocks: ['artillery'] },
  selfPropelled: { name: 'Self-propelled guns', needs: ['artillery', 'motorised'], unlocks: ['spArtillery'] },
  lightTanks: { name: 'Light tanks', needs: ['artillery'], unlocks: ['lightTank'] },
  mediumTanks: { name: 'Medium tanks', needs: ['lightTanks'], unlocks: ['mediumTank'] },
  heavyTanks: { name: 'Heavy tanks', needs: ['mediumTanks'], unlocks: ['heavyTank'] },
  motorised: { name: 'Motorised infantry', needs: [], unlocks: ['motorised'] },
  mechanised: { name: 'Mechanised infantry', needs: ['motorised'], unlocks: ['mechanised'] },
  aircraft: { name: 'Aircraft', needs: ['mechanised'], unlocks: ['interceptor', 'bomber'] },
  antiTank: { name: 'Anti-tank guns', needs: [], unlocks: ['antitank'] },
  antiAir: { name: 'Anti-air guns', needs: [], unlocks: ['antiair'] },
  shipyards: { name: 'Shipyards', needs: [], unlocks: ['destroyer'] },
  cruisers: { name: 'Cruisers', needs: ['shipyards'], unlocks: ['cruiser'] },
  battleships: { name: 'Battleships', needs: ['cruisers'], unlocks: ['battleship'] },
};
/**
 * UNIT LEVELS: these unit types can be improved from level 1 to MAX_LEVEL by research.
 * Each level is its own research project ("Light tank level 2", …), needs the level
 * before it, and makes EVERY unit of that type stronger at once (no rebuying).
 * How much stronger, and what each level costs, is in config.js (totalwar.level…).
 */
const MAX_LEVEL = 4;
const LEVELED = ['infantry', 'motorised', 'mechanised', 'artillery', 'spArtillery', 'lightTank', 'mediumTank', 'heavyTank', 'interceptor', 'bomber', 'destroyer', 'cruiser', 'battleship'];
const levelTech = (type, n) => `${type}L${n}`;
for (const type of LEVELED) {
  for (let n = 2; n <= MAX_LEVEL; n++) {
    const first = UNITS[type].tech ? [UNITS[type].tech] : [];
    TECHS[levelTech(type, n)] = { name: `${UNITS[type].name} level ${n}`, needs: n === 2 ? first : [levelTech(type, n - 1)], unlocks: [], level: { type, n } };
  }
}
const TECH_IDS = Object.keys(TECHS);

/** A player's level for a unit type (1 if never improved). */
function levelOf(p, type) {
  const done = (p && p.research && p.research.done) || [];
  let n = 1;
  while (n < MAX_LEVEL && done.includes(levelTech(type, n + 1))) n++;
  return n;
}
/** { type: level } for every type above level 1. */
function levelsOf(p) {
  const out = {};
  for (const type of LEVELED) {
    const n = levelOf(p, type);
    if (n > 1) out[type] = n;
  }
  return out;
}
/** Multiplier for a stat at a level: 1 + (level - 1) × pct%. */
function levelBoost(n, pct) {
  return 1 + ((n || 1) - 1) * (pct || 0) / 100;
}
/** What a research project costs (cfg = settings.totalwar). */
function techCost(cfg, id) {
  const T = TECHS[id];
  if (T && T.level) return (cfg.levelCost && cfg.levelCost[T.level.n]) || 4 + 2 * T.level.n;
  return cfg.research[id];
}

const zero = () => Object.fromEntries(TYPES.map((k) => [k, 0]));
const sum = (c) => TYPES.reduce((a, k) => a + ((c && c[k]) || 0), 0);

/** Has this player finished the research a unit type needs? */
function canBuild(p, type) {
  const u = UNITS[type];
  if (!u) return false;
  return !u.tech || ((p.research && p.research.done) || []).includes(u.tech);
}

/** Can `from` be upgraded to `to` (directly or along a chain, e.g. infantry -> mechanised)? */
function upgradePath(from, to) {
  let k = to;
  const seen = new Set();
  while (UNITS[k] && UNITS[k].from && !seen.has(k)) {
    seen.add(k);
    if (UNITS[k].from === from) return true;
    k = UNITS[k].from;
  }
  return false;
}

/**
 * Damage multiplier when `att` hits `def` (before terrain, formations, encirclement).
 * cfg = settings.totalwar. `cut` = the target is cut off from supply.
 */
function matchup(att, def, cfg, cut = false) {
  const A = UNITS[att];
  const D = UNITS[def];
  const a = cfg[att];
  if (D.domain === 'air') {
    if (A.domain === 'air') return att === 'interceptor' && def === 'bomber' ? 1.5 : att === 'bomber' ? (a.vsAirPct || 0) / 100 : 1;
    return (a.vsAirPct || 0) / 100; // only anti-air can hit aircraft from the ground
  }
  if (D.domain === 'sea') return A.domain === 'sea' ? 1 : 0;
  if (A.domain === 'sea') return 0; // ships only shell the coast (see bombardment)
  if (D.cls === 'armor') return (a.vsArmorPct ?? 100) / 100;
  // Soft targets
  if (att === 'cavalry' && def === 'militia') return cfg.cavalryVsMilitiaPct / 100;
  if (att === 'cavalry' && ['infantry', 'motorised', 'antitank', 'antiair'].includes(def)) return (cut ? cfg.cavalryVsCutOffInfantryPct : cfg.cavalryVsInfantryPct) / 100;
  return (a.vsSoftPct ?? 100) / 100; // specialists (anti-tank, anti-air) are poor against troops
}

module.exports = { UNITS, TYPES, LAND, AIR, SEA, TANKS, FAST, FOOT, GUNS, TECHS, TECH_IDS, MAX_LEVEL, LEVELED, levelTech, levelOf, levelsOf, levelBoost, techCost, zero, sum, canBuild, upgradePath, matchup };
