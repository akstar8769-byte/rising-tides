/**
 * HISTORICAL SCENARIOS (Total War)
 * ================================
 * A scenario replaces the normal random setup with two sides fighting over a fixed,
 * stylised map: big countries, named cities, industrial cities that out-produce
 * ordinary land, victory cities, starting armies and research, scheduled
 * reinforcements and winter rounds. Each comes in two styles:
 *   historical — starting forces and timings close to the real campaign
 *   balanced   — the same war, tuned so either side can win
 *
 * Players are split into two sides by seat: seats 0, 2, 4 play the first side,
 * seats 1, 3 the second. A side with several players divides its country into
 * regions, each with its own HQ (that player's capital). Teammates can't attack
 * each other and share the win.
 */
'use strict';

const { addLog } = require('./util');

// Map picture, one character per hex (odd rows shifted right, as on the other maps):
//   p plains   w woods   h hills   r river / marsh   . sea   f fishing ground   (space) no hex
const EAST_MAP = [
  '.....f..wwwww ', // 0  Baltic Sea · Leningrad
  '...pp..pwwwwww', // 1  Königsberg · Gulf of Riga · Riga
  'pppppppwwwwwww', // 2
  'ppppppwwpppppp', // 3  Berlin · Smolensk · Moscow
  'pppppwwpppppph', // 4  Warsaw · Minsk · the Urals
  'hhpprrrppppppp', // 5  Silesia · Pripyat marshes
  'hhhprrppppppph', // 6  Kraków · Lvov
  ' hhhppprpppppr', // 7  Kiev (Dnieper) · Kharkov · Stalingrad (Volga)
  '  hhpppppppppp', // 8  Romania · Odessa · Rostov
  '   hhp..f.....', // 9  Ploiești · Bucharest · Black Sea
];

/** Named cities: [col, row, name, flags] — ind = industrial city, vic = victory city. */
const EAST_CITIES = [
  [1, 3, 'Berlin', { ind: true }],
  [3, 1, 'Königsberg', {}],
  [3, 4, 'Warsaw', {}],
  [1, 5, 'Silesia', { ind: true }],
  [2, 6, 'Kraków', {}],
  [4, 9, 'Ploiești', { ind: true }],
  [5, 9, 'Bucharest', {}],
  [9, 0, 'Leningrad', { ind: true, vic: true }],
  [7, 1, 'Riga', {}],
  [6, 4, 'Minsk', {}],
  [8, 3, 'Smolensk', {}],
  [11, 3, 'Moscow', { ind: true, vic: true }],
  [13, 4, 'Urals', { ind: true }],
  [5, 6, 'Lvov', {}],
  [7, 7, 'Kiev', {}],
  [6, 8, 'Odessa', {}],
  [10, 7, 'Kharkov', { ind: true }],
  [11, 8, 'Rostov', {}],
  [13, 7, 'Stalingrad', { ind: true, vic: true }],
];

// Troop lists are written compactly: 'infantry:3 lightTank:2'.
const T = (str) => Object.fromEntries(str.split(' ').filter(Boolean).map((x) => x.split(':')).map(([k, n]) => [k, +n]));

const EAST_FRONT_41 = {
  id: 'eastFront41',
  name: 'Eastern Front, 1941',
  map: EAST_MAP,
  cities: EAST_CITIES,
  rounds: 18,
  sides: [
    {
      id: 'axis',
      name: 'Germany',
      short: 'Axis',
      // Which hexes the side starts with.
      owns: (c, r) => c <= 4 || (r >= 8 && c <= 5),
      // Regions for a side with several players: HQ city, which hexes, and a name.
      regions: {
        north: { hq: 'Königsberg', name: 'Germany (North)', test: (c, r) => r <= 2 },
        centre: { hq: 'Berlin', name: 'Germany', test: (c, r) => r >= 3 && r <= 5 },
        south: { hq: 'Bucharest', name: 'Germany (South) & Romania', test: (c, r) => r >= 6 },
      },
      capital: 'Berlin',
    },
    {
      id: 'soviet',
      name: 'USSR',
      short: 'Soviet',
      owns: (c, r) => !(c <= 4 || (r >= 8 && c <= 5)),
      regions: {
        north: { hq: 'Leningrad', name: 'USSR (North)', test: (c, r) => r <= 2 },
        centre: { hq: 'Moscow', name: 'USSR', test: (c, r) => r >= 3 && r <= 5 },
        south: { hq: 'Kiev', name: 'USSR (South)', test: (c, r) => r >= 6 },
      },
      capital: 'Moscow',
    },
  ],
  // How each side's land is shared out when it has 1, 2 or 3 players (first player listed first).
  splits: {
    1: [['north', 'centre', 'south']],
    2: [['north', 'centre'], ['south']],
    3: [['centre'], ['north'], ['south']],
  },
  victory: {
    cities: ['Leningrad', 'Moscow', 'Stalingrad'],
    text: {
      axis: 'Germany wins by taking Moscow, or by holding 2 of the 3 victory cities (Leningrad, Moscow, Stalingrad) at the end.',
      soviet: 'The USSR wins by taking Berlin, or by holding all 3 victory cities at the end.',
    },
    // At the end of the last round: which side has won on victory cities (or null).
    atEnd: (held) => (held.axis >= 2 ? 'axis' : held.soviet >= 3 ? 'soviet' : null),
    // Taking the enemy's capital wins at once.
    capture: { Moscow: 'axis', Berlin: 'soviet' },
  },
  styles: {
    historical: {
      label: 'Historical',
      income: { axis: [[1, 150]], soviet: [[1, 70], [7, 110]] }, // Soviet industry is disrupted, then evacuated east and recovers
      materials: { axis: 12, soviet: 8 },
      research: {
        axis: ['motorised', 'artillery', 'lightTanks', 'mediumTanks', 'antiTank', 'aircraft', 'infantryL2', 'lightTankL2', 'mediumTankL2'],
        soviet: ['artillery', 'lightTanks', 'antiTank'],
      },
      winter: { from: 6, to: 9, tankSpeedPct: 50, attackPct: 80 },
      armies: {
        axis: [
          [4, 1, 'infantry:3 lightTank:2 artillery:1'],
          [4, 2, 'infantry:2 motorised:1'],
          [4, 3, 'infantry:3 mediumTank:3 motorised:2 artillery:1'],
          [4, 4, 'infantry:3 mediumTank:2 lightTank:2 motorised:1'],
          [4, 5, 'infantry:2 artillery:1'],
          [4, 6, 'infantry:3 lightTank:2 mediumTank:1 artillery:1'],
          [4, 7, 'infantry:2 motorised:1'],
          [5, 8, 'infantry:3 militia:2'],
          [1, 3, 'infantry:1 bomber:2 interceptor:2'],
        ],
        soviet: [
          [7, 1, 'infantry:2 militia:2'],
          [5, 2, 'infantry:2 militia:2'],
          [5, 3, 'infantry:3 militia:2 lightTank:1'],
          [5, 4, 'infantry:3 militia:2 lightTank:1'],
          [5, 5, 'infantry:2 militia:2'],
          [5, 6, 'infantry:3 lightTank:2 militia:1'],
          [5, 7, 'infantry:2 militia:2'],
          [6, 8, 'infantry:2 militia:2'],
          [6, 4, 'infantry:2 lightTank:1 artillery:1'],
          [7, 7, 'infantry:3 artillery:1 lightTank:1'],
          [11, 3, 'infantry:3 artillery:2 militia:2'],
          [9, 0, 'infantry:3 militia:2 artillery:1'],
        ],
      },
      reinforcements: [
        { round: 4, side: 'axis', at: 'Berlin', troops: 'mediumTank:2 infantry:2', text: 'Fresh panzer divisions reach the front' },
        { round: 6, side: 'soviet', at: 'Moscow', troops: 'infantry:5 artillery:2', text: 'The Siberian divisions arrive at Moscow' },
        { round: 7, side: 'soviet', research: ['mediumTanks'], text: 'The T-34 enters mass production' },
        { round: 9, side: 'soviet', at: 'Urals', troops: 'mediumTank:4 infantry:3', text: 'Tank armies roll out of the Ural factories' },
        { round: 10, side: 'axis', at: 'Berlin', research: ['heavyTanks'], troops: 'heavyTank:2', text: 'The first heavy tanks reach the front' },
        { round: 12, side: 'soviet', at: 'Stalingrad', troops: 'infantry:5 mediumTank:2 artillery:2', text: 'Reserve armies gather on the Volga' },
      ],
    },
    balanced: {
      label: 'Balanced',
      income: { axis: [[1, 165]], soviet: [[1, 80], [7, 100]] },
      materials: { axis: 12, soviet: 10 },
      research: null, // same as historical
      winter: { from: 7, to: 8, tankSpeedPct: 70, attackPct: 90 },
      armies: null, // same as historical
      reinforcements: [
        { round: 4, side: 'axis', at: 'Berlin', troops: 'mediumTank:2 infantry:2', text: 'Fresh panzer divisions reach the front' },
        { round: 6, side: 'soviet', at: 'Moscow', troops: 'infantry:3 artillery:1', text: 'The Siberian divisions arrive at Moscow' },
        { round: 8, side: 'axis', at: 'Berlin', troops: 'mediumTank:2 motorised:1', text: 'More panzers reach the front' },
        { round: 7, side: 'soviet', research: ['mediumTanks'], text: 'The T-34 enters mass production' },
        { round: 9, side: 'soviet', at: 'Urals', troops: 'mediumTank:2 infantry:2', text: 'Tank armies roll out of the Ural factories' },
        { round: 10, side: 'axis', at: 'Berlin', research: ['heavyTanks'], troops: 'heavyTank:1', text: 'The first heavy tanks reach the front' },
        { round: 12, side: 'soviet', at: 'Stalingrad', troops: 'infantry:3 mediumTank:1', text: 'Reserve armies gather on the Volga' },
      ],
    },
  },
  // Economy: ordinary land gives 1 material per this many tiles; cities +1, industrial cities +3.
  economy: { tilesPerMaterial: 2, city: 1, industry: 3 },
};

const SCENARIOS = { eastFront41: EAST_FRONT_41 };

// ---------------------------------------------------------------- helpers

const letters = 'ABCDEFGHIJKLMNOP';
const gridId = (c, r) => `${letters[c]}${r + 1}`;
const TERRAIN_BIOME = { woods: 'forest', hills: 'quarry', river: 'riverbank' };
const CH_TERRAIN = { p: 'plains', w: 'woods', h: 'hills', r: 'river' };

function scenarioOf(s) {
  return s.scenario ? SCENARIOS[s.scenario.id] : null;
}
function styleOf(s) {
  const sc = scenarioOf(s);
  return sc ? withDefaults(sc, s.scenario.style) : null;
}
/** A style, with anything it leaves out (null) taken from the historical style. */
function withDefaults(sc, style) {
  const st = sc.styles[style] || sc.styles.balanced;
  const h = sc.styles.historical;
  return { ...st, research: st.research || h.research, armies: st.armies || h.armies };
}
/** The side (index 0 or 1) a seat plays: even seats the first side, odd seats the second. */
function sideIndex(seat) {
  return seat % 2;
}
/** Seats on the same side as `seat` (not counting `seat`). */
function alliesOf(s, seat) {
  if (!s.scenario) return [];
  return s.players.filter((p) => p.seat !== seat && sideIndex(p.seat) === sideIndex(seat)).map((p) => p.seat);
}
function sideSeats(s, sideId) {
  const sc = scenarioOf(s);
  const idx = sc.sides.findIndex((x) => x.id === sideId);
  return s.players.filter((p) => sideIndex(p.seat) === idx).map((p) => p.seat);
}
function cityTile(s, name) {
  return s.board.tiles.find((t) => t.name === name);
}

/**
 * Attacks this player may launch per round: the side's total (setting) shared
 * between its players, at least 1 each; the side's first player gets any remainder.
 */
function attacksFor(s, seat) {
  const total = s.settings.totalwar.scenarioAttacks ?? 4;
  const seats = s.players.filter((p) => sideIndex(p.seat) === sideIndex(seat)).map((p) => p.seat);
  const each = Math.floor(total / seats.length);
  return Math.max(1, each + (seats[0] === seat ? total - each * seats.length : 0));
}

/** Is it winter this round? Returns the winter rule or null. */
function winterNow(s) {
  const st = styleOf(s);
  return st && st.winter && s.round >= st.winter.from && s.round <= st.winter.to ? st.winter : null;
}

// ---------------------------------------------------------------- setup

/**
 * Build the scenario board and set up the players (sides, nations, HQs, armies,
 * research, materials). Called by createGame instead of buildBoard.
 */
function setupScenario(state, id, style) {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`Unknown scenario "${id}".`);
  state.scenario = { id, style: sc.styles[style] ? style : 'balanced', name: sc.name };
  const st = withDefaults(sc, state.scenario.style);

  // Tiles from the picture.
  const tiles = [];
  sc.map.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === ' ') return;
      const sea = ch === '.' || ch === 'f';
      const terrain = CH_TERRAIN[ch];
      // Resource: woods -> wood, hills -> stone, river -> sandbags; plains take turns.
      const biome = sea ? 'sea' : TERRAIN_BIOME[terrain] || ['forest', 'quarry', 'riverbank'][(c + 2 * r) % 3];
      tiles.push({
        id: gridId(c, r),
        q: c - (r - (r & 1)) / 2,
        r,
        c,
        kind: sea ? 'sea' : 'land',
        biome,
        ...(terrain ? { terrain } : {}),
        owner: null,
        role: null,
        controller: null,
        units: {},
        factory: null,
        ...(ch === 'f' ? { fish: true } : {}),
      });
    });
  });
  const at = (c, r) => tiles.find((t) => t.c === c && t.r === r);
  for (const [c, r, name, flags] of sc.cities) Object.assign(at(c, r), { name, ...(flags.ind ? { industry: true } : {}), ...(flags.vic ? { victory: true } : {}) });

  // Players: side, nation and region.
  sc.sides.forEach((side, idx) => {
    const seats = state.players.filter((p) => sideIndex(p.seat) === idx).map((p) => p.seat);
    const split = sc.splits[Math.min(3, seats.length)] || sc.splits[1];
    seats.forEach((seat, k) => {
      const regions = split[k] || [];
      const p = state.players[seat];
      const main = regions.includes('centre') || seats.length === 1;
      const hqName = main ? side.capital : side.regions[regions[0]].hq;
      p.side = side.id;
      p.nation = seats.length === 1 ? side.name : main ? side.name : side.regions[regions[0]].name;
      p.biome = 'mixed';
      p.homeTile = tiles.find((t) => t.name === hqName).id;
      for (const t of tiles) {
        if (t.kind !== 'land' || !side.owns(t.c, t.r)) continue;
        if (!regions.some((reg) => side.regions[reg].test(t.c, t.r))) continue;
        Object.assign(t, { owner: seat, controller: seat, role: t.id === p.homeTile ? 'capital' : 'province' });
      }
      p.materials = { wood: 0, stone: 0, sandbag: 0 };
      const m = st.materials[side.id];
      p.materials.wood = Math.ceil(m / 3);
      p.materials.stone = Math.ceil(m / 3);
      p.materials.sandbag = m - 2 * Math.ceil(m / 3);
      p.research = { done: [...st.research[side.id]], current: null };
    });
  });
  // The Village is not used in scenarios; any unowned land joins the nearest side's first player.
  for (const t of tiles) if (t.kind === 'land' && t.owner == null) {
    const idx = sc.sides.findIndex((side) => side.owns(t.c, t.r));
    const seat = state.players.find((p) => sideIndex(p.seat) === idx).seat;
    Object.assign(t, { owner: seat, controller: seat, role: 'province' });
  }
  state.board = { layout: 'scenario', tiles, seaLanes: true, scenario: id };

  // Starting armies.
  for (const p of state.players) p.units = 0;
  sc.sides.forEach((side) => {
    for (const [c, r, str] of st.armies[side.id]) {
      const t = at(c, r);
      if (!t || t.controller == null) continue;
      t.troops = t.troops || {};
      const cur = t.troops[t.controller] || {};
      for (const [k, v] of Object.entries(T(str))) cur[k] = (cur[k] || 0) + v;
      t.troops[t.controller] = cur;
    }
  });
  for (const t of tiles) {
    for (const [seat, tr] of Object.entries(t.troops || {})) {
      const nUnits = Object.values(tr).reduce((a, v) => a + v, 0);
      t.units[seat] = nUnits;
      state.players[seat].units += nUnits;
    }
  }
  return state.board;
}

// ---------------------------------------------------------------- each round

/**
 * Start of a round: scheduled reinforcements and research grants, and the winter
 * warning. `addTroops(tile, seat, troops)` comes from the war rules.
 */
function roundStart(s, addTroops) {
  const sc = scenarioOf(s);
  if (!sc) return;
  const st = styleOf(s);
  for (const e of st.reinforcements.filter((x) => x.round === s.round)) {
    const seats = sideSeats(s, e.side);
    if (!seats.length) continue;
    const parts = [];
    if (e.research) for (const seat of seats) {
      const p = s.players[seat];
      for (const tech of e.research) if (!p.research.done.includes(tech)) p.research.done.push(tech);
    }
    if (e.research) parts.push(`new research: ${e.research.join(', ')}`);
    if (e.troops) {
      // At the named city if the side still holds it, else at one of its HQs.
      let tile = cityTile(s, e.at);
      if (!tile || !seats.includes(tile.controller)) tile = seats.map((seat) => s.board.tiles.find((t) => t.id === s.players[seat].homeTile)).find((t) => t && t.controller === t.owner);
      if (tile) {
        addTroops(tile, tile.controller, T(e.troops));
        parts.push(`${e.troops.replace(/:/g, ' ×').replace(/ (?=[a-z])/g, ', ')} at ${tile.name || tile.id}`);
      }
    }
    if (parts.length) addLog(s, `📯 ${e.text}: ${parts.join('; ')}.`, { kind: 'good' });
  }
  const w = winterNow(s);
  if (w && s.round === w.from) addLog(s, `❄ Winter sets in (rounds ${w.from}–${w.to}): tanks move at ${w.tankSpeedPct}% speed and attackers fight at ${w.attackPct}%.`, { kind: 'flood' });
  if (st.winter && s.round === st.winter.to + 1) addLog(s, '🌱 The thaw: winter is over.', { kind: 'round' });
}

/**
 * Scenario income: ordinary land gives 1 material per `tilesPerMaterial` tiles,
 * cities +1, industrial cities +3 (their own resource), all scaled by the side's
 * income % for the chosen style. Returns a materials bag.
 */
function income(s, seat, tiles, leastHeld) {
  const sc = scenarioOf(s);
  const st = styleOf(s);
  const eco = sc.economy;
  const bag = { wood: 0, stone: 0, sandbag: 0 };
  const res = (t) => ({ forest: 'wood', quarry: 'stone', riverbank: 'sandbag' })[t.biome] || leastHeld(bag);
  tiles.forEach((t, i) => {
    if ((i + 1) % eco.tilesPerMaterial === 0) bag[res(t)] += 1;
    if (t.name) bag[res(t)] += eco.city;
    if (t.industry) bag[res(t)] += eco.industry;
  });
  const steps = st.income[s.players[seat].side] || [[1, 100]];
  const pct = steps.filter(([from]) => s.round >= from).pop()[1];
  if (pct !== 100) {
    const want = Math.round(((bag.wood + bag.stone + bag.sandbag) * pct) / 100);
    for (const m of ['wood', 'stone', 'sandbag']) bag[m] = Math.floor((bag[m] * pct) / 100);
    while (bag.wood + bag.stone + bag.sandbag < want) bag[leastHeld(bag)] += 1;
  }
  return bag;
}

// ---------------------------------------------------------------- victory

/** After a capture: does taking this city win the war at once? Returns the winning side or null. */
function captureWins(s, T, taker) {
  const sc = scenarioOf(s);
  if (!sc || !T.name) return null;
  const side = sc.victory.capture[T.name];
  return side && s.players[taker].side === side ? side : null;
}

/** Victory cities held by each side. */
function victoryHeld(s) {
  const sc = scenarioOf(s);
  const held = Object.fromEntries(sc.sides.map((x) => [x.id, 0]));
  for (const name of sc.victory.cities) {
    const t = cityTile(s, name);
    if (t && t.controller != null) held[s.players[t.controller].side] += 1;
  }
  return held;
}

/**
 * Final result for a scenario game. Returns { side, why } — the winning side and
 * the reason — given the normal per-player results (for the points tie-break).
 */
function decide(s, reason, results) {
  const sc = scenarioOf(s);
  if (s.scenario.winner) return { side: s.scenario.winner, why: s.scenario.why };
  const held = victoryHeld(s);
  const onCities = sc.victory.atEnd(held);
  if (onCities) return { side: onCities, why: `${sc.sides.find((x) => x.id === onCities).name} holds ${held[onCities]} of the ${sc.victory.cities.length} victory cities.` };
  // Points: each side's players added together.
  const pts = Object.fromEntries(sc.sides.map((x) => [x.id, 0]));
  for (const r of results) pts[s.players[r.seat].side] += r.score;
  const [a, b] = sc.sides;
  if (pts[a.id] === pts[b.id]) return { side: null, why: `No victory: neither side reached its goal, and the points are level (${pts[a.id]} each).` };
  const win = pts[a.id] > pts[b.id] ? a : b;
  return { side: win.id, why: `No side reached its goal; ${win.name} wins on points (${pts[a.id]} – ${pts[b.id]}).` };
}

/** Public scenario info for the players' view. */
function view(s, seat) {
  const sc = scenarioOf(s);
  if (!sc) return null;
  const st = styleOf(s);
  const w = winterNow(s);
  return {
    id: sc.id,
    name: sc.name,
    style: s.scenario.style,
    styleLabel: st.label,
    sides: sc.sides.map((x) => ({ id: x.id, name: x.name, seats: sideSeats(s, x.id), goal: sc.victory.text[x.id] })),
    victoryCities: sc.victory.cities,
    held: victoryHeld(s),
    winter: w ? { ...w } : null,
    winterRounds: st.winter ? [st.winter.from, st.winter.to] : null,
    next: st.reinforcements.filter((e) => e.round > s.round).map((e) => ({ round: e.round, side: e.side, text: e.text })),
    attacksPerRound: seat != null && s.players[seat] ? attacksFor(s, seat) : s.settings.totalwar.scenarioAttacks,
    attacksPerSide: s.settings.totalwar.scenarioAttacks,
  };
}

module.exports = { attacksFor, SCENARIOS, setupScenario, roundStart, income, captureWins, victoryHeld, decide, view, winterNow, alliesOf, sideIndex, scenarioOf };
