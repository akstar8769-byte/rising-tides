'use strict';
// Supply lines and bombing raids (Total War).
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady } = require('./helpers');
const { areAdjacent } = require('../engine/board');

const africa = (n = 2, style = 'balanced', more = () => {}) =>
  newGame({ mode: 'totalwar', n, oceans: true, biomes: Array(n).fill('forest'), settings: (c) => ((c.totalwar.scenario = 'northAfrica41'), (c.totalwar.scenarioStyle = style), more(c)) });
const city = (s, name) => s.board.tiles.find((t) => t.name === name);
const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** Give seat a tile far from its supply sources (deep in enemy land), with some troops on it. */
function farTile(s, seat) {
  const sources = s.board.tiles.filter((t) => t.kind === 'land' && t.controller === seat && (t.id === s.players[seat].homeTile || t.industry));
  const t = s.board.tiles
    .filter((x) => x.kind === 'land' && x.controller !== seat && !x.name)
    .sort((a, b) => Math.min(...sources.map((o) => dist(o, b))) - Math.min(...sources.map((o) => dist(o, a))))[0];
  Object.assign(t, { controller: seat, troops: { [seat]: { infantry: 4 } }, units: { [seat]: 4 } });
  return t;
}

test('supply is on in scenarios by default, off in normal Total War', () => {
  assert.ok(engine.viewFor(africa(), 0).supply, 'scenario: on');
  assert.equal(engine.viewFor(newGame({ mode: 'totalwar', n: 3, oceans: true }), 0).supply, undefined, 'normal game: off');
  const always = newGame({ mode: 'totalwar', n: 3, oceans: true, settings: (c) => (c.totalwar.supplyLines = 'always') });
  assert.ok(engine.viewFor(always, 0).supply);
  assert.equal(Object.keys(engine.viewFor(always, 0).supply.cut).length, 0, 'nothing is cut off at the start');
});

test('a tile far from any supply source is cut off: no recruiting there, and it shows in the view', () => {
  const s = africa();
  const t = farTile(s, 0);
  const v = engine.viewFor(s, 0);
  assert.ok(v.supply.cut[t.id] != null, `${t.id} is out of supply`);
  s.players[0].materials = { wood: 20, stone: 20, sandbag: 20 };
  assert.throws(() => act(s, 0, 'recruit', { unit: 'infantry', tile: t.id, materials: { wood: 4, stone: 0, sandbag: 0 } }), /out of supply/);
});

test('cut-off units start to be lost after the attrition rounds', () => {
  let s = africa(2, 'balanced', (c) => (c.totalwar.supplyAttritionRounds = 1));
  const t = farTile(s, 0);
  for (const p of s.players) p.materials = { wood: 50, stone: 50, sandbag: 50 };
  const units = () => Object.values(s.board.tiles.find((x) => x.id === t.id).troops[0] || {}).reduce((a, n) => a + n, 0);
  const at = (round) => {
    s.phase = 'trade';
    for (const p of s.players) p.ready = false;
    s = allReady(s);
  };
  at(); // round 2: cut off 1 round — not yet
  assert.equal(units(), 4);
  at(); // round 3: cut off 2 rounds — loses one
  assert.equal(units(), 3);
  assert.ok(s.log.some((l) => /Out of supply/.test(l.text)));
});

test('a port with your ships offshore is a supply source', () => {
  const s = africa();
  const port = city(s, 'Sollum'); // a coastal Allied town far from the Axis bases
  Object.assign(port, { controller: 0, troops: { 0: { infantry: 2 } }, units: { 0: 2 } });
  assert.ok(engine.viewFor(s, 0).supply.cut[port.id] != null, 'cut off by land');
  const sea = s.board.tiles.find((x) => x.kind === 'sea' && areAdjacent(x, port));
  Object.assign(sea, { controller: 0, troops: { 0: { destroyer: 1 } }, units: { 0: 1 } });
  assert.equal(engine.viewFor(s, 0).supply.cut[port.id], undefined, 'supplied by sea');
});

test('battles: an attack launched from a cut-off tile fights at reduced strength', () => {
  const s = africa();
  const t = farTile(s, 0);
  const target = s.board.tiles.find((x) => x.kind === 'land' && x.controller === 1 && areAdjacent(x, t));
  Object.assign(target, { troops: { 1: { infantry: 2 } }, units: { 1: 2 } });
  let g = allReady(s);
  g = act(g, 0, 'choose', { action: 'attack', target: target.id, from: t.id, troops: { infantry: 4 } });
  g = act(g, 1, 'choose', { action: 'sustainable', mix: { wood: 0, stone: 0, sandbag: 0 } });
  const b = (g.battles || []).find((x) => x.tile === target.id);
  assert.ok(b, 'a real battle was fought');
  assert.deepEqual(b.supply, { A: 75, D: 100 });
});

// ---------------------------------------------------------------- bombing raids
function raidSetup(aa = 0) {
  const s = africa();
  const tob = city(s, 'Tobruk'); // Allied, bunkered
  const from = s.board.tiles.find((x) => x.kind === 'land' && x.controller === 0 && dist(x, tob) <= 3) ||
    Object.assign(s.board.tiles.find((x) => x.kind === 'land' && areAdjacent(x, tob) && x.controller !== 1) || s.board.tiles.find((x) => x.kind === 'land' && dist(x, tob) === 2), { controller: 0 });
  from.controller = 0;
  from.troops = { 0: { bomber: 6 } };
  from.units = { 0: 6 };
  tob.troops = { 1: { infantry: 5, antiair: aa } };
  tob.units = { 1: 5 + aa };
  return { s, from, tob };
}

test('bombing raids knock bunkers down, once per round, within range', () => {
  const { s, from, tob } = raidSetup();
  const before = tob.bunker;
  assert.ok(before >= 2);
  const v = engine.viewFor(s, 0);
  assert.ok((v.raidTargets[from.id] || []).includes(tob.id), 'Tobruk is in range');
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const g = act(Object.assign(structuredClone(s), { rng: 77 + i }), 0, 'airRaid', { from: from.id, target: tob.id });
    total += before - (city(g, 'Tobruk').bunker || 0);
    assert.throws(() => act(g, 0, 'airRaid', { from: from.id, target: tob.id }), /already flown/);
  }
  assert.ok(total / 10 >= 1, `6 bombers knock off about 2 levels on average (${total / 10})`);
});

test('anti-air guns on the target shoot bombers down', () => {
  const { s, from, tob } = raidSetup(6);
  let lost = 0;
  for (let i = 0; i < 10; i++) {
    const g = act(Object.assign(structuredClone(s), { rng: 300 + i }), 0, 'airRaid', { from: from.id, target: tob.id });
    lost += 6 - (g.board.tiles.find((x) => x.id === from.id).troops[0].bomber || 0);
  }
  assert.ok(lost / 10 >= 0.8, `about 1.5 bombers lost per raid (${lost / 10})`);
  assert.throws(() => act(s, 0, 'airRaid', { from: from.id, target: s.board.tiles.find((x) => x.name === 'Cairo').id }), /up to 3 hexes/);
});
