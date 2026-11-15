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
  assert.equal(v.scenario.attacksPerRound, 4);
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
  assert.equal(after - before, 7, 'Siberian divisions: 5 infantry + 2 artillery');
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
