/**
 * RISING TIDES — GAME SETTINGS
 * ============================
 * Every number in the game lives in this file. These are the DEFAULT values.
 * The host can change any of them in the lobby before a game starts, so for a
 * one-off test you don't need to edit this file at all. Edit it when you want
 * to change the defaults for everyone.
 *
 * Rules for editing:
 *  - Numbers must be whole numbers, except the few listed in DECIMALS (one decimal place).
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
    startingFlood: 2,            // Flood level at the start of War / War + Empire / Total War (Base has its own)
    diceSides: 6,                // sides on each die (6 = normal die)
    lootPickSeconds: 30,         // seconds a winning raider has to pick loot before it is chosen at random (Q2)
    hostHandoverSeconds: 60,     // if the host is disconnected this long, another player becomes host
    botThinkMs: 900,             // how long bots "think" before each move, in milliseconds
    hideOtherMaterials: false,   // true = you only see the TOTAL number of materials other players hold
    boardLayout: 'standard19',   // which board layout to use (see engine/layouts.js)
    pactsEnabled: true,          // players can make (non-binding) pacts with each other
    maxPactRounds: 3,            // longest pact allowed, in rounds
    treatiesEnabled: false,      // TREATIES: written rules the game holds signatories to (see engine/diplomacy.js)
    treatyBreakPenalty: 3,       // materials lost when you openly break a treaty
  },

  base: {
    rounds: 7,                   // number of rounds in a Base game
    startingFlood: 5,            // Flood level at the start of a Base game (playtest change)
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

    // Factories (Base game). Built during Talk & Build / Trade & Build on your home tile
    // or an empty tile next to your home or one of your factories — that's how you expand.
    factoriesEnabled: true,
    factorySusWood: 1,           // a SUSTAINABLE factory costs this much wood...
    factorySusStone: 2,          // ...stone...
    factorySusSandbag: 1,        // ...and sandbags
    factorySusMakes: 1,          // materials it makes every round (its tile's resource)
    factoryUnsWood: 1,           // an UNSUSTAINABLE factory costs this much wood...
    factoryUnsStone: 1,          // ...stone...
    factoryUnsSandbag: 0,        // ...and sandbags
    factoryUnsMakes: 2,          // materials it makes every round
    factoryUnsMax: 3,            // most unsustainable factories one player may own
    factoryUnsFlood: 1,          // Flood rise per unsustainable factory, every round
    factoryGreenPer: 3,          // every this many sustainable factories on the board (everyone's together)...
    factoryGreenDrop: 1,         // ...lower the Flood this much every round
    claimCostWood: 1,            // wood paid to try to claim someone's factory

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

  // ---- Total War mode only (a just-for-fun mode where war is the point) ----
  totalwar: {
    rounds: 18,                  // longer games so research has time to pay off
    catastrophe: { 3: 28, 4: 30, 5: 32 }, // light Flood: the line is much higher than in War
    battleFlood: 1,              // Flood rise for each real battle (claiming empty land is free)
    passivePerTile: 1,           // every tile you hold gives this much of its resource every round
    occupiedBonus: 1,            // PLUNDER: conquered tiles give this much extra every round
    sustainableBonus: 2,         // Sustainable adds this much of your home resource
    unsustainableBonus: 6,       // Unsustainable adds this much, any mix (Flood +1)
    maxLoot: 6,                  // most tokens taken from the loser of a battle
    warSpoils: 3,                // materials from the bank for every province or capital you take
    upkeepPointsPerMaterial: 4,  // pay 1 material per this many upkeep points (see unit upkeep below)
    startMilitia: 2,             // militia each player starts with, on their capital
    capitalOpensAfter: 1,        // provinces that must fall before a capital can be attacked
    truceRounds: 2,              // opening truce: no attacks on other players in the first this-many rounds (empty land is fine)
    boardLayout: 'sea37',        // Total War board: 37 hexes with sea bays between the players
    // Unit types (what each one is: engine/arsenal.js). cost = materials to recruit,
    // upkeep = upkeep points, hp = toughness, attack = damage per second in battle,
    // speed = map squares per second, range = shooting range (0 = must be in contact),
    // vsArmorPct = damage against tanks / mechanised, vsAirPct = damage against aircraft.
    militia: { cost: 2, upkeep: 1, hp: 10, attack: 1, speed: 3, range: 0, vsArmorPct: 30, vsAirPct: 0 },
    antitank: { cost: 4, upkeep: 1, hp: 12, attack: 1, speed: 2.5, range: 0, vsArmorPct: 300, vsAirPct: 0 },
    antiair: { cost: 4, upkeep: 1, hp: 12, attack: 0.8, speed: 2.5, range: 7, vsArmorPct: 30, vsAirPct: 250 },
    infantry: { cost: 4, upkeep: 1, hp: 18, attack: 1.5, speed: 2.5, range: 0, vsArmorPct: 40, vsAirPct: 0 },
    motorised: { cost: 5, upkeep: 1, hp: 20, attack: 1.6, speed: 4, range: 0, vsArmorPct: 50, vsAirPct: 0 },
    mechanised: { cost: 7, upkeep: 2, hp: 26, attack: 1.8, speed: 4, range: 0, vsArmorPct: 80, vsAirPct: 0 },
    cavalry: { cost: 5, upkeep: 2, hp: 12, attack: 1.5, speed: 5, range: 0, vsArmorPct: 20, vsAirPct: 0 },
    artillery: { cost: 6, upkeep: 1, hp: 10, attack: 2.2, speed: 1.8, range: 14, vsArmorPct: 60, vsAirPct: 0 },
    lightTank: { cost: 6, upkeep: 2, hp: 20, attack: 2.4, speed: 5, range: 0, vsArmorPct: 100, vsAirPct: 0 },
    mediumTank: { cost: 8, upkeep: 2, hp: 30, attack: 3, speed: 4.5, range: 0, vsArmorPct: 120, vsAirPct: 0 },
    heavyTank: { cost: 11, upkeep: 3, hp: 45, attack: 4, speed: 3, range: 0, vsArmorPct: 150, vsAirPct: 0 },
    interceptor: { cost: 6, upkeep: 2, hp: 14, attack: 3, speed: 9, range: 0, vsArmorPct: 0, vsAirPct: 100 },
    bomber: { cost: 8, upkeep: 2, hp: 16, attack: 4, speed: 7, range: 0, vsArmorPct: 120, vsAirPct: 30 },
    destroyer: { cost: 6, upkeep: 2, hp: 20, attack: 2, speed: 6, range: 0, vsArmorPct: 0, vsAirPct: 0 },
    cruiser: { cost: 9, upkeep: 2, hp: 32, attack: 3, speed: 5, range: 6, vsArmorPct: 0, vsAirPct: 0 },
    battleship: { cost: 13, upkeep: 3, hp: 55, attack: 5, speed: 3.5, range: 10, vsArmorPct: 0, vsAirPct: 0 },
    // Research: materials (any mix) to research each technology; it is ready next round.
    research: { artillery: 5, lightTanks: 6, mediumTanks: 8, heavyTanks: 10, motorised: 5, mechanised: 7, aircraft: 8, antiTank: 4, antiAir: 4, shipyards: 5, cruisers: 7, battleships: 10 },
    // Formations: bonuses while a formation is in use (100 = no change).
    formations: {
      line: { attackPct: 100, defencePct: 115, speedPct: 100 },
      square: { attackPct: 90, defencePct: 130, speedPct: 70 },
      wedge: { attackPct: 115, defencePct: 95, speedPct: 105 },
      pincer: { attackPct: 110, defencePct: 100, speedPct: 100 },
      spearhead: { attackPct: 125, defencePct: 100, speedPct: 115 },
      combined: { attackPct: 112, defencePct: 108, speedPct: 100 },
      firebase: { attackPct: 110, defencePct: 110, speedPct: 90 },
    },
    airBattleSeconds: 45,        // an air battle lasts at most this long
    artilleryMeleeAttackPct: 15,  // artillery caught up close does only this % of its damage...
    artilleryMeleeDamageTakenPct: 150, // ...and takes this % damage (guns being overrun)
    bombardPct: 35,              // cruisers and battleships next to a coastal battle shell it at this % of their attack
    amphibious: true,            // troops may attack a coast across a sea bay your ships hold
    dotsPerUnit: 3,              // each unit appears as this many dots on the battlefield (1-6)
    cavalryVsMilitiaPct: 150,    // cavalry rides down militia...
    cavalryVsInfantryPct: 70,    // ...but infantry stand firm against it...
    cavalryVsCutOffInfantryPct: 150, // ...unless the infantry are encircled (cut off from supply)
    // Battles
    battleSpeedPct: 60,          // how fast battles play (100 = original pace); all timers stretch to match
    battleSeconds: 120,          // a battle lasts at most this long; then the defender holds
    captureSeconds: 10,          // attackers holding the objective alone this long win
    surrenderSeconds: 8,         // units cut off from supply this long surrender
    cutOffDamagePct: 175,        // damage taken by units cut off from supply (encircled)
    flankDamagePct: 140,         // damage taken by units attacked from two sides
    forestDefencePct: 130,       // forests and hills protect whoever stands in them
    hillDefencePct: 140,
    // Scoring after the last round
    scoreTile: 2,                // points per tile you hold
    scoreCapital: 3,             // extra points per enemy capital you hold
    scoreHome: 5,                // bonus if your own capital is still yours and above the Flood
    scoreMaterialsPer: 3,        // 1 point per this many spare materials
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
  'general.startingFlood': 'Starting Flood level (War modes)',
  'general.diceSides': 'Sides on each die',
  'general.lootPickSeconds': 'Seconds to pick loot',
  'general.hostHandoverSeconds': 'Seconds before an absent host is replaced',
  'general.botThinkMs': 'Bot thinking time (milliseconds)',
  'general.hideOtherMaterials': "Hide other players' exact materials",
  'general.boardLayout': 'Board layout',
  'general.pactsEnabled': 'Pacts (non-binding promises between players)',
  'general.maxPactRounds': 'Longest pact (rounds)',
  'general.treatiesEnabled': 'Treaties (rules the game holds signatories to)',
  'general.treatyBreakPenalty': 'Materials lost for breaking a treaty',

  'base.rounds': 'Number of rounds',
  'base.startingFlood': 'Starting Flood level',
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
  'base.factoriesEnabled': 'Factories (build to expand; claim with dice)',
  'base.factorySusWood': 'Sustainable factory cost: wood',
  'base.factorySusStone': 'Sustainable factory cost: stone',
  'base.factorySusSandbag': 'Sustainable factory cost: sandbags',
  'base.factorySusMakes': 'Sustainable factory: materials per round',
  'base.factoryUnsWood': 'Unsustainable factory cost: wood',
  'base.factoryUnsStone': 'Unsustainable factory cost: stone',
  'base.factoryUnsSandbag': 'Unsustainable factory cost: sandbags',
  'base.factoryUnsMakes': 'Unsustainable factory: materials per round',
  'base.factoryUnsMax': 'Most unsustainable factories per player',
  'base.factoryUnsFlood': 'Flood rise per unsustainable factory each round',
  'base.factoryGreenPer': 'Sustainable factories (all players) per Flood drop',
  'base.factoryGreenDrop': 'Flood drop each round per group of sustainable factories',
  'base.claimCostWood': 'Claim a factory: wood paid',
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

  'totalwar.rounds': 'Number of rounds',
  'totalwar.catastrophe.3': 'Catastrophe threshold (3 players)',
  'totalwar.catastrophe.4': 'Catastrophe threshold (4 players)',
  'totalwar.catastrophe.5': 'Catastrophe threshold (5 players)',
  'totalwar.battleFlood': 'Flood rise per battle',
  'totalwar.passivePerTile': 'Income from each tile, every round',
  'totalwar.occupiedBonus': 'Plunder: extra income per conquered tile',
  'totalwar.sustainableBonus': 'Sustainable: extra home resource',
  'totalwar.unsustainableBonus': 'Unsustainable: extra materials (any mix)',
  'totalwar.maxLoot': 'Most tokens taken per battle won',
  'totalwar.warSpoils': 'War spoils from the bank per tile taken',
  'totalwar.upkeepPointsPerMaterial': 'Upkeep: points per 1 material',
  'totalwar.startMilitia': 'Starting militia',
  'totalwar.capitalOpensAfter': 'Capital can be attacked after this many provinces fall',
  'totalwar.truceRounds': 'Opening truce: rounds with no attacks on players',
  'totalwar.battleSpeedPct': 'Battle speed (%, 100 = original pace)',
  'totalwar.militia.cost': 'Militia: cost',
  'totalwar.militia.upkeep': 'Militia: upkeep points',
  'totalwar.militia.hp': 'Militia: toughness (HP)',
  'totalwar.militia.attack': 'Militia: damage per second',
  'totalwar.militia.speed': 'Militia: speed',
  'totalwar.infantry.cost': 'Infantry: cost',
  'totalwar.infantry.upkeep': 'Infantry: upkeep points',
  'totalwar.infantry.hp': 'Infantry: toughness (HP)',
  'totalwar.infantry.attack': 'Infantry: damage per second',
  'totalwar.infantry.speed': 'Infantry: speed',
  'totalwar.cavalry.cost': 'Cavalry: cost',
  'totalwar.cavalry.upkeep': 'Cavalry: upkeep points',
  'totalwar.cavalry.hp': 'Cavalry: toughness (HP)',
  'totalwar.cavalry.attack': 'Cavalry: damage per second',
  'totalwar.cavalry.speed': 'Cavalry: speed',
  'totalwar.cavalryVsMilitiaPct': 'Cavalry damage vs militia (%)',
  'totalwar.cavalryVsInfantryPct': 'Cavalry damage vs infantry (%)',
  'totalwar.cavalryVsCutOffInfantryPct': 'Cavalry damage vs encircled infantry (%)',
  'totalwar.dotsPerUnit': 'Dots per unit on the battlefield',
  'totalwar.battleSeconds': 'Battle time limit (seconds)',
  'totalwar.captureSeconds': 'Seconds to capture the objective',
  'totalwar.surrenderSeconds': 'Seconds cut off before surrendering',
  'totalwar.cutOffDamagePct': 'Damage taken when cut off (%)',
  'totalwar.flankDamagePct': 'Damage taken when flanked (%)',
  'totalwar.forestDefencePct': 'Forest protection (%)',
  'totalwar.hillDefencePct': 'Hill protection (%)',
  'totalwar.scoreTile': 'Score: points per tile',
  'totalwar.scoreCapital': 'Score: extra per enemy capital held',
  'totalwar.scoreHome': 'Score: bonus for a safe home',
  'totalwar.scoreMaterialsPer': 'Score: materials per point',

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
  'base.factoryGreenPer': [1, 50],
  'general.diceSides': [2, 20],
  'general.lootPickSeconds': [5, 600],
  'general.hostHandoverSeconds': [5, 3600],
  'general.botThinkMs': [0, 10000],
  'general.maxPactRounds': [1, 20],
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
  'totalwar.rounds': [1, 50],
  'totalwar.upkeepPointsPerMaterial': [1, 99],
  'totalwar.militia.cost': [1, 99],
  'totalwar.infantry.cost': [1, 99],
  'totalwar.cavalry.cost': [1, 99],
  'totalwar.militia.hp': [1, 999],
  'totalwar.infantry.hp': [1, 999],
  'totalwar.cavalry.hp': [1, 999],
  'totalwar.dotsPerUnit': [1, 6],
  'totalwar.militia.speed': [1, 30],
  'totalwar.infantry.speed': [1, 30],
  'totalwar.cavalry.speed': [1, 30],
  'totalwar.battleSeconds': [20, 600],
  'totalwar.captureSeconds': [1, 120],
  'totalwar.surrenderSeconds': [1, 120],
  'totalwar.capitalOpensAfter': [1, 9],
  'totalwar.truceRounds': [0, 20],
  'totalwar.battleSpeedPct': [20, 200],
  'totalwar.scoreMaterialsPer': [1, 99],
  'empire.captureStockDivisor': [1, 10],
};

/** Settings that may have one decimal place (unit damage and speed in Total War). */
const DECIMALS = [];

/** Allowed values for text settings. */
const OPTIONS = {
  'general.boardLayout': ['standard19'],
  'totalwar.boardLayout': ['sea37', 'standard19'],
};

// Total War units, research and formations: labels and limits are generated.
const ARSENAL = require('./engine/arsenal');
for (const [k, u] of Object.entries(ARSENAL.UNITS)) {
  const names = { cost: 'cost', upkeep: 'upkeep points', hp: 'toughness (HP)', attack: 'damage per second', speed: 'speed', range: 'range (0 = melee)', vsArmorPct: 'damage vs armour (%)', vsAirPct: 'damage vs aircraft (%)' };
  for (const [f, n] of Object.entries(names)) LABELS[`totalwar.${k}.${f}`] = `${u.name}: ${n}`;
  LIMITS[`totalwar.${k}.cost`] = [1, 99];
  LIMITS[`totalwar.${k}.hp`] = [1, 999];
  LIMITS[`totalwar.${k}.speed`] = [0.5, 30];
  DECIMALS.push(`totalwar.${k}.attack`, `totalwar.${k}.speed`);
}
for (const [k, t] of Object.entries(ARSENAL.TECHS)) LABELS[`totalwar.research.${k}`] = `Research cost: ${t.name}`;
const FORMATION_NAMES = { line: 'Line', square: 'Defensive square', wedge: 'Wedge', pincer: 'Pincer', spearhead: 'Armour spearhead', combined: 'Combined arms', firebase: 'Artillery screen' };
for (const [k, n] of Object.entries(FORMATION_NAMES)) {
  LABELS[`totalwar.formations.${k}.attackPct`] = `Formation ${n}: attack (%)`;
  LABELS[`totalwar.formations.${k}.defencePct`] = `Formation ${n}: protection (%)`;
  LABELS[`totalwar.formations.${k}.speedPct`] = `Formation ${n}: speed (%)`;
}
LABELS['totalwar.boardLayout'] = 'Board (sea37 has sea bays for navies)';
LABELS['totalwar.airBattleSeconds'] = 'Air battle time limit (seconds)';
LABELS['totalwar.artilleryMeleeAttackPct'] = 'Artillery in close combat: damage dealt (%)';
LABELS['totalwar.artilleryMeleeDamageTakenPct'] = 'Artillery in close combat: damage taken (%)';
LABELS['totalwar.bombardPct'] = 'Shore bombardment strength (% of ship attack)';
LABELS['totalwar.amphibious'] = 'Amphibious attacks across sea bays you hold';
LIMITS['totalwar.airBattleSeconds'] = [10, 300];

/** Which settings groups each game mode uses (the lobby only shows these). */
const GROUPS_FOR_MODE = {
  base: ['general', 'base'],
  war: ['general', 'base', 'war'],
  empire: ['general', 'base', 'war', 'empire'],
  totalwar: ['general', 'base', 'totalwar'],
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
    const decimal = DECIMALS.includes(path);
    const ok = decimal ? Number.isFinite(n) && Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 : Number.isInteger(n);
    if (!ok || n < min || n > max) {
      throw new Error(`"${LABELS[path] || path}" must be ${decimal ? 'a number with at most one decimal place' : 'a whole number'} from ${min} to ${max}.`);
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

module.exports = { DEFAULTS, LABELS, LIMITS, OPTIONS, DECIMALS, GROUPS_FOR_MODE, cloneDefaults, getPath, setSetting };
