'use strict';
// Factories (Base game, playtest rules). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, allChoose, setMats, forceDice } = require('./helpers');
const F = require('../engine/factories');

// Seats: 0 Ana (forest, home C0), 1 Ben (quarry, home C2), 2 Cara (riverbank, home C4).
const rich = { wood: 20, stone: 20, sandbag: 20 };
function game(tweak) {
  let s = newGame({ factories: true, settings: tweak });
  for (const p of s.players) s = setMats(s, p.seat, rich);
  return s;
}
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);
const build = (s, seat, id, kind = 'sustainable') => act(s, seat, 'buildFactory', { tile: id, kind });
/** Play one whole round with everyone Sustainable unless `choices` says otherwise. */
function round(s, choices) {
  s = allReady(s);
  s = allChoose(s, choices);
  if (s.phase === 'trade') s = allReady(s);
  return s;
}

test('factories: Base starts at Flood 5 by default; factories are on', () => {
  const s = newGame({ factories: true });
  assert.equal(s.flood, 5);
  assert.equal(s.settings.base.factoriesEnabled, true);
  assert.ok(s.board.tiles.every((t) => t.factory === null));
  // War modes keep their own starting Flood
  assert.equal(newGame({ factories: true, mode: 'war' }).flood, 2);
});

test('factories: build on home or next to your land, pay the cost, one per tile', () => {
  let s = game();
  assert.deepEqual(F.buildSites(s, 0).sort(), ['C0', 'E0', 'E5', 'I0']);
  s = build(s, 0, 'C0', 'sustainable');
  assert.deepEqual(tile(s, 'C0').factory, { owner: 0, kind: 'sustainable', built: 1 });
  assert.deepEqual(s.players[0].materials, { wood: 19, stone: 18, sandbag: 19 });
  assert.throws(() => build(s, 1, 'C0'), /already has a factory/);
  assert.throws(() => build(s, 0, 'C2'), /home tile or an empty tile next to/); // Ben's home
  assert.throws(() => build(s, 0, 'C3'), /home tile or an empty tile next to/); // not adjacent
  // Unsustainable is cheaper
  s = build(s, 0, 'E0', 'unsustainable');
  assert.deepEqual(s.players[0].materials, { wood: 18, stone: 17, sandbag: 19 });
  assert.equal(tile(s, 'E0').controller, 0);
});

test('factories: building one lets you expand further', () => {
  let s = game();
  assert.ok(!F.buildSites(s, 0).includes('I1'));
  s = build(s, 0, 'I0');
  assert.ok(F.buildSites(s, 0).includes('I1'), 'I1 is next to the new factory on I0');
});

test('factories: costs must be paid, only in build phases', () => {
  let s = newGame({ factories: true });
  s = setMats(s, 0, { wood: 1, stone: 1 });
  assert.throws(() => build(s, 0, 'C0', 'sustainable'), /You need/);
  s = build(s, 0, 'C0', 'unsustainable'); // 1 wood + 1 stone
  s = allReady(s);
  assert.throws(() => build(game(), 0, 'C0', 'nuclear'), /sustainable or unsustainable/);
  assert.throws(() => build(s, 1, 'C2'), /Talk & Build or Trade & Build/);
});

test('factories: at most 3 unsustainable per player', () => {
  let s = game();
  s = build(s, 0, 'C0', 'unsustainable');
  s = build(s, 0, 'E0', 'unsustainable');
  s = build(s, 0, 'E5', 'unsustainable');
  assert.throws(() => build(s, 0, 'I0', 'unsustainable'), /most unsustainable factories/);
  s = build(s, 0, 'I0', 'sustainable'); // sustainable is fine
});

test('factories: every factory makes its tile resource each round', () => {
  let s = game();
  s = build(s, 0, 'C0', 'sustainable'); // forest -> 1 wood
  s = build(s, 0, 'I0', 'unsustainable'); // quarry -> 2 stone
  const before = { ...s.players[0].materials };
  s = round(s);
  // Sustainable action: +2 wood (forest home), factories: +1 wood, +2 stone
  assert.equal(s.players[0].materials.wood, before.wood + 2 + 1);
  assert.equal(s.players[0].materials.stone, before.stone + 2);
  assert.equal(s.players[0].stats.factoryMade, 3);
});

test('factories: each unsustainable factory adds Flood every round', () => {
  let s = game();
  s = build(s, 0, 'C0', 'unsustainable');
  s = build(s, 1, 'C2', 'unsustainable');
  s = round(s);
  assert.equal(s.flood, 7);
  s = round(s); // still standing: +2 again -> 9, catastrophe at 8 for 3 players
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.catastrophe, true);
});

test('factories: every 3 sustainable factories on the board lower the Flood each round', () => {
  let s = game();
  s = build(s, 0, 'C0');
  s = build(s, 1, 'C2');
  assert.deepEqual(F.floodEffect(s), { up: 0, down: 0 }); // 2 is not enough
  s = build(s, 2, 'C4');
  assert.deepEqual(F.floodEffect(s), { up: 0, down: 1 }); // teamwork: 3 together
  s = round(s);
  assert.equal(s.flood, 4);
  // Green factories cancel out pollution
  s = build(s, 0, 'E0', 'unsustainable');
  s = round(s);
  assert.equal(s.flood, 4);
});

test('factories: the Flood never goes below 0', () => {
  let s = game((c) => (c.base.startingFlood = 0));
  s = build(s, 0, 'C0');
  s = build(s, 1, 'C2');
  s = build(s, 2, 'C4');
  s = round(s);
  assert.equal(s.flood, 0);
});

test('factories: Unsustainable action and unsustainable factories add up', () => {
  let s = game();
  s = build(s, 0, 'C0', 'unsustainable');
  s = round(s, { 1: { action: 'unsustainable', mix: { wood: 4 } } });
  assert.equal(s.flood, 7);
});

test('claim: replaces raid; only other players\' factories off their home tile', () => {
  let s = game();
  s = build(s, 0, 'C0'); // on Ana's home: safe
  s = build(s, 0, 'E0');
  s = allReady(s);
  assert.throws(() => act(s, 1, 'choose', { action: 'raid', target: 0 }), /replaced by "Claim a factory"/);
  assert.throws(() => act(s, 1, 'choose', { action: 'claim', target: 'C0' }), /home tile/);
  assert.throws(() => act(s, 0, 'choose', { action: 'claim', target: 'E0' }), /already your factory/);
  assert.throws(() => act(s, 1, 'choose', { action: 'claim', target: 'C3' }), /no factory there/);
  assert.deepEqual(F.claimTargets(s, 1), ['E0']);
  s = act(s, 1, 'choose', { action: 'claim', target: 'E0' });
  assert.equal(s.players[1].choice.action, 'claim');
});

test('claim: higher roll wins the factory; ties go to the owner; costs 1 wood', () => {
  let s = game();
  s = build(s, 0, 'E0');
  s = allReady(s);
  // Win: 5 vs 2
  let w = forceDice(s, [5, 2]);
  w = allChoose(w, { 1: { action: 'claim', target: 'E0' } });
  assert.equal(tile(w, 'E0').factory.owner, 1);
  assert.equal(tile(w, 'E0').controller, 1);
  assert.equal(w.players[1].materials.wood, 20 - 1);
  assert.equal(w.players[1].stats.claimsWon, 1);
  assert.equal(w.players[0].stats.factoriesLost, 1);
  // Tie: 4 vs 4 -> owner keeps it
  let t = forceDice(s, [4, 4]);
  t = allChoose(t, { 1: { action: 'claim', target: 'E0' } });
  assert.equal(tile(t, 'E0').factory.owner, 0);
  assert.equal(t.players[1].stats.claimsLost, 1);
});

test('claim: needs wood, and you can\'t claim past your unsustainable limit', () => {
  let s = game();
  s = build(s, 0, 'E0', 'unsustainable');
  s = build(s, 1, 'C2', 'unsustainable');
  s = build(s, 1, 'E1', 'unsustainable');
  s = build(s, 1, 'E2', 'unsustainable');
  s = allReady(s);
  assert.throws(() => act(s, 1, 'choose', { action: 'claim', target: 'E0' }), /more than 3 unsustainable/);
  let poor = setMats(s, 2, {});
  assert.throws(() => act(poor, 2, 'choose', { action: 'claim', target: 'E0' }), /wood/);
});

test('claim: counts as hostile for pacts', () => {
  let s = game();
  s = build(s, 0, 'E0');
  s = act(s, 0, 'proposePact', { to: 1, kind: 'peace', rounds: 2 });
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: true });
  s = allReady(s);
  s = forceDice(s, [1, 6]);
  s = allChoose(s, { 1: { action: 'claim', target: 'E0' } });
  assert.equal(s.pacts.filter((p) => p.status === 'active').length, 0);
  assert.equal(s.players[1].hits[0] || s.players[0].hits[1], 1);
});

test('demolish: only your own, only in build phases', () => {
  let s = game();
  s = build(s, 0, 'E0', 'unsustainable');
  assert.throws(() => act(s, 1, 'demolishFactory', { tile: 'E0' }), /isn't your factory/);
  s = act(s, 0, 'demolishFactory', { tile: 'E0' });
  assert.equal(tile(s, 'E0').factory, null);
  assert.equal(tile(s, 'E0').controller, null);
});

test('factories off: Base plays like the rulebook (raids, no factory actions)', () => {
  let s = newGame({ factories: true, settings: (c) => (c.base.factoriesEnabled = false) });
  assert.throws(() => build(s, 0, 'C0'), /switched off/);
  s = allReady(s);
  s = act(s, 1, 'choose', { action: 'raid', target: 0 });
  assert.throws(() => act(s, 1, 'choose', { action: 'claim', target: 'C0' }), /switched off/);
});

test('factories: the view lists my build sites and claim targets', () => {
  let s = game();
  s = build(s, 0, 'E0');
  const v = engine.viewFor(s, 1);
  assert.deepEqual(v.factories.claimTargets, ['E0']);
  assert.ok(v.factories.sites.includes('C2'));
  assert.deepEqual(v.factories.counts, { sustainable: 1, unsustainable: 0 });
  assert.equal(engine.viewFor(newGame({ factories: true, mode: 'war' }), 0).factories, undefined);
});
