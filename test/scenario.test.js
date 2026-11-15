'use strict';
// Historical scenarios (Total War): Eastern Front 1941.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady } = require('./helpers');
const war = require('../engine/war');
const SCEN = require('../engine/scenarios');

const game = (n = 2, style = 'balanced', opts = {}) =>
  newGame({ mode: 'totalwar', n, oceans: true, biomes: Array(n).fill('forest'), ...opts, settings: (c) => ((c.totalwar.scenario = 'eastFront41'), (c.totalwar.scenarioStyle = style)) });
const city = (s, name) => s.board.tiles.find((t) => t.name === name);
const sideOf = (s, seat) => s.players[seat].side;

test('2 to 5 players split into two sides, each with its own HQ and land', () => {
  for (const n of [2, 3, 4, 5]) {
    const s = game(n);
    assert.equal(s.players.filter((p) => p.side === 'axis').length, Math.ceil(n / 2));
    assert.equal(s.players.filter((p) => p.side === 'soviet').length, Math.floor(n / 2));
    for (const p of s.players) {
      const home = s.board.tiles.find((t) => t.id === p.homeTile);
      assert.equal(home.role, 'capital');
      assert.equal(home.owner, p.seat);
      assert.ok(s.board.tiles.filter((t) => t.controller === p.seat).length >= 3, `${p.nation} has land`);
    }
  }
  // The main player of each side holds the capital.
  const s = game(4);
  assert.equal(city(s, 'Berlin').controller, 0);
  assert.equal(city(s, 'Moscow').controller, 1);
  assert.equal(city(s, 'Bucharest').owner, 2); // Germany (South)
  assert.equal(city(s, 'Kiev').owner, 3); // USSR (South)
});

test('normal games still need 3 players; scenarios allow 2', () => {
  assert.throws(() => newGame({ mode: 'totalwar', n: 2, biomes: ['forest', 'quarry'] }), /3 to 5/);
  assert.equal(game(2).players.length, 2);
});

test('starting armies, research, no truce and no Flood', () => {
  const s = game(2, 'historical');
  assert.ok(s.players[0].units > 40 && s.players[1].units > 40);
  assert.ok(s.players[0].research.done.includes('mediumTankL2'));
  assert.ok(!s.players[1].research.done.includes('mediumTanks'));
  assert.equal(s.settings.totalwar.truceRounds, 0);
  assert.equal(engine.viewFor(s, 0).threshold, 999);
  const v = engine.viewFor(s, 0);
  assert.equal(v.scenario.name, 'Eastern Front, 1941');
  assert.equal(v.scenario.attacksPerRound, 6, 'Historical: Germany has the initiative in 1941');
  assert.equal(v.scenario.initiative.soviet, 2);
  assert.ok(v.attackTargets.length > 0, 'the war starts at once');
});

test('teammates cannot attack each other; pacts are off', () => {
  const s = game(4);
  const v = engine.viewFor(s, 0);
  for (const id of v.attackTargets) {
    const t = s.board.tiles.find((x) => x.id === id);
    assert.notEqual(sideOf(s, t.controller), 'axis');
  }
  assert.throws(() => act(s, 0, 'proposePact', { to: 1 }), /No pacts in a scenario/);
});

test('income: cities and industry count, and scale with the style', () => {
  const s = game(2, 'balanced');
  const axis = war.production(s, 0).passive;
  const total = (b) => b.wood + b.stone + b.sandbag;
  assert.ok(total(axis) > 20);
  // Losing an industrial city costs income.
  const before = total(war.production(s, 1).passive);
  city(s, 'Kharkov').controller = 0;
  assert.ok(total(war.production(s, 1).passive) < before - 2);
});

test('several attacks a round, each with its own troops; Unsustainable is off', () => {
  let s = game(2);
  s = allReady(s);
  assert.equal(s.phase, 'choose');
  const v = engine.viewFor(s, 0);
  const picks = [];
  const fromUsed = new Set();
  for (const id of v.attackTargets) {
    const src = (v.attackSources[id] || []).find((x) => !fromUsed.has(x.tile));
    if (!src) continue;
    fromUsed.add(src.tile);
    picks.push({ target: id, from: src.tile, troops: { ...s.board.tiles.find((t) => t.id === src.tile).troops[0] } });
    if (picks.length === 3) break;
  }
  assert.equal(picks.length, 3);
  assert.throws(() => act(s, 0, 'choose', { action: 'unsustainable', mix: { wood: 0, stone: 0, sandbag: 0 } }), /no Unsustainable/);
  const [first, ...rest] = picks;
  // Too many troops from one tile across attacks is refused.
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: first.target, from: first.from, troops: first.troops, extra: [{ ...rest[0], from: first.from, troops: first.troops }] }));
  s = act(s, 0, 'choose', { action: 'attack', target: first.target, from: first.from, troops: first.troops, extra: rest });
  assert.equal(s.players[0].choice.extra.length, 2);
  s = act(s, 1, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  // All three attacks are fought (one battle at a time for the attacker).
  const started = s.log.filter((l) => /BATTLE for|marches into/.test(l.text)).length + s.battleQueueTW.length;
  assert.equal(started, 3);
});

test('attacks per round are shared by a side: a 2-player side gets as many as a 1-player side', () => {
  const s = game(3);
  assert.equal(SCEN.attacksFor(s, 0) + SCEN.attacksFor(s, 2), 4);
  assert.equal(SCEN.attacksFor(s, 1), 4);
});

test('reinforcements arrive on schedule, and winter slows tanks', () => {
  let s = game(2, 'historical');
  const moscow = city(s, 'Moscow');
  const before = Object.values(moscow.troops[1]).reduce((a, n) => a + n, 0);
  s.round = 5;
  s.phase = 'trade';
  for (const p of s.players) p.materials = { wood: 99, stone: 99, sandbag: 99 }; // upkeep paid, nothing disbanded
  for (const p of s.players) p.ready = false;
  s = allReady(s); // trade phase ends -> round 6 starts
  assert.equal(s.round, 6);
  const after = Object.values(city(s, 'Moscow').troops[1]).reduce((a, n) => a + n, 0);
  assert.equal(after - before, 13, 'Siberian divisions: 8 infantry + 3 artillery + 2 anti-tank');
  assert.ok(s.log.some((l) => /Siberian/.test(l.text)));
  assert.ok(SCEN.winterNow(s));
  const tw = require('../engine/totalwar');
  const b = tw.createBattle({ id: 1, tile: city(s, 'Smolensk'), from: city(s, 'Minsk'), attacker: 0, defender: 1, aTroops: { mediumTank: 1 }, dTroops: { infantry: 1 }, cfg: s.settings.totalwar, rand: () => 0.5, weather: { tankSpeedPct: 50, attackPct: 80 } });
  assert.equal(b.weather.tankSpeedPct, 50);
});

test('taking the enemy capital wins the war at once, for the whole side', () => {
  let s = game(4);
  const moscow = city(s, 'Moscow');
  // Germany already holds a hex next to Moscow, and Moscow stands empty.
  const { areAdjacent } = require('../engine/board');
  const smolensk = s.board.tiles.find((t) => t.kind === 'land' && t !== moscow && t.owner === 1 && areAdjacent(t, moscow));
  smolensk.controller = 0;
  smolensk.troops = { 0: { infantry: 3 } };
  smolensk.units = { 0: 3 };
  moscow.troops = {};
  moscow.units = {};
  s.players[0].units += 3;
  s = allReady(s);
  const src = engine.viewFor(s, 0).attackSources[moscow.id].find((x) => x.tile === smolensk.id);
  assert.ok(src, 'Moscow can be attacked from Smolensk');
  s = act(s, 0, 'choose', { action: 'attack', target: moscow.id, from: smolensk.id, troops: { infantry: 3 } });
  for (const seat of [1, 2, 3]) s = act(s, seat, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.scenario.side, 'axis');
  assert.deepEqual(s.outcome.winners.sort(), [0, 2]);
  assert.match(s.outcome.scenario.why, /Moscow/);
});

test('at the end: victory cities, else points per side', () => {
  const s = game(2);
  // USSR holds all 3 victory cities at the start.
  let o = war.scoreTotalWar(s, 'rounds');
  assert.equal(o.scenario.side, 'soviet');
  assert.match(o.scenario.why, /3 of the 3/);
  // Germany holds 2 of 3.
  city(s, 'Leningrad').controller = 0;
  city(s, 'Stalingrad').controller = 0;
  o = war.scoreTotalWar(s, 'rounds');
  assert.equal(o.scenario.side, 'axis');
  // One each (and Moscow Soviet): decided on points.
  city(s, 'Stalingrad').controller = 1;
  o = war.scoreTotalWar(s, 'rounds');
  assert.match(o.scenario.why, /points/);
});

// ---------------------------------------------------------------- France, 1940
const france = (n = 2, style = 'balanced') =>
  newGame({ mode: 'totalwar', n, oceans: true, biomes: Array(n).fill('forest'), settings: (c) => ((c.totalwar.scenario = 'france40'), (c.totalwar.scenarioStyle = style)) });

test('France 1940: Germany vs the Allies, Britain across the Channel, the Maginot Line fortified', () => {
  const s = france(2);
  assert.equal(s.players[0].nation, 'Germany');
  assert.equal(s.players[1].nation, 'Allies');
  assert.equal(city(s, 'Paris').controller, 1);
  assert.equal(city(s, 'Berlin').controller, 0);
  const forts = s.board.tiles.filter((t) => t.fort).map((t) => s.players[t.controller].side);
  assert.equal(forts.filter((x) => x === 'allies').length, 4, 'the Maginot Line');
  assert.equal(forts.filter((x) => x === 'axis').length, 3, 'the Westwall');
  // Britain is an island: no land route from London to Paris.
  const { areAdjacent } = require('../engine/board');
  const land = s.board.tiles.filter((t) => t.kind === 'land');
  const seen = new Set([city(s, 'London').id]);
  const todo = [city(s, 'London')];
  while (todo.length) {
    const t = todo.pop();
    for (const o of land) if (!seen.has(o.id) && areAdjacent(t, o)) (seen.add(o.id), todo.push(o));
  }
  assert.ok(!seen.has(city(s, 'Paris').id));
  assert.equal(engine.viewFor(s, 0).scenario.sides[1].icon, '🟦');
});

test('France 1940: allied splits — France / Britain & the Low Countries / Germany north+centre and south', () => {
  const s = france(4);
  assert.equal(s.players[1].nation, 'France');
  assert.equal(s.players[3].nation, 'Britain');
  assert.equal(city(s, 'Brussels').owner, 3);
  assert.equal(city(s, 'Munich').owner, 2);
  assert.equal(city(s, 'Cologne').owner, 0);
});

test('fortified tiles: defenders take only part of the damage', () => {
  const tw = require('../engine/totalwar');
  const s = france(2);
  const T = city(s, 'Metz');
  const run = (fort) => {
    const b = tw.createBattle({ id: 1, tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 1 }, dTroops: { infantry: 1 }, cfg: { ...s.settings.totalwar, dotsPerUnit: 1 }, rand: () => 0.5, fort });
    const [a, d] = [b.dots.find((x) => x.side === 'A'), b.dots.find((x) => x.side === 'D')];
    Object.assign(a, { x: 46, y: 20, tx: 46, ty: 20 });
    Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
    tw.stepBattle(b, 1, { ...s.settings.totalwar, dotsPerUnit: 1 });
    return d.max - d.hp;
  };
  const open = run(null);
  assert.ok(open > 0);
  assert.ok(Math.abs(run(50) - open * 0.5) < 1e-9);
});

test('France 1940: taking Paris wins for Germany', () => {
  let s = france(2);
  const paris = city(s, 'Paris');
  const { areAdjacent } = require('../engine/board');
  const next = s.board.tiles.find((t) => t.kind === 'land' && t.owner === 1 && t !== paris && areAdjacent(t, paris));
  next.controller = 0;
  next.troops = { 0: { infantry: 3 } };
  next.units = { 0: 3 };
  paris.troops = {};
  paris.units = {};
  s = allReady(s);
  s = act(s, 0, 'choose', { action: 'attack', target: paris.id, from: next.id, troops: { infantry: 3 } });
  s = act(s, 1, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.scenario.side, 'axis');
});

// ---------------------------------------------------------------- bunkers (all Total War games)
test('bunkers: need Fortifications research, cost 5 / 8 / 12, top out at level 3', () => {
  let s = newGame({ mode: 'totalwar', n: 3, oceans: true });
  const home = s.players[0].homeTile;
  s.players[0].materials = { wood: 30, stone: 30, sandbag: 30 };
  assert.throws(() => act(s, 0, 'buildBunker', { tile: home, materials: { wood: 5, stone: 0, sandbag: 0 } }), /Research Fortifications/);
  s.players[0].research.done.push('fortifications');
  assert.throws(() => act(s, 0, 'buildBunker', { tile: home, materials: { wood: 4, stone: 0, sandbag: 0 } }), /costs 5/);
  assert.throws(() => act(s, 0, 'buildBunker', { tile: s.players[1].homeTile, materials: { wood: 5, stone: 0, sandbag: 0 } }), /land you hold/);
  s = act(s, 0, 'buildBunker', { tile: home, materials: { wood: 5, stone: 0, sandbag: 0 } });
  s = act(s, 0, 'buildBunker', { tile: home, materials: { wood: 8, stone: 0, sandbag: 0 } });
  s = act(s, 0, 'buildBunker', { tile: home, materials: { wood: 12, stone: 0, sandbag: 0 } });
  assert.equal(s.board.tiles.find((t) => t.id === home).bunker, 3);
  assert.throws(() => act(s, 0, 'buildBunker', { tile: home, materials: { wood: 5, stone: 0, sandbag: 0 } }), /top level/);
  assert.equal(s.players[0].materials.wood, 5);
  assert.ok(engine.viewFor(s, 0).tw.techs.some((t) => t.id === 'fortifications'));
});

test('bunkers: defenders take 15% less damage per level, and a captured bunker loses a level', () => {
  const tw = require('../engine/totalwar');
  const s = newGame({ mode: 'totalwar', n: 3, oceans: true });
  const T = s.board.tiles.find((t) => t.id === s.players[1].homeTile);
  const run = (fort) => {
    const cfg = { ...s.settings.totalwar, dotsPerUnit: 1 };
    const b = tw.createBattle({ id: 1, tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 1 }, dTroops: { infantry: 1 }, cfg, rand: () => 0.5, fort });
    const [a, d] = [b.dots.find((x) => x.side === 'A'), b.dots.find((x) => x.side === 'D')];
    Object.assign(a, { x: 46, y: 20, tx: 46, ty: 20 });
    Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
    tw.stepBattle(b, 1, cfg);
    return d.max - d.hp;
  };
  const open = run(null);
  assert.ok(Math.abs(run(70) - open * 0.7) < 1e-9, 'level 2 = 70% damage');
  // A level-2 bunker is a level-1 bunker for whoever takes the tile.
  let g = newGame({ mode: 'totalwar', n: 3, oceans: true });
  const tgt = g.attackTargets ? null : null;
  const v = engine.viewFor(g, 0);
  const id = v.attackTargets.find((x) => g.board.tiles.find((t) => t.id === x).kind === 'land');
  const tile = g.board.tiles.find((t) => t.id === id);
  tile.bunker = 2;
  if (tile.controller == null) Object.assign(tile, { controller: 1, owner: 1, role: 'province' }); // an enemy tile, undefended
  tile.troops = {};
  tile.units = {};
  g = allReady(g);
  const src = engine.viewFor(g, 0).attackSources[id][0];
  g = act(g, 0, 'choose', { action: 'attack', target: id, from: src.tile, troops: { militia: src.units } });
  for (const seat of [1, 2]) g = act(g, seat, 'choose', { action: 'sustainable', mix: g.players[seat].biome === 'mixed' ? { wood: 2, stone: 0, sandbag: 0 } : undefined });
  const after = g.board.tiles.find((t) => t.id === id);
  assert.equal(after.controller, 0);
  assert.equal(after.bunker, 1);
});

// ---------------------------------------------------------------- North Africa, 1941
const africa = (n = 2, style = 'balanced') =>
  newGame({ mode: 'totalwar', n, oceans: true, biomes: Array(n).fill('forest'), settings: (c) => ((c.totalwar.scenario = 'northAfrica41'), (c.totalwar.scenarioStyle = style)) });

test('North Africa 1941: Axis vs Allies along the coast, Tobruk and El Alamein bunkered, one connected front', () => {
  const s = africa(2);
  assert.equal(city(s, 'Tripoli').controller, 0);
  assert.equal(city(s, 'Cairo').controller, 1);
  assert.equal(city(s, 'Tobruk').bunker, 2);
  assert.equal(city(s, 'El Alamein').bunker, 1);
  assert.ok(s.board.tiles.filter((t) => t.kind === 'land').every((t) => t.terrain));
  const v = engine.viewFor(s, 0);
  assert.equal(v.scenario.name, 'North Africa, 1941');
  assert.deepEqual(v.scenario.victoryCities, ['Benghazi', 'Tobruk', 'Alexandria']);
});

test('scenarios: losing a regional HQ does not surrender the region', () => {
  let s = africa(3); // Axis: Italy (Tripoli) + Afrika Korps & desert (El Agheila); Allies: one player
  const benghazi = city(s, 'El Agheila');
  assert.equal(benghazi.owner, 2);
  const { areAdjacent } = require('../engine/board');
  const next = s.board.tiles.find((t) => t.kind === 'land' && t.controller === 2 && t !== benghazi && areAdjacent(t, benghazi));
  next.controller = 1;
  next.troops = { 1: { infantry: 4 } };
  next.units = { 1: 4 };
  benghazi.troops = {};
  benghazi.units = {};
  const before = s.board.tiles.filter((t) => t.controller === 2).length;
  s = allReady(s);
  s = act(s, 1, 'choose', { action: 'attack', target: benghazi.id, from: next.id, troops: { infantry: 4 } });
  for (const seat of [0, 2]) s = act(s, seat, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  assert.equal(city(s, 'El Agheila').controller, 1);
  assert.equal(s.board.tiles.filter((t) => t.controller === 2).length, before - 1, 'only El Agheila changed hands');
  assert.notEqual(s.phase, 'ended');
});

// ---------------------------------------------------------------- Historical style: initiative and fortresses
test('Historical initiative: attacks per side change with the period of the war', () => {
  const s = game(2, 'historical');
  const at = (round) => ((s.round = round), SCEN.view(s, 0).initiative);
  assert.deepEqual(at(1), { axis: 6, soviet: 2 }); // Barbarossa
  assert.deepEqual(at(7), { axis: 3, soviet: 4 }); // the winter counter-offensive
  assert.deepEqual(at(11), { axis: 5, soviet: 3 }); // 1942: Germany attacks again
  // Balanced keeps the lobby setting for both sides.
  const b = game(2, 'balanced');
  assert.deepEqual(SCEN.view(b, 0).initiative, { axis: 4, soviet: 4 });
});

test('Historical fortresses: Moscow, Leningrad, Berlin, Tobruk; a stronger Maginot Line', () => {
  const e = game(2, 'historical');
  assert.equal(city(e, 'Moscow').bunker, 2);
  assert.equal(city(e, 'Leningrad').bunker, 3);
  assert.equal(game(2, 'balanced').board.tiles.filter((t) => t.bunker).length, 0);
  assert.equal(city(africa(2, 'historical'), 'Tobruk').bunker, 3);
  assert.equal(city(africa(2, 'balanced'), 'Tobruk').bunker, 2);
  assert.equal(SCEN.fortPctOf(france(2, 'historical')), 35);
  assert.equal(SCEN.fortPctOf(france(2, 'balanced')), 50);
});

test('reinforcements arrive after upkeep is paid, so they are never disbanded on arrival', () => {
  let s = game(2, 'historical');
  for (const p of s.players) p.materials = { wood: 0, stone: 0, sandbag: 0 }; // broke: upkeep disbands what it must
  s.round = 5;
  s.phase = 'trade';
  for (const p of s.players) p.ready = false;
  s = allReady(s);
  const moscow = Object.values(city(s, 'Moscow').troops[1]).reduce((a, n) => a + n, 0);
  assert.ok(moscow >= 13, `the Siberian divisions are all there (${moscow})`);
});

test('France 1940: the Allies win outright by taking Berlin; Cologne is bunkered in Historical', () => {
  const s = france(2, 'historical');
  assert.equal(SCEN.captureWins(s, city(s, 'Berlin'), 1), 'allies');
  assert.equal(SCEN.captureWins(s, city(s, 'Cologne'), 1), null);
  assert.equal(city(s, 'Cologne').bunker, 2);
  // North Africa 1941 starts after Operation Compass: the Allies hold Benghazi.
  assert.equal(city(africa(2), 'Benghazi').controller, 1);
});

// ---------------------------------------------------------------- the Royal Navy, and Normandy 1944
test('the Royal Navy starts at sea in France 1940 and North Africa (held by Britain in team games)', () => {
  const ships = (s, seat) => s.board.tiles.filter((t) => t.kind === 'sea' && t.controller === seat).reduce((a, t) => a + Object.values(t.troops[seat]).reduce((x, n) => x + n, 0), 0);
  const f = france(4, 'historical');
  assert.ok(ships(f, 3) >= 15, 'Britain holds the Channel and the North Sea');
  assert.ok(ships(f, 0) <= 2, 'Germany has only a couple of destroyers');
  const a = africa(2, 'historical');
  assert.ok(ships(a, 1) >= 12);
  assert.ok(a.board.tiles.some((t) => t.kind === 'sea' && t.controller === 1 && (t.troops[1].battleship || 0) >= 2));
});

test('bunkers shelter defenders from naval shelling too', () => {
  let s = africa(2, 'historical');
  const tobruk = city(s, 'Tobruk'); // bunker 3, Allied — let the Axis "fleet" sit next to it
  const { areAdjacent } = require('../engine/board');
  const sea = s.board.tiles.find((t) => t.kind === 'sea' && areAdjacent(t, tobruk));
  sea.controller = 0;
  sea.troops = { 0: { battleship: 2 } };
  sea.units = { 0: 2 };
  tobruk.troops = { 1: { infantry: 50 } };
  tobruk.units = { 1: 50 };
  let killed = 0;
  for (let i = 0; i < 20; i++) {
    const g = act(Object.assign(structuredClone(s), { rng: 1000 + i }), 0, 'bombard', { from: sea.id, target: tobruk.id });
    killed += 50 - city(g, 'Tobruk').troops[1].infantry;
  }
  // 2 battleships x 2 shots x 50% x 25% (scenario) x 55% (bunker 3) ~ 0.28 a salvo
  assert.ok(killed / 20 < 0.6, `about a quarter of a unit a salvo (${killed / 20})`);
});

const normandy = (n = 2, style = 'historical') =>
  newGame({ mode: 'totalwar', n, oceans: true, biomes: Array(n).fill('forest'), settings: (c) => ((c.totalwar.scenario = 'normandy44'), (c.totalwar.scenarioStyle = style)) });

test('Normandy 1944: the Allies start in England with the invasion fleet; the Atlantic Wall is bunkered', () => {
  const s = normandy(2);
  assert.equal(city(s, 'London').controller, 1);
  assert.equal(city(s, 'Paris').controller, 0);
  assert.equal(city(s, 'Calais').bunker, 3, 'the Pas-de-Calais was the most heavily defended');
  assert.ok(city(s, 'Omaha').bunker >= 2);
  const fleet = s.board.tiles.filter((t) => t.kind === 'sea' && t.controller === 1);
  assert.ok(fleet.length >= 5);
  // The Allies can land on the beaches straight away, carried by their ships.
  const v = engine.viewFor(s, 1);
  for (const beach of ['Utah', 'Omaha', 'Gold', 'Sword']) {
    const srcs = v.attackSources[city(s, beach).id] || [];
    assert.ok(srcs.some((x) => x.amphibious && x.capacity >= 9), `${beach} can be stormed from the sea`);
  }
  assert.equal(SCEN.view(s, 1).initiative.allies, 5);
  // Off-map supply: the Allies earn far more than England alone would give.
  const war = require('../engine/war');
  const inc = war.production(s, 1).passive;
  assert.ok(inc.wood + inc.stone + inc.sandbag >= 50);
});

test('Normandy 1944: taking Paris wins for the Allies; Germany wins by holding 2 of Cherbourg, Caen, Paris', () => {
  const s = normandy(2);
  assert.equal(SCEN.captureWins(s, city(s, 'Paris'), 1), 'allies');
  assert.equal(war.scoreTotalWar(s, 'rounds').scenario.side, 'axis');
  city(s, 'Cherbourg').controller = 1;
  city(s, 'Caen').controller = 1;
  assert.equal(war.scoreTotalWar(s, 'rounds').scenario.side, 'allies');
});
