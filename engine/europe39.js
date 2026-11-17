/**
 * EUROPE 1939 — the grand campaign map and its nations.
 * ======================================================
 * A stylised Europe (plus North Africa and Turkey) in a 30 x 20 hex grid, Sept 1939.
 * Every nation is a player: humans pick theirs, bots play the rest. 1 round = 3 months.
 *
 * MAP: one character per hex (odd rows are shifted half a hex right, as on the other
 * maps). '.' is sea; a letter is the nation that holds the hex at the start (see NATIONS).
 * TERRAIN: p plains, w woods, h hills / mountains, r river / marsh (same grid).
 */
'use strict';

const MAP = [
  '............OO.WWWW.QQQ.RRRRRR', // 0  Narvik · Kiruna · Murmansk
  '...........OOO.WWW.QQQQ.RRRRRR', // 1
  '..U........OO..WW..QQQ..RRRRRR', // 2  Scotland · Oslo · Helsinki · Leningrad
  '.UU.......OO..WWW..XXRRRRRRRRR', // 3  Stockholm · Riga
  'IUUU.....D........XXRRRRRRRRRR', // 4  Ireland · Copenhagen · the Baltic Sea
  'IUUU....NGGGGGGGXXRRRRRRRRRRRR', // 5  Liverpool · Amsterdam · Hamburg · Königsberg · Moscow
  '.UU....BBGGGGGZZZZRRRRRRRRRRRR', // 6  Brussels · Berlin · Minsk
  '..UU...FBGGGGGGZZZZRRRRRRRRRRR', // 7  London · the Channel · Lille · the Ruhr · Warsaw
  '....FFFFFGGGGGGZZZZRRRRRRRRRRR', // 8  Brest · Paris · Kraków
  '....FFFFFSGGGGHHAARRRRRRRRRRRR', // 9  Bern · Munich · Prague · Kiev · Kharkov
  '...FFFFFFTTGGYHHAAARRRRRRRRRRR', // 10 Lyon · Milan · Vienna · Budapest · Ploiești · Stalingrad
  '..EEFFF.TTTYYYYAAA.RRRRRRRRRRR', // 11 Barcelona · Marseille · Belgrade · Bucharest · Rostov
  '.PEEEE...TTTYYYJJJ..RRRRRRRRRR', // 12 Sofia · Sevastopol
  '.PEEEE....TTT.CCJJ..KKKKRRRRRR', // 13 Lisbon · Madrid · Rome · Istanbul · Baku
  '.PEEE......TT..CCC.KKKKKKKRRRR', // 14 Naples · Athens · Ankara
  '..EE.........T....C..KKKKK....', // 15 Gibraltar · Palermo · Crete
  '..............................', // 16 the Mediterranean
  '...MMMMMMMMM..VVVVVV..eeee....', // 17 Algeria · Tunisia · Libya · Egypt
  '...MMMMMMMMMMVVVVVVVVVeeeeee..', // 18 Casablanca · Algiers · Tunis · Tripoli · Benghazi · Cairo
  '...MMMMMMMMMMVVVVVVVVVeeeeee..', // 19
];
const TERRAIN = [
  '............hh.wwww.www.wwwwww',
  '...........hhh.www.wwww.wwwwww',
  '..h........hh..ww..www..wwwwww',
  '.hp.......hh..www..wwwwwwwwwww',
  'pppp.....p........wwwwwwwwwwww',
  'pppp....pppppppppwrrrwwwwwwwww',
  '.pp....wppppppprrrrrpppppppppp',
  '..pp...pwpppppprrppppppppppppp',
  '....ppppppphhppppppppppppppppp',
  '....pppphhhhhhhhhhpppppppppppp',
  '...ppphhhhhhhhhhhhpppppppppppr',
  '..hhphh.phhhhhhhhh.ppppppppppr',
  '.phhhh...phhhhhhhh..ppppphhhhh',
  '.phphh....hhh.hhhh..hhhhhhhhhh',
  '.pphh......hh..hhh.hhhhhhhhhhh',
  '..hh.........h....h..hhhhh....',
  '..............................',
  '...pppphhhpp..pppppp..rrpp....',
  '...ppphhhpppppppppppppprrppp..',
  '...ppppppppppppppppppppppppp..',
];

/**
 * Nations, in seat order. letter: the MAP character; major: a great power (more attacks a
 * round, more starting materials). also: extra MAP letters that belong to this nation
 * (colonies). capital: the capital city's name. faction at the start (or null).
 */
const NATIONS = [
  { id: 'GER', name: 'Germany', letter: 'G', major: true, color: '#7a5c3e', ink: '#fff', capital: 'Berlin', faction: 'axis', personality: 'warlike' },
  { id: 'UK', name: 'United Kingdom', letter: 'U', also: ['e'], major: true, color: '#c8102e', ink: '#fff', capital: 'London', faction: 'allies', personality: 'balanced' },
  { id: 'FRA', name: 'France', letter: 'F', also: ['M'], major: true, color: '#3b6fd6', ink: '#fff', capital: 'Paris', faction: 'allies', personality: 'cautious' },
  { id: 'USSR', name: 'Soviet Union', letter: 'R', major: true, color: '#8b1a1a', ink: '#fff', capital: 'Moscow', faction: 'comintern', personality: 'balanced' },
  { id: 'ITA', name: 'Italy', letter: 'T', also: ['V'], major: true, color: '#2e8b57', ink: '#fff', capital: 'Rome', faction: null, personality: 'balanced' },
  { id: 'POL', name: 'Poland', letter: 'Z', color: '#d45f8a', ink: '#fff', capital: 'Warsaw', faction: 'allies', personality: 'cautious' },
  { id: 'SPA', name: 'Spain', letter: 'E', color: '#d9a400', ink: '#000', capital: 'Madrid', faction: null, personality: 'cautious' },
  { id: 'POR', name: 'Portugal', letter: 'P', color: '#4d9e6a', ink: '#fff', capital: 'Lisbon', faction: null, personality: 'cautious' },
  { id: 'IRE', name: 'Ireland', letter: 'I', color: '#78c26b', ink: '#000', capital: 'Dublin', faction: null, personality: 'cautious' },
  { id: 'BEL', name: 'Belgium', letter: 'B', color: '#e3c84a', ink: '#000', capital: 'Brussels', faction: null, personality: 'cautious' },
  { id: 'NED', name: 'Netherlands', letter: 'N', color: '#f08a24', ink: '#000', capital: 'Amsterdam', faction: null, personality: 'cautious' },
  { id: 'DEN', name: 'Denmark', letter: 'D', color: '#b5405a', ink: '#fff', capital: 'Copenhagen', faction: null, personality: 'cautious' },
  { id: 'NOR', name: 'Norway', letter: 'O', color: '#5f7fa8', ink: '#fff', capital: 'Oslo', faction: null, personality: 'cautious' },
  { id: 'SWE', name: 'Sweden', letter: 'W', color: '#2a86c7', ink: '#fff', capital: 'Stockholm', faction: null, personality: 'cautious' },
  { id: 'FIN', name: 'Finland', letter: 'Q', color: '#9ec3e6', ink: '#000', capital: 'Helsinki', faction: null, personality: 'cautious' },
  { id: 'BAL', name: 'Baltic States', letter: 'X', color: '#8f9e58', ink: '#000', capital: 'Riga', faction: null, personality: 'cautious' },
  { id: 'SWI', name: 'Switzerland', letter: 'S', color: '#e06a6a', ink: '#000', capital: 'Bern', faction: null, personality: 'cautious' },
  { id: 'HUN', name: 'Hungary', letter: 'H', color: '#7d9a4a', ink: '#fff', capital: 'Budapest', faction: null, personality: 'cautious' },
  { id: 'ROM', name: 'Romania', letter: 'A', color: '#c9b13a', ink: '#000', capital: 'Bucharest', faction: null, personality: 'cautious' },
  { id: 'YUG', name: 'Yugoslavia', letter: 'Y', color: '#6a7fc4', ink: '#fff', capital: 'Belgrade', faction: null, personality: 'cautious' },
  { id: 'BUL', name: 'Bulgaria', letter: 'J', color: '#5aa37a', ink: '#fff', capital: 'Sofia', faction: null, personality: 'cautious' },
  { id: 'GRE', name: 'Greece', letter: 'C', color: '#59a5d8', ink: '#000', capital: 'Athens', faction: null, personality: 'cautious' },
  { id: 'TUR', name: 'Turkey', letter: 'K', color: '#b8733a', ink: '#fff', capital: 'Ankara', faction: null, personality: 'cautious' },
];

/**
 * Governments in September 1939, and how popular each ideology is (percent, sums to 100):
 * [government, democracy, fascism, communism, non-aligned].
 */
const POLITICS = {
  GER: ['fascism', 5, 80, 5, 10],
  UK: ['democracy', 85, 5, 5, 5],
  FRA: ['democracy', 65, 10, 15, 10],
  USSR: ['communism', 5, 5, 85, 5],
  ITA: ['fascism', 10, 70, 5, 15],
  POL: ['nonaligned', 35, 10, 5, 50],
  SPA: ['nonaligned', 10, 40, 5, 45],
  POR: ['nonaligned', 15, 20, 5, 60],
  IRE: ['democracy', 75, 5, 5, 15],
  BEL: ['democracy', 75, 10, 5, 10],
  NED: ['democracy', 80, 5, 5, 10],
  DEN: ['democracy', 80, 5, 5, 10],
  NOR: ['democracy', 80, 5, 5, 10],
  SWE: ['democracy', 80, 5, 5, 10],
  FIN: ['democracy', 65, 10, 5, 20],
  BAL: ['nonaligned', 25, 10, 15, 50],
  SWI: ['democracy', 85, 5, 5, 5],
  HUN: ['nonaligned', 10, 35, 5, 50],
  ROM: ['nonaligned', 15, 35, 5, 45],
  YUG: ['nonaligned', 25, 15, 15, 45],
  BUL: ['nonaligned', 15, 25, 15, 45],
  GRE: ['nonaligned', 25, 20, 10, 45],
  TUR: ['nonaligned', 20, 10, 5, 65],
};
const IDEOLOGIES = {
  democracy: { name: 'Democracy', icon: '🗳' },
  fascism: { name: 'Fascism', icon: '⚡' },
  communism: { name: 'Communism', icon: '☭' },
  nonaligned: { name: 'Non-aligned', icon: '👑' },
};
/** Which governments each faction accepts. */
const FACTION_FIT = { allies: ['democracy', 'nonaligned'], axis: ['fascism', 'nonaligned'], comintern: ['communism'] };

/** Cities: [col, row, name, flags] — ind: industrial (+3), vp: victory points, oil: an oil field. */
const CITIES = [
  [3, 7, 'London', { ind: true, vp: 5 }],
  [2, 2, 'Glasgow', { ind: true }],
  [2, 5, 'Liverpool', { ind: true }],
  [0, 5, 'Dublin', {}],
  [6, 8, 'Paris', { ind: true, vp: 5 }],
  [7, 7, 'Lille', { ind: true }],
  [6, 10, 'Lyon', { ind: true }],
  [5, 11, 'Marseille', {}],
  [3, 10, 'Bordeaux', {}],
  [4, 8, 'Brest', {}],
  [3, 18, 'Casablanca', {}],
  [6, 18, 'Algiers', {}],
  [12, 18, 'Tunis', {}],
  [3, 13, 'Madrid', { vp: 1 }],
  [5, 12, 'Barcelona', { ind: true }],
  [3, 15, 'Gibraltar', { vp: 1 }],
  [1, 13, 'Lisbon', {}],
  [7, 6, 'Brussels', { vp: 1 }],
  [8, 5, 'Amsterdam', { vp: 1 }],
  [12, 6, 'Berlin', { ind: true, vp: 5 }],
  [10, 5, 'Hamburg', { ind: true }],
  [9, 7, 'Ruhr', { ind: true, vp: 2 }],
  [11, 9, 'Munich', {}],
  [12, 10, 'Vienna', { ind: true, vp: 1 }],
  [13, 9, 'Prague', { ind: true }],
  [15, 5, 'Königsberg', {}],
  [9, 4, 'Copenhagen', {}],
  [11, 2, 'Oslo', { vp: 1 }],
  [12, 0, 'Narvik', {}],
  [16, 3, 'Stockholm', { vp: 1 }],
  [16, 0, 'Kiruna', { ind: true }],
  [19, 2, 'Helsinki', {}],
  [19, 3, 'Riga', {}],
  [16, 7, 'Warsaw', { vp: 2 }],
  [15, 8, 'Kraków', { ind: true }],
  [24, 5, 'Moscow', { ind: true, vp: 5 }],
  [24, 2, 'Leningrad', { ind: true, vp: 3 }],
  [25, 0, 'Murmansk', {}],
  [19, 6, 'Minsk', {}],
  [20, 9, 'Kiev', { ind: true, vp: 2 }],
  [23, 9, 'Kharkov', { ind: true }],
  [27, 10, 'Stalingrad', { ind: true, vp: 3 }],
  [24, 11, 'Rostov', {}],
  [21, 12, 'Sevastopol', {}],
  [28, 13, 'Baku', { oil: true, vp: 2 }],
  [27, 4, 'Gorky', { ind: true }],
  [11, 13, 'Rome', { vp: 3 }],
  [9, 10, 'Milan', { ind: true }],
  [12, 14, 'Naples', {}],
  [13, 15, 'Palermo', {}],
  [14, 18, 'Tripoli', {}],
  [18, 17, 'Benghazi', {}],
  [23, 17, 'Alexandria', { vp: 1 }],
  [24, 18, 'Cairo', { ind: true, vp: 2 }],
  [9, 9, 'Bern', {}],
  [14, 10, 'Budapest', {}],
  [17, 11, 'Bucharest', {}],
  [16, 10, 'Ploiești', { oil: true, vp: 1 }],
  [14, 11, 'Belgrade', {}],
  [16, 12, 'Sofia', {}],
  [15, 14, 'Athens', {}],
  [20, 13, 'Istanbul', { ind: true, vp: 1 }],
  [22, 14, 'Ankara', {}],
];

/** Starting armies (Sept 1939): [col, row, troops]. Each nation's capital also gets a garrison. */
const ARMIES = {
  GER: [
    [12, 6, 'infantry:4 mediumTank:2 bomber:2 interceptor:2'],
    [14, 7, 'infantry:4 mediumTank:3 lightTank:2 motorised:2 artillery:2'],
    [14, 8, 'infantry:4 lightTank:2 mediumTank:2 artillery:1'],
    [15, 5, 'infantry:3 artillery:1'],
    [9, 8, 'infantry:3 artillery:1'],
    [9, 7, 'infantry:2'],
    [10, 9, 'infantry:2'],
    [12, 10, 'infantry:2'],
    [13, 9, 'infantry:2 lightTank:1'],
  ],
  POL: [
    [16, 7, 'infantry:4 militia:2 cavalry:2 artillery:1'],
    [15, 7, 'infantry:3 militia:2'],
    [15, 8, 'infantry:3 militia:1'],
    [15, 6, 'infantry:2 militia:2'],
  ],
  FRA: [
    [6, 8, 'infantry:3 mediumTank:2 artillery:1'],
    [8, 8, 'infantry:4 artillery:2'],
    [8, 9, 'infantry:3 artillery:2'],
    [7, 7, 'infantry:3 lightTank:2'],
    [6, 10, 'infantry:2'],
    [6, 18, 'infantry:2'],
  ],
  UK: [
    [3, 7, 'infantry:3 interceptor:3 bomber:1'],
    [2, 5, 'infantry:2'],
    [2, 2, 'infantry:1'],
    [24, 18, 'infantry:2 lightTank:1'],
    [23, 17, 'infantry:1'],
  ],
  ITA: [
    [11, 13, 'infantry:3 artillery:1'],
    [9, 10, 'infantry:3 lightTank:1'],
    [10, 10, 'infantry:2'],
    [12, 14, 'infantry:2'],
    [14, 18, 'infantry:3'],
    [18, 17, 'infantry:2'],
  ],
  USSR: [
    [24, 5, 'infantry:4 militia:3 artillery:2'],
    [24, 2, 'infantry:3 militia:2'],
    [19, 6, 'infantry:3 lightTank:2'],
    [19, 7, 'infantry:3 lightTank:1'],
    [20, 9, 'infantry:3 lightTank:2 artillery:1'],
    [19, 8, 'infantry:2 militia:2'],
    [23, 9, 'infantry:2'],
    [27, 10, 'militia:2'],
    [28, 13, 'militia:2'],
    [27, 4, 'infantry:2'],
  ],
  SPA: [[3, 13, 'infantry:3 militia:2']],
  FIN: [[19, 2, 'infantry:3 militia:2']],
  SWE: [[16, 3, 'infantry:3 militia:2']],
  TUR: [[22, 14, 'infantry:3 militia:2'], [20, 13, 'infantry:2']],
  YUG: [[14, 11, 'infantry:3 militia:2']],
  ROM: [[17, 11, 'infantry:3 militia:1'], [16, 10, 'infantry:1']],
  SWI: [[9, 9, 'infantry:3 militia:2']],
  GRE: [[15, 14, 'infantry:2 militia:2']],
  BEL: [[7, 6, 'infantry:2 militia:2']],
};
/** Garrison for any nation's capital not listed above. */
const MINOR_GARRISON = 'infantry:2 militia:2';

/** Starting fleets: [col, row, ships, nation]. */
const FLEETS = [
  [5, 6, 'battleship:2 cruiser:2 destroyer:3', 'UK'],
  [6, 3, 'battleship:2 cruiser:1 destroyer:2', 'UK'],
  [21, 16, 'battleship:1 cruiser:2 destroyer:2', 'UK'],
  [4, 15, 'cruiser:1 destroyer:2', 'UK'],
  [3, 9, 'battleship:1 cruiser:2 destroyer:2', 'FRA'],
  [6, 16, 'cruiser:2 destroyer:2', 'FRA'],
  [12, 15, 'battleship:2 cruiser:2 destroyer:3', 'ITA'],
  [11, 4, 'cruiser:1 destroyer:2', 'GER'],
];

/** Research each nation starts with. */
const RESEARCH = {
  GER: ['motorised', 'artillery', 'lightTanks', 'mediumTanks', 'antiTank', 'aircraft', 'fortifications', 'shipyards', 'infantryL2', 'mediumTankL2'],
  UK: ['artillery', 'lightTanks', 'mediumTanks', 'antiTank', 'aircraft', 'shipyards', 'cruisers', 'battleships', 'fortifications'],
  FRA: ['artillery', 'lightTanks', 'mediumTanks', 'antiTank', 'fortifications', 'shipyards', 'cruisers', 'battleships'],
  USSR: ['artillery', 'lightTanks', 'antiTank', 'motorised'],
  ITA: ['artillery', 'lightTanks', 'shipyards', 'cruisers', 'battleships', 'motorised'],
  minor: ['artillery'],
};

/**
 * The historical timeline. Each entry fires at the start of its round (after upkeep), but
 * only when the nation that would act is played by a bot — a human decides for themselves.
 *   war: [attacker, defender]  — attacker declares war on defender (factions join in)
 *   join: [nation, faction]    — a nation joins a faction
 */
const TIMELINE = [
  { round: 1, war: ['GER', 'POL'], text: 'Germany invades Poland' },
  { round: 1, war: ['USSR', 'POL'], alone: true, text: 'The Soviet Union invades eastern Poland' },
  { round: 2, war: ['USSR', 'FIN'], alone: true, text: 'The Winter War: the Soviet Union attacks Finland' },
  { round: 3, war: ['GER', 'DEN'], text: 'Germany occupies Denmark' },
  { round: 3, war: ['GER', 'NOR'], text: 'Germany invades Norway' },
  { round: 3, war: ['GER', 'NED'], text: 'Germany strikes west: the Netherlands' },
  { round: 3, war: ['GER', 'BEL'], text: 'Germany strikes west: Belgium' },
  { round: 4, join: ['ITA', 'axis'], text: 'Italy joins the Axis' },
  { round: 4, war: ['ITA', 'FRA'], text: 'Italy declares war on France and Britain' },
  { round: 4, war: ['USSR', 'BAL'], alone: true, text: 'The Soviet Union occupies the Baltic States' },
  { round: 5, war: ['ITA', 'GRE'], text: 'Italy invades Greece' },
  { round: 6, join: ['HUN', 'axis'], text: 'Hungary joins the Axis' },
  { round: 6, join: ['ROM', 'axis'], text: 'Romania joins the Axis' },
  { round: 7, join: ['BUL', 'axis'], text: 'Bulgaria joins the Axis' },
  { round: 7, war: ['GER', 'YUG'], text: 'Germany invades Yugoslavia' },
  { round: 7, war: ['GER', 'GRE'], text: 'Germany invades Greece' },
  { round: 8, join: ['USSR', 'allies'], text: 'The Soviet Union joins the Allies' },
  { round: 8, war: ['GER', 'USSR'], text: 'Operation Barbarossa: Germany invades the Soviet Union' },
  { round: 8, join: ['FIN', 'axis'], text: 'Finland joins the war against the Soviet Union' },
];

const START_YEAR = 1939;
const START_MONTH = 8; // September (0 = January)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep 1939" for round 1, three months a round. */
function dateOf(round) {
  const m = START_MONTH + 3 * (round - 1);
  return `${MONTHS[m % 12]} ${START_YEAR + Math.floor(m / 12)}`;
}

const FACTIONS = {
  allies: { name: 'Allies', icon: '🟦' },
  axis: { name: 'Axis', icon: '⬛' },
  comintern: { name: 'Comintern', icon: '🟥' },
};

module.exports = { POLITICS, IDEOLOGIES, FACTION_FIT, MAP, TERRAIN, NATIONS, CITIES, ARMIES, MINOR_GARRISON, FLEETS, RESEARCH, TIMELINE, FACTIONS, dateOf };
