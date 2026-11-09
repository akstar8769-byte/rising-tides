/**
 * RISING TIDES — GAME SETTINGS
 * ============================
 * Every number in the game lives in this file. These are the DEFAULT values.
 * The host can change any of them in the lobby before a game starts, so for a
 * one-off test you don't need to edit this file at all. Edit it when you want
 * to change the defaults for everyone.
 *
 * Rules for editing:
 *  - Numbers must be whole numbers (no decimals).
 *  - If you add a new setting, also add a label for it in LABELS below, so it
 *    shows up nicely in the lobby, and (if needed) a min/max in LIMITS.
 *  - Settings are grouped: "general" applies to every mode, "base" to the base
 *    game, "war" to War mode, "empire" to War + Empire mode.
 *
 * War values are used in War and War + Empire modes; Empire values only in
 * War + Empire mode. How unclear rules were decided: see RULE_NOTES.md.
 */
'use strict';

const DEFAULTS = {
  general: {
    startingFlood: 2,            // Flood level at the start of the game
    diceSides: 6,                // sides on each die (6 = normal die)
    lootPickSeconds: 30,         // seconds a winning raider has to pick loot before it is chosen at random (Q2)
    hostHandoverSeconds: 60,     // if the host is disconnected this long, another player becomes host
    botThinkMs: 900,             // how long bots "think" before each move, in milliseconds
    hideOtherMaterials: false,   // true = you only see the TOTAL number of materials other players hold
    boardLayout: 'standard19',   // which board layout to use (see engine/layouts.js)
  },

  base: {
    rounds: 7,                   // number of rounds in a Base game
    catastrophe: { 3: 8, 4: 9, 5: 10 }, // Flood level that destroys everyone, by player count

    startWalls: 1,               // walls each player starts with
    startWood: 1,                // starting wood
    startStone: 1,               // starting stone
    startSandbag: 1,             // starting sandbags

    wallCostWood: 2,             // a wall costs this much wood...
    wallCostStone: 1,            // ...this much stone...
    wallCostSandbag: 1,          // ...and this many sandbags
    wallProtection: 2,           // protection each wall gives

    sustainableCollect: 2,       // Sustainable: materials of your home resource collected (Mixed: any mix)
    unsustainableCollect: 4,     // Unsustainable: materials collected, any mix
    unsustainableFlood: 1,       // Flood rise for each Unsustainable action

    raidCostWood: 1,             // wood the raider pays when the raid resolves
    raidDefenceWood: 1,          // wood the defender pays (if they have it) to roll a defence die
    raidMaxLoot: 3,              // most tokens a winning raider can take

    marketGive: 3,               // market: give this many of ONE material...
    marketGet: 1,                // ...to get this many of any other material

    seawallPerStep: 6,           // materials donated (by everyone, in total) per +1 catastrophe threshold
    seawallMaxSteps: 3,          // most the seawall can raise the threshold in one game
    seawallPointsPerMaterial: 1, // points scored per material YOU donated

    stormEnabled: false,         // optional Storm ending (off by default)
    stormFromRound: 6,           // first round whose end triggers a storm roll
    stormEndMax: 2,              // the game ends if the storm die shows this number or lower (2 = "1-2 ends it")
  },

  // ---- War and War + Empire modes ----
  war: {
    rounds: 8,
    catastrophe: { 3: 19, 4: 20, 5: 21 }, // 4p from the PDF; 3p and 5p are guesses (Q10)
    accordLine: 10,              // Climate Accord breaks when the Flood reaches this
    startUnits: 1,
    unitCost: 2,                 // materials (any mix) per militia unit
    upkeepUnitsPerMaterial: 3,   // pay 1 material per this many units, rounded down
    upkeepFromRound: 2,
    maxAttackDice: 3,
    maxDefenceDice: 2,
    capitalExtraDefenceDice: 1,
    maxLoot: 3,
    attackFlood: 1,
    occupationFlood: 0,          // Flood rise per occupying player per round (PDF: 1; team chose 0)
    armyFloodPerUnits: 5,        // army emissions: Flood +1 per this many units a player owns, every upkeep (0 = off)
    destructionFloodPerUnits: 2, // Flood +1 for every this many units destroyed in battle (0 = off)
    capitalOpensAfter: 1,        // provinces that must be occupied before a capital can be attacked (PDF: 2)
    passivePerTile: 1,           // every tile you hold gives this much of its resource EVERY round, whatever you play
    sustainableBonus: 2,         // Sustainable adds this much of your home resource on top
    unsustainableBonus: 6,       // Unsustainable adds this much, any mix, on top (and Flood +1)
    damagedPenalty: 1,
    aidAmount: 1,
    sanctionRounds: 1,
    openTilesClaimable: true,    // false = open tiles are impassable (Q8)
    stationedUnits: true,        // true = units stand on tiles and fight only where they are (like Risk);
                                 // false = one army that defends everywhere at once (the PDF's rules)
  },

  // ---- War + Empire mode only ----
  empire: {
    garrisonCost: { 1: 1, 2: 3, 3: 6, 4: 10 }, // total upkeep for holding N puppets
    tributeDivisor: 2,           // overlord gets 1/this of puppet income, rounded UP
    captureStockDivisor: 2,      // capturing a capital takes 1/this of the stockpile, rounded DOWN
    revoltLoot: 3,
    productionAccess: true,      // PDF W8.2 "production access" on/off (Q21)
  },
};

/** Human-readable names shown in the lobby. Key = "group.setting". */
const LABELS = {
  'general.startingFlood': 'Starting Flood level',
  'general.diceSides': 'Sides on each die',
  'general.lootPickSeconds': 'Seconds to pick loot',
  'general.hostHandoverSeconds': 'Seconds before an absent host is replaced',
  'general.botThinkMs': 'Bot thinking time (milliseconds)',
  'general.hideOtherMaterials': "Hide other players' exact materials",
  'general.boardLayout': 'Board layout',

  'base.rounds': 'Number of rounds',
  'base.catastrophe.3': 'Catastrophe threshold (3 players)',
  'base.catastrophe.4': 'Catastrophe threshold (4 players)',
  'base.catastrophe.5': 'Catastrophe threshold (5 players)',
  'base.startWalls': 'Starting walls',
  'base.startWood': 'Starting wood',
  'base.startStone': 'Starting stone',
  'base.startSandbag': 'Starting sandbags',
  'base.wallCostWood': 'Wall cost: wood',
  'base.wallCostStone': 'Wall cost: stone',
  'base.wallCostSandbag': 'Wall cost: sandbags',
  'base.wallProtection': 'Protection per wall',
  'base.sustainableCollect': 'Sustainable: materials collected',
  'base.unsustainableCollect': 'Unsustainable: materials collected',
  'base.unsustainableFlood': 'Unsustainable: Flood rise',
  'base.raidCostWood': 'Raid: wood paid by raider',
  'base.raidDefenceWood': 'Raid: wood paid by defender',
  'base.raidMaxLoot': 'Raid: most tokens stolen',
  'base.marketGive': 'Market: materials given',
  'base.marketGet': 'Market: materials received',
  'base.seawallPerStep': 'Seawall: donations per +1 threshold',
  'base.seawallMaxSteps': 'Seawall: max threshold bonus',
  'base.seawallPointsPerMaterial': 'Seawall: points per material donated',
  'base.stormEnabled': 'Storm ending',
  'base.stormFromRound': 'Storm: first round to roll',
  'base.stormEndMax': 'Storm: game ends on this roll or lower',

  'war.rounds': 'Number of rounds',
  'war.catastrophe.3': 'Catastrophe threshold (3 players)',
  'war.catastrophe.4': 'Catastrophe threshold (4 players)',
  'war.catastrophe.5': 'Catastrophe threshold (5 players)',
  'war.accordLine': 'Climate Accord line (Flood)',
  'war.startUnits': 'Starting militia units',
  'war.unitCost': 'Materials per unit',
  'war.upkeepUnitsPerMaterial': 'Upkeep: units per 1 material',
  'war.upkeepFromRound': 'Upkeep starts in round',
  'war.maxAttackDice': 'Max attack dice',
  'war.maxDefenceDice': 'Max defence dice',
  'war.capitalExtraDefenceDice': 'Capital: extra defence dice',
  'war.maxLoot': 'Most tokens taken per win',
  'war.attackFlood': 'Flood rise per attack',
  'war.occupationFlood': 'Flood rise per occupying player',
  'war.passivePerTile': 'Income from each tile you hold, every round',
  'war.sustainableBonus': 'Sustainable: extra home resource',
  'war.unsustainableBonus': 'Unsustainable: extra materials (any mix)',
  'war.capitalOpensAfter': 'Capital can be attacked after this many provinces fall',
  'war.armyFloodPerUnits': 'Army emissions: Flood +1 per this many units (0 = off)',
  'war.destructionFloodPerUnits': 'Destruction: Flood +1 per this many units destroyed (0 = off)',
  'war.damagedPenalty': 'Damaged: materials lost',
  'war.aidAmount': 'International aid: extra materials',
  'war.sanctionRounds': 'Sanction length (rounds)',
  'war.openTilesClaimable': 'Open tiles can be claimed (off = impassable)',
  'war.stationedUnits': 'Units are stationed on tiles (off = one army everywhere)',

  'empire.garrisonCost.1': 'Garrison cost: 1 puppet',
  'empire.garrisonCost.2': 'Garrison cost: 2 puppets',
  'empire.garrisonCost.3': 'Garrison cost: 3 puppets',
  'empire.garrisonCost.4': 'Garrison cost: 4 puppets',
  'empire.tributeDivisor': 'Tribute: 1 / this, rounded up',
  'empire.captureStockDivisor': 'Capture: take 1 / this of stockpile',
  'empire.revoltLoot': 'Revolt: most tokens taken',
  'empire.productionAccess': 'Overlord production access',
};

/** Allowed ranges. Anything not listed here may be 0 to 999. */
const LIMITS = {
  'general.diceSides': [2, 20],
  'general.lootPickSeconds': [5, 600],
  'general.hostHandoverSeconds': [5, 3600],
  'general.botThinkMs': [0, 10000],
  'base.rounds': [1, 50],
  'base.catastrophe.3': [1, 999],
  'base.catastrophe.4': [1, 999],
  'base.catastrophe.5': [1, 999],
  'base.marketGive': [1, 99],
  'base.seawallPerStep': [1, 999],
  'base.stormFromRound': [1, 50],
  'war.rounds': [1, 50],
  'war.upkeepUnitsPerMaterial': [1, 99],
  'war.maxAttackDice': [1, 10],
  'war.maxDefenceDice': [1, 10],
  'war.capitalOpensAfter': [1, 9],
  'empire.tributeDivisor': [1, 10],
  'empire.captureStockDivisor': [1, 10],
};

/** Allowed values for text settings. */
const OPTIONS = {
  'general.boardLayout': ['standard19'],
};

/** Which settings groups each game mode uses (the lobby only shows these). */
const GROUPS_FOR_MODE = {
  base: ['general', 'base'],
  war: ['general', 'base', 'war'],
  empire: ['general', 'base', 'war', 'empire'],
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

/** Read a value by "a.b.c" path. Returns undefined if it doesn't exist. */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Return a copy of `settings` with one value changed, after checking it.
 * Throws an Error with a friendly message if the value isn't allowed.
 */
function setSetting(settings, path, value) {
  const def = getPath(DEFAULTS, path);
  if (def === undefined || (typeof def === 'object' && def !== null)) {
    throw new Error(`Unknown setting "${path}".`);
  }
  let clean;
  if (typeof def === 'boolean') {
    clean = value === true || value === 'true';
  } else if (typeof def === 'number') {
    const n = Number(value);
    const [min, max] = LIMITS[path] || [0, 999];
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new Error(`"${LABELS[path] || path}" must be a whole number from ${min} to ${max}.`);
    }
    clean = n;
  } else {
    const allowed = OPTIONS[path] || [def];
    if (!allowed.includes(value)) throw new Error(`"${value}" is not an allowed value.`);
    clean = value;
  }
  const copy = JSON.parse(JSON.stringify(settings));
  const keys = path.split('.');
  let o = copy;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = clean;
  return copy;
}

module.exports = { DEFAULTS, LABELS, LIMITS, OPTIONS, GROUPS_FOR_MODE, cloneDefaults, getPath, setSetting };
