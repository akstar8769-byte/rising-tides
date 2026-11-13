'use strict';
// Tests for stationed units (setting war.stationedUnits, on by default):
// units stand on tiles, move between your own tiles, and fight only where they are.
//
// 4-player board: seat 0 = C0 (capital), I0, E0   seat 1 = C1, I1, E1
// Neighbours used here: I0–I1, E0–I1, E0–C1, I1–C1, I1–E1, I0–I5 (open), C0–E5 (open)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, forceDice } = require('./helpers');

const BIOMES = ['forest', 'quarry', 'riverbank', 'forest'];

function stGame(mode = 'war', tweak) {
  let s = newGame({ n: 4, mode, biomes: BIOMES, settings: tweak });
  s = structuredClone(s);
  for (const t of s.board.tiles) if (t.kind === 'land') t.biome = t.owner != null ? s.players[t.owner].biome : 'quarry';
  return s;
}
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);
const at = (s, id, seat) => (tile(s, id).units[seat] || 0);

/** Put units on tiles (tests only). layout: { seat: { tileId: n } } — replaces that seat's units. */
function place(s, layout) {
  const c = structuredClone(s);
  for (const [seat, tiles] of Object.entries(layout)) {
    for (const t of c.board.tiles) delete t.units[seat];
    for (const [id, n] of Object.entries(tiles)) if (n) tile(c, id).units[seat] = n;
    c.players[seat].units = Object.values(tiles).reduce((a, b) => a + b, 0);
  }
  return c;
}
function edit(s, fn) {
  const c = structuredClone(s);
  fn(c);
  return c;
}
function chooseAll(s, choices = {}) {
  for (const p of s.players) {
    if (p.choice) continue;
    let c = choices[p.seat];
    if (!c) {
      const prod = engine.production(s, p.seat);
      const mix = { wood: 0, stone: 0, sandbag: 0 };
      for (let i = 0; i < prod.free; i++) mix[prod.allowed[i % prod.allowed.length]]++;
      c = { action: 'sustainable', mix };
    }
    s = act(s, p.seat, 'choose', c);
  }
  return s;
}
const attack = (target, from, count) => ({ action: 'attack', target, from, count });

test('stationed: on by default; starting units stand on the capital', () => {
  const s = stGame();
  assert.equal(s.settings.war.stationedUnits, true);
  for (const p of s.players) assert.equal(at(s, p.homeTile, p.seat), 1);
});

test('recruit: new units go on a tile you control (default: capital)', () => {
  let s = stGame();
  s = act(s, 0, 'recruit', { count: 1, materials: { wood: 1, stone: 1 }, tile: 'I0' });
  assert.equal(at(s, 'I0', 0), 1);
  assert.equal(s.players[0].units, 2);
  assert.throws(() => act(s, 0, 'recruit', { count: 1, materials: { wood: 0, sandbag: 1, stone: 0 }, tile: 'I1' }), /tile you control|2 materials/);
  s = edit(s, (c) => (c.players[0].materials = { wood: 5, stone: 5, sandbag: 5 }));
  assert.throws(() => act(s, 0, 'recruit', { count: 1, materials: { wood: 2 }, tile: 'I1' }), /tile you control/);
});

test('move: any distance through your own tiles, never into or through other tiles', () => {
  let s = place(stGame(), { 0: { C0: 3 } });
  s = act(s, 0, 'moveUnits', { from: 'C0', to: 'I0', count: 2 });
  assert.equal(at(s, 'C0', 0), 1);
  assert.equal(at(s, 'I0', 0), 2);
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'I0', to: 'I1', count: 1 }), /can't go there/); // enemy
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'I0', to: 'I5', count: 1 }), /can't go there/); // unclaimed open
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'I0', to: 'E0', count: 5 }), /only have 2/);
  s = allReady(s);
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'I0', to: 'E0', count: 1 }), /Trade & Build/);
});

test('attack: must come from your own tile next to the target, with units on it', () => {
  let s = allReady(place(stGame(), { 0: { C0: 1, I0: 2 } }));
  assert.throws(() => act(s, 0, 'choose', attack('I1', 'C0', 1)), /next to the target/); // C0 isn't next to I1
  assert.throws(() => act(s, 0, 'choose', attack('I1', 'I0', 3)), /only have 2/);
  assert.throws(() => act(s, 0, 'choose', attack('I1', 'I0', 0)), /at least 1/);
  s = act(s, 0, 'choose', attack('I1', 'I0', 2));
  assert.equal(s.players[0].choice.from, 'I0');
  assert.deepEqual(engine.viewFor(s, 0).attackSources.I1, [{ tile: 'I0', units: 2 }]);
});

test('defence: only units on the attacked tile defend — an empty tile falls automatically', () => {
  let s = allReady(place(stGame(), { 0: { I0: 3 } })); // seat 1's unit is on C1, not I1
  s = chooseAll(s, { 0: attack('I1', 'I0', 2) });
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(at(s, 'I1', 0), 2); // the attackers move in
  assert.equal(at(s, 'I0', 0), 1); // the rest stay behind
  assert.ok(s.log.some((l) => /Nobody was defending/.test(l.text)));
});

test('defence: you may leave nobody behind — the empty tile can then be taken', () => {
  let s = allReady(place(stGame(), { 0: { I0: 1 }, 1: { C1: 2 } }));
  s = chooseAll(s, { 0: attack('I5', 'I0', 1) }); // claim the open tile, emptying I0
  assert.equal(at(s, 'I0', 0), 0);
  assert.equal(at(s, 'I5', 0), 1);
  s = allReady(s); // round 2, Talk & Build
  s = act(s, 1, 'moveUnits', { from: 'C1', to: 'I1', count: 2 });
  s = allReady(s);
  s = chooseAll(s, { 1: attack('I0', 'I1', 1) });
  assert.equal(tile(s, 'I0').controller, 1);
});

test('battle: the dice use the units sent and the units on the tile; survivors retreat', () => {
  let s = place(stGame(), { 0: { I0: 1 }, 1: { I1: 2, C1: 1 } });
  s = forceDice(allReady(s), [6, 1, 1]); // 1 attack die vs 2 defence dice: 6 beats 1
  s = chooseAll(s, { 0: attack('I1', 'I0', 1) });
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(at(s, 'I1', 0), 1);
  assert.equal(at(s, 'I1', 1), 0);
  assert.equal(at(s, 'C1', 1), 2); // seat 1's surviving defender fell back to C1
  assert.equal(s.players[1].units, 2);
});

test('battle: a lost attack sends the survivors back where they came from', () => {
  let s = place(stGame(), { 0: { I0: 3 }, 1: { I1: 2 } });
  s = forceDice(allReady(s), [1, 2, 6, 6]); // 2 attack dice lose both pairs
  s = chooseAll(s, { 0: attack('I1', 'I0', 2) });
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(at(s, 'I0', 0), 1);
  assert.equal(s.players[0].units, 1);
});

test('clash: only the sent units fight; the winner moves in, the loser falls back', () => {
  let s = place(stGame(), { 0: { E0: 2, C0: 1 }, 1: { I1: 2, C1: 1 } });
  s = forceDice(allReady(s), [5, 3, 5, 2]); // tie + seat 0 wins
  s = chooseAll(s, { 0: attack('I1', 'E0', 2), 1: attack('E0', 'I1', 2) });
  assert.equal(s.clashCount, 1);
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(at(s, 'I1', 0), 1);
  assert.equal(at(s, 'E0', 0), 0); // E0 stays seat 0's, now empty
  assert.equal(tile(s, 'E0').controller, 0);
  assert.equal(s.players[1].units, 1); // only the C1 unit is left
});

test('upkeep: disbanding takes units from your biggest stack first', () => {
  let s = place(stGame(), { 0: { C0: 4, I0: 2 } });
  s = allReady(chooseAll(allReady(s)));
  s = chooseAll(allReady(s), { 0: attack('I5', 'I0', 1) });
  s = edit(s, (c) => (c.players[0].materials = { wood: 1, stone: 0, sandbag: 0 }));
  s = allReady(s); // round 2 -> round 3 upkeep
  assert.equal(s.round, 3);
  assert.equal(at(s, 'C0', 0), 3);
  assert.equal(s.players[0].units, 5);
});

test('withdrawing from an occupied tile sends the units there home to your capital', () => {
  let s = allReady(place(stGame(), { 0: { I0: 3, C0: 1 } }));
  s = chooseAll(s, { 0: attack('I1', 'I0', 2) });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  s = act(s, 0, 'planWithdraw', { tile: 'I1' });
  s = allReady(s);
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(at(s, 'C0', 0), 3);
});

test('turning stationing off gives the PDF army-everywhere rules', () => {
  const s = newGame({ n: 4, mode: 'war', biomes: BIOMES, settings: (c) => (c.war.stationedUnits = false) });
  assert.deepEqual(tile(s, 'C0').units, {});
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'C0', to: 'I0', count: 1 }), /not stationed/);
});

// ---------------------------------------------------------------- Empire
function captureSeat1() {
  let s = stGame('empire');
  s = edit(s, (c) => {
    tile(c, 'I1').controller = 0;
    tile(c, 'E1').controller = 0;
  });
  s = place(s, { 0: { E0: 3, I1: 1 }, 1: { C1: 1 } });
  s = forceDice(allReady(s), [6, 6, 6, 1, 1]);
  s = chooseAll(s, { 0: attack('C1', 'E0', 3) });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  return s;
}

test('empire: units on a captured capital are destroyed; its provinces return to it', () => {
  const s = captureSeat1();
  assert.equal(s.players[1].puppetOf, 0);
  assert.equal(at(s, 'C1', 1), 0);
  assert.equal(at(s, 'E0', 0), 3); // attackers never move into a capital
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(at(s, 'I1', 0), 1); // the overlord may keep units on a puppet's tile
});

test('empire: when a capital falls, a third party occupying its provinces goes home', () => {
  let s = stGame('empire');
  s = edit(s, (c) => {
    tile(c, 'I1').controller = 0;
    tile(c, 'E1').controller = 2; // seat 2 holds the other province
  });
  s = place(s, { 0: { E0: 3 }, 1: { C1: 1 }, 2: { E1: 2, C3: 1 } });
  s = forceDice(allReady(s), [6, 6, 6, 1, 1]);
  s = chooseAll(s, { 0: attack('C1', 'E0', 3) });
  assert.equal(tile(s, 'E1').controller, 1);
  assert.equal(at(s, 'E1', 2), 0);
  assert.equal(at(s, 'C3', 2), 3);
});

test("empire: an overlord can station units on a puppet's tile to defend it; freeing the puppet sends them home", () => {
  let s = captureSeat1();
  s = act(s, 0, 'moveUnits', { from: 'E0', to: 'C1', count: 2 });
  assert.equal(at(s, 'C1', 0), 2);
  s = act(s, 0, 'planRelease', { puppet: 1 });
  s = allReady(s);
  assert.equal(s.players[1].puppetOf, null);
  assert.equal(at(s, 'C1', 0), 0);
  assert.equal(at(s, 'C0', 0), 3);
});

test('empire: a revolt is launched from one of the puppet\'s own tiles', () => {
  let s = captureSeat1();
  s = allReady(s);
  s = edit(s, (c) => (c.players[1].materials = { wood: 2, stone: 2, sandbag: 2 }));
  s = act(s, 1, 'recruit', { count: 1, materials: { stone: 2 }, tile: 'C1' });
  s = allReady(s);
  assert.throws(() => act(s, 1, 'choose', { action: 'revolt', from: 'E0', count: 1 }), /own tiles/);
  s = act(s, 1, 'choose', { action: 'revolt', from: 'C1', count: 1 });
  assert.equal(s.players[1].choice.from, 'C1');
});

// ---------------------------------------------------------------- capital takes all (new default)
test('empire (default): when a capital falls, the rest of its land falls too; freedom gives it back', () => {
  let s = newGame({ n: 4, mode: 'empire', biomes: BIOMES, takeAll: true });
  s = structuredClone(s);
  for (const t of s.board.tiles) if (t.kind === 'land') t.biome = t.owner != null ? s.players[t.owner].biome : 'quarry';
  assert.equal(s.settings.empire.capitalTakesAll, true);
  s = edit(s, (c) => {
    tile(c, 'I1').controller = 0;
    tile(c, 'E1').controller = 2; // a third party holds the other province
    tile(c, 'I2').controller = 1; // seat 1 also holds an open tile, with troops on it
  });
  s = place(s, { 0: { E0: 3, I1: 1 }, 1: { C1: 1, I2: 2 }, 2: { E1: 1, C3: 1 } });
  s = forceDice(allReady(s), [6, 6, 6, 1, 1]);
  s = chooseAll(s, { 0: attack('C1', 'E0', 3) });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  assert.equal(s.players[1].puppetOf, 0);
  for (const id of ['I1', 'E1', 'I2']) assert.equal(tile(s, id).controller, 0, id + ' falls to the overlord');
  assert.equal(at(s, 'I2', 1), 0, "the puppet's troops there lay down their arms");
  assert.equal(at(s, 'E1', 2), 0, 'the third party goes home');
  assert.equal(at(s, 'C3', 2), 2);
  assert.equal(tile(s, 'C1').controller, 1, 'the puppet keeps its capital');
  assert.ok(s.log.some((e) => /falls with it/.test(e.text)));
  // Freed: its own provinces come back (the open tile stays with whoever holds it).
  s = act(s, 0, 'planRelease', { puppet: 1 });
  s = allReady(s);
  assert.equal(s.players[1].puppetOf, null);
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(tile(s, 'E1').controller, 1);
});
