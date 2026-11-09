'use strict';
// War's environmental cost grows with the size of the war:
//   army emissions — Flood +1 per 5 units a player owns, at every upkeep
//   destruction    — Flood +1 per 2 units destroyed in battle (any side)
// 4-player board: seat 0 = C0, I0, E0   seat 1 = C1, I1, E1   (I0 borders I1)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, forceDice } = require('./helpers');

const BIOMES = ['forest', 'quarry', 'riverbank', 'forest'];
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);

function game(tweak) {
  let s = newGame({ n: 4, mode: 'war', biomes: BIOMES, settings: tweak });
  return structuredClone(s);
}
/** Put units on tiles (tests only). layout: { seat: { tileId: n } } */
function place(s, layout) {
  const c = structuredClone(s);
  for (const [seat, tiles] of Object.entries(layout)) {
    for (const t of c.board.tiles) delete t.units[seat];
    for (const [id, n] of Object.entries(tiles)) if (n) tile(c, id).units[seat] = n;
    c.players[seat].units = Object.values(tiles).reduce((a, b) => a + b, 0);
  }
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
const round = (s, choices) => allReady(chooseAll(allReady(s), choices)); // one full round
const rich = (s) => {
  const c = structuredClone(s);
  c.players.forEach((p) => (p.materials = { wood: 20, stone: 20, sandbag: 20 }));
  return c;
};

test('army emissions: Flood +1 per 5 units each player owns, at upkeep', () => {
  let s = place(rich(game()), { 0: { C0: 11 }, 1: { C1: 4 }, 2: { C3: 5 } });
  s = round(s); // round 1 -> round 2 upkeep
  assert.equal(s.round, 2);
  assert.equal(s.flood, 2 + 2 + 0 + 1); // 11 units -> +2, 4 -> 0, 5 -> +1, seat 3 (1 unit) -> 0
  assert.equal(s.players[0].stats.armyFlood, 2);
  assert.equal(s.floodFromArmies, 3);
  assert.ok(s.log.some((l) => /Army emissions/.test(l.text)));
});

test('army emissions: a small defensive force (under 5 units) costs the planet nothing', () => {
  let s = place(rich(game()), { 0: { C0: 4 }, 1: { C1: 4 }, 2: { C3: 4 }, 3: { C4: 4 } });
  s = round(round(s));
  assert.equal(s.flood, 2);
});

test('army emissions: the view shows what your army will add next upkeep', () => {
  const s = place(game(), { 0: { C0: 10 } });
  assert.equal(engine.viewFor(s, 0).players[0].armyFloodDue, 2);
});

test('destruction: every 2 units destroyed in battle add Flood +1, on top of the attack', () => {
  let s = place(game(), { 0: { I0: 3 }, 1: { I1: 2 } });
  s = forceDice(allReady(s), [6, 6, 1, 1, 1]); // 3 attack dice vs 2: attacker wins both pairs -> 2 defenders destroyed
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', count: 3 } });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  assert.equal(s.flood, 2 + 1 + 1); // attack +1, 2 destroyed +1
  assert.equal(s.floodFromDestruction, 1);
});

test('destruction: an odd loss carries over to the next battle', () => {
  let s = place(game(), { 0: { I0: 1 }, 1: { I1: 1 } });
  s = forceDice(allReady(s), [1, 6]); // attacker loses 1 unit
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', count: 1 } });
  assert.equal(s.flood, 3); // only the attack's +1
  assert.equal(s.destroyedPool, 1);
});

test('destruction: claiming an empty tile destroys nothing', () => {
  let s = place(game(), { 0: { I0: 2 } });
  s = chooseAll(allReady(s), { 0: { action: 'attack', target: 'I5', from: 'I0', count: 2 } });
  assert.equal(s.flood, 3);
  assert.equal(s.destroyedPool, 0);
});

test('destruction can trigger a catastrophe mid-battle; remaining battles stop', () => {
  let s = game((c) => (c.general.startingFlood = 17)); // catastrophe at 20
  s = place(s, { 0: { I0: 3 }, 1: { I1: 2 }, 3: { I4: 3 }, 2: { C3: 1 } });
  s = forceDice(allReady(s), [6, 6, 1, 1, 1]);
  // 2 attacks -> Flood 19; the first battle destroys 2 -> Flood 20 = catastrophe
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', count: 3 }, 3: { action: 'attack', target: 'I3', from: 'I4', count: 3 } });
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.reason, 'catastrophe');
});

test('both can be switched off in the lobby (0 = off)', () => {
  let s = game((c) => {
    c.war.armyFloodPerUnits = 0;
    c.war.destructionFloodPerUnits = 0;
  });
  s = place(rich(s), { 0: { I0: 12 }, 1: { I1: 2 } });
  s = forceDice(allReady(s), [6, 6, 6, 1, 1]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', count: 3 } });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  s = allReady(s);
  assert.equal(s.flood, 3); // just the attack
});

test('record: Flood from armies and destruction is in the playtest record', () => {
  let s = place(rich(game()), { 0: { C0: 10 } });
  s = round(s);
  s = act(s, 'host', 'endGame');
  const rec = engine.playtestRecord(s);
  assert.equal(rec.floodFromArmies, 2);
  assert.equal(rec.players[0].armyFlood, 2);
  assert.match(engine.recordToCsv(rec), /flood_from_armies/);
});
