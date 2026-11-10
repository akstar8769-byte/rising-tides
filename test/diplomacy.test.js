'use strict';
// Pacts (never enforced — just recorded and announced) and treaties (enforced).
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, allChoose, setMats, forceDice } = require('./helpers');

const treatyGame = (opts = {}) => newGame({ ...opts, settings: (c) => ((c.general.treatiesEnabled = true), opts.settings && opts.settings(c)) });
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);

// ---------------------------------------------------------------- pacts
test('pacts: propose, accept, shown to everyone, kept when they run out', () => {
  let s = newGame();
  s = act(s, 0, 'proposePact', { to: 1, kind: 'peace', rounds: 1 });
  assert.equal(engine.viewFor(s, 2).pacts.length, 0); // offers are private
  assert.throws(() => act(s, 2, 'respondPact', { id: s.pacts[0].id, accept: true }), /not for you/);
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: true });
  assert.equal(engine.viewFor(s, 2).pacts.length, 1); // active pacts are public
  assert.equal(s.pacts[0].until, 1); // made before choosing: covers this round
  s = allReady(allChoose(allReady(s)));
  assert.equal(s.pacts.length, 0);
  assert.equal(s.players[0].stats.pactsKept, 1);
  assert.ok(s.log.some((l) => /ended peacefully/.test(l.text)));
});

test('pacts: an alliance names a shared enemy; offers can be declined or withdrawn', () => {
  let s = newGame();
  assert.throws(() => act(s, 0, 'proposePact', { to: 1, kind: 'alliance' }), /shared enemy/);
  s = act(s, 0, 'proposePact', { to: 1, kind: 'alliance', enemy: 2, rounds: 2 });
  assert.throws(() => act(s, 0, 'proposePact', { to: 1 }), /already a pact offer/);
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: false });
  assert.equal(s.pacts.length, 0);
  s = act(s, 0, 'proposePact', { to: 2, rounds: 3 });
  s = act(s, 0, 'cancelPact', { id: s.pacts[0].id });
  assert.equal(s.pacts.length, 0);
  assert.throws(() => act(s, 0, 'proposePact', { to: 2, rounds: 9 }), /1 to 3 rounds/);
});

test('pacts are never enforced: raiding your partner is allowed but announced and remembered', () => {
  let s = newGame();
  s = act(s, 0, 'proposePact', { to: 1 });
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: true });
  s = setMats(allReady(s), 0, { wood: 2 });
  s = forceDice(s, [1, 6]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 } });
  assert.equal(s.pacts.length, 0);
  assert.equal(s.players[0].betrayals, 1);
  assert.equal(s.players[0].stats.pactsBroken, 1);
  assert.equal(s.players[1].hits[0], 1);
  assert.ok(s.log.some((l) => /BROKE their non-aggression pact/.test(l.text)));
});

test('pacts: attacking a partner in War breaks the pact too', () => {
  let s = newGame({ n: 4, mode: 'war', biomes: ['forest', 'quarry', 'riverbank', 'forest'], settings: (c) => (c.war.stationedUnits = false) });
  s = act(s, 0, 'proposePact', { to: 1 });
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: true });
  s = forceDice(allReady(s), [1, 6]);
  s = allChoose(s, { 0: { action: 'attack', target: 'I1' }, 3: { action: 'sustainable', mix: { wood: 1, stone: 1 } } });
  assert.equal(s.players[0].betrayals, 1);
});

test('pacts can be switched off', () => {
  const s = newGame({ settings: (c) => (c.general.pactsEnabled = false) });
  assert.throws(() => act(s, 0, 'proposePact', { to: 1 }), /switched off/);
});

// ---------------------------------------------------------------- treaties
test('treaties: off by default', () => {
  assert.throws(() => act(newGame(), 0, 'proposeTreaty', { name: 'Green deal', clauses: { noUnsustainable: true }, invite: [1] }), /switched off/);
});

test('treaties: proposed, signed, then binding — no Unsustainable for signatories', () => {
  let s = treatyGame();
  s = act(s, 0, 'proposeTreaty', { name: 'Green deal', clauses: { noUnsustainable: true }, invite: [1, 2], rounds: 0 });
  const id = s.treaties[0].id;
  assert.equal(s.treaties[0].active, false);
  s = act(s, 1, 'signTreaty', { id });
  assert.equal(s.treaties[0].active, true);
  s = allReady(s);
  assert.throws(() => act(s, 0, 'choose', { action: 'unsustainable', mix: { wood: 4 } }), /Green deal/);
  assert.throws(() => act(s, 1, 'choose', { action: 'unsustainable', mix: { wood: 4 } }), /Green deal/);
  s = act(s, 2, 'choose', { action: 'unsustainable', mix: { wood: 4 } }); // seat 2 never signed
});

test('treaties: a militia cap blocks recruiting above it, and you cannot sign while over it', () => {
  let s = treatyGame({ n: 4, mode: 'war', biomes: ['forest', 'quarry', 'riverbank', 'mixed'] });
  s = structuredClone(s);
  s.players.forEach((p) => (p.materials = { wood: 9, stone: 9, sandbag: 9 }));
  s = act(s, 2, 'recruit', { count: 2, materials: { wood: 4 } }); // seat 2 now has 3 units
  s = act(s, 0, 'proposeTreaty', { name: 'Small armies', clauses: { maxUnits: 2 }, invite: [1, 2] });
  const id = s.treaties[0].id;
  assert.throws(() => act(s, 2, 'signTreaty', { id }), /allows 2/);
  s = act(s, 1, 'signTreaty', { id });
  s = act(s, 0, 'recruit', { count: 1, materials: { wood: 2 } }); // 2 units: allowed
  assert.throws(() => act(s, 0, 'recruit', { count: 1, materials: { wood: 2 } }), /no more than 2 militia/);
});

test('treaties: no attacks on fellow signatories (but others are fair game)', () => {
  let s = treatyGame({ n: 3 });
  s = act(s, 0, 'proposeTreaty', { name: 'Peace', clauses: { noAttackSignatories: true }, invite: [1] });
  s = act(s, 1, 'signTreaty', { id: s.treaties[0].id });
  s = setMats(allReady(s), 0, { wood: 3 });
  assert.throws(() => act(s, 0, 'choose', { action: 'raid', target: 1 }), /forbids that attack/);
  s = act(s, 0, 'choose', { action: 'raid', target: 2 });
});

test('treaties: breaking one frees you, marks you and costs the penalty; it ends below 2 signatories', () => {
  let s = treatyGame({ n: 3 });
  s = act(s, 0, 'proposeTreaty', { name: 'Peace', clauses: { noAttacks: true }, invite: [1] });
  s = act(s, 1, 'signTreaty', { id: s.treaties[0].id });
  s = setMats(s, 1, { wood: 5, stone: 1 });
  s = act(s, 1, 'breakTreaty', { id: s.treaties[0].id });
  assert.equal(s.players[1].treatyBreaks, 1);
  assert.deepEqual(s.players[1].materials, { wood: 2, stone: 1, sandbag: 0 }); // 3 forfeited
  assert.equal(s.treaties.length, 0);
  s = allReady(s);
  s = act(s, 1, 'choose', { action: 'raid', target: 0 });
});

test('treaties: expire after their rounds', () => {
  let s = treatyGame({ n: 3 });
  s = act(s, 0, 'proposeTreaty', { name: 'Short', clauses: { noUnsustainable: true }, invite: [1], rounds: 1 });
  s = act(s, 1, 'signTreaty', { id: s.treaties[0].id });
  s = allReady(allChoose(allReady(s)));
  assert.equal(s.treaties.length, 0);
  assert.ok(s.log.some((l) => /run its course/.test(l.text)));
});

test('treaties: validation', () => {
  const s = treatyGame();
  assert.throws(() => act(s, 0, 'proposeTreaty', { name: '', clauses: { noAttacks: true }, invite: [1] }), /name/);
  assert.throws(() => act(s, 0, 'proposeTreaty', { name: 'X', clauses: {}, invite: [1] }), /at least one rule/);
  assert.throws(() => act(s, 0, 'proposeTreaty', { name: 'X', clauses: { noAttacks: true }, invite: [] }), /Invite/);
  assert.throws(() => act(s, 0, 'proposeTreaty', { name: 'X', clauses: { maxUnits: 2 }, invite: [1] }), /War modes/);
});

test('record: pact and treaty stats are in the playtest record', () => {
  let s = newGame({ settings: (c) => (c.base.rounds = 1) });
  s = act(s, 0, 'proposePact', { to: 1 });
  s = act(s, 1, 'respondPact', { id: s.pacts[0].id, accept: true });
  s = allReady(allChoose(allReady(s)));
  const rec = engine.playtestRecord(s);
  assert.equal(rec.players[0].pactsMade, 1);
  assert.match(engine.recordToCsv(rec), /pacts_broken/);
});
