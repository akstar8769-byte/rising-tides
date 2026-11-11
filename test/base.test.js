'use strict';
// Unit tests for the Base game rules. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, allChoose, setMats, forceDice, U4 } = require('./helpers');
const { cloneDefaults, setSetting } = require('../config');

// ---------------------------------------------------------------- setup
test('setup: starting materials, walls, Flood and thresholds', () => {
  for (const [n, t] of [[3, 8], [4, 9], [5, 10]]) {
    const s = newGame({ n });
    assert.equal(s.flood, 2);
    assert.equal(engine.threshold(s), t);
    for (const p of s.players) {
      assert.deepEqual(p.materials, { wood: 1, stone: 1, sandbag: 1 });
      assert.equal(p.walls, 1);
    }
    assert.equal(s.phase, 'talk');
    assert.equal(s.round, 1);
  }
});

test('setup: needs 3 to 5 players and known biomes', () => {
  assert.throws(() => newGame({ n: 2, biomes: ['forest', 'quarry'] }), /3 to 5/);
  assert.throws(() => newGame({ biomes: ['forest', 'quarry', 'lava'] }), /Unknown biome/);
});

test('setup: default biomes — 4 players get Mixed, 5 players add a repeat', () => {
  const pickFirst = (arr) => arr[0];
  assert.deepEqual(engine.defaultBiomeList(3, pickFirst), ['forest', 'quarry', 'riverbank']);
  assert.deepEqual(engine.defaultBiomeList(4, pickFirst), ['forest', 'quarry', 'riverbank', 'mixed']);
  assert.deepEqual(engine.defaultBiomeList(5, pickFirst), ['forest', 'quarry', 'riverbank', 'mixed', 'forest']);
});

test('setup: each player has a home tile on the board', () => {
  const s = newGame({ n: 4 });
  const homes = s.board.tiles.filter((t) => t.role === 'capital');
  assert.equal(homes.length, 4);
  assert.equal(s.board.tiles.length, 19);
  for (const p of s.players) assert.equal(s.board.tiles.find((t) => t.id === p.homeTile).owner, p.seat);
});

// ---------------------------------------------------------------- walls
test('walls: cost 2 wood + 1 stone + 1 sandbag and give 2 protection', () => {
  let s = setMats(newGame(), 0, { wood: 4, stone: 2, sandbag: 2 });
  s = act(s, 0, 'buildWall', { count: 2 });
  assert.equal(s.players[0].walls, 3);
  assert.deepEqual(s.players[0].materials, { wood: 0, stone: 0, sandbag: 0 });
  assert.equal(engine.viewFor(s, 0).players[0].protection, 6);
});

test('walls: cannot build without enough materials', () => {
  const s = newGame(); // 1 of each
  assert.throws(() => act(s, 0, 'buildWall'), /You need 2 wood, 1 stone, 1 sandbag/);
});

test('walls: only during Talk/Trade & Build phases', () => {
  let s = setMats(allReady(newGame()), 0, { wood: 2, stone: 1, sandbag: 1 });
  assert.equal(s.phase, 'choose');
  assert.throws(() => act(s, 0, 'buildWall'), /Trade & Build/);
});

test('walls: wall cost is configurable', () => {
  let s = newGame({ settings: (c) => (c.base.wallCostWood = 1) });
  s = setMats(s, 0, { wood: 1, stone: 1, sandbag: 1 });
  s = act(s, 0, 'buildWall');
  assert.equal(s.players[0].walls, 2);
});

// ---------------------------------------------------------------- market
test('market: 3 of one material for 1 of another', () => {
  let s = setMats(newGame(), 0, { wood: 7 });
  s = act(s, 0, 'market', { give: 'wood', get: 'stone', times: 2 });
  assert.deepEqual(s.players[0].materials, { wood: 1, stone: 2, sandbag: 0 });
  assert.throws(() => act(s, 0, 'market', { give: 'wood', get: 'stone' }), /You need 3 wood/);
  assert.throws(() => act(s, 0, 'market', { give: 'stone', get: 'stone' }), /different/);
});

// ---------------------------------------------------------------- seawall
test('seawall: every 6 donated raises the threshold by 1, up to +3', () => {
  let s = newGame(); // threshold 8
  for (const seat of [0, 1, 2]) s = setMats(s, seat, { wood: 10, stone: 10 });
  s = act(s, 0, 'donate', { materials: { wood: 5 } });
  assert.equal(engine.threshold(s), 8);
  s = act(s, 1, 'donate', { materials: { stone: 1 } }); // total 6 (shared across players)
  assert.equal(engine.threshold(s), 9);
  s = act(s, 2, 'donate', { materials: { wood: 10, stone: 10 } }); // total 26
  assert.equal(engine.threshold(s), 11); // capped at +3
  assert.equal(s.players[0].donated, 5);
  assert.equal(s.players[0].materials.wood, 5);
});

test('seawall: cannot donate what you do not have', () => {
  const s = newGame();
  assert.throws(() => act(s, 0, 'donate', { materials: { wood: 2 } }), /don't have/);
  assert.throws(() => act(s, 0, 'donate', { materials: {} }), /Choose some/);
  assert.throws(() => act(s, 0, 'donate', { materials: { wood: -1 } }), /Invalid/);
  assert.throws(() => act(s, 0, 'donate', { materials: { gold: 1 } }), /Unknown material/);
});

// ---------------------------------------------------------------- trading
test('trading: propose, accept swaps materials; reject and cancel remove offers', () => {
  let s = newGame();
  s = act(s, 0, 'proposeTrade', { to: 1, give: { wood: 1 }, get: { stone: 1 } });
  assert.equal(s.trades.length, 1);
  const id = s.trades[0].id;
  assert.throws(() => act(s, 2, 'acceptTrade', { id }), /not for you/);
  s = act(s, 1, 'acceptTrade', { id });
  assert.deepEqual(s.players[0].materials, { wood: 0, stone: 2, sandbag: 1 });
  assert.deepEqual(s.players[1].materials, { wood: 2, stone: 0, sandbag: 1 });
  assert.equal(s.trades.length, 0);

  s = act(s, 0, 'proposeTrade', { to: 2, give: { stone: 1 }, get: { wood: 1 } });
  s = act(s, 2, 'rejectTrade', { id: s.trades[0].id });
  assert.equal(s.trades.length, 0);
  s = act(s, 0, 'proposeTrade', { to: 2, give: { stone: 1 }, get: { wood: 1 } });
  s = act(s, 0, 'cancelTrade', { id: s.trades[0].id });
  assert.equal(s.trades.length, 0);
});

test('trading: accept fails if either side no longer has the materials', () => {
  let s = newGame();
  s = act(s, 0, 'proposeTrade', { to: 1, give: { wood: 1 }, get: { stone: 1 } });
  const id = s.trades[0].id;
  s = act(s, 0, 'gift', { to: 2, materials: { wood: 1 } }); // proposer gives away the wood
  assert.throws(() => act(s, 1, 'acceptTrade', { id }), /no longer has/);
  assert.throws(() => act(s, 0, 'proposeTrade', { to: 1, give: { wood: 5 }, get: { stone: 1 } }), /don't have/);
});

test('gifts: move materials for free; open offers close when choosing starts', () => {
  let s = newGame();
  s = act(s, 0, 'gift', { to: 1, materials: { wood: 1, stone: 1 } });
  assert.deepEqual(s.players[1].materials, { wood: 2, stone: 2, sandbag: 1 });
  assert.throws(() => act(s, 0, 'gift', { to: 0, materials: { sandbag: 1 } }), /yourself/);
  s = act(s, 2, 'proposeTrade', { to: 1, give: { wood: 1 }, get: { stone: 1 } });
  s = allReady(s);
  assert.equal(s.trades.length, 0);
});

// ---------------------------------------------------------------- choosing & collecting
test('choose: validation of mixes, raid wood and targets', () => {
  let s = allReady(newGame({ n: 4 }));
  assert.throws(() => act(s, 0, 'choose', { action: 'unsustainable', mix: { wood: 3 } }), /exactly 4/);
  assert.throws(() => act(s, 3, 'choose', { action: 'sustainable', mix: { wood: 3 } }), /exactly 2/); // Mixed
  assert.throws(() => act(s, 0, 'choose', { action: 'raid', target: 0 }), /yourself/);
  assert.throws(() => act(s, 0, 'choose', { action: 'dance' }), /Choose Sustainable/);
  s = setMats(s, 1, {});
  assert.throws(() => act(s, 1, 'choose', { action: 'raid', target: 0 }), /at least 1 wood/);
  assert.throws(() => act(newGame(), 0, 'choose', { action: 'sustainable' }), /not time/);
});

test('reveal: Sustainable collects home resource, Unsustainable any 4 and Flood +1 each', () => {
  let s = allReady(newGame({ n: 4 }));
  s = allChoose(s, {
    0: { action: 'sustainable' }, // forest -> 2 wood
    1: { action: 'unsustainable', mix: U4 },
    2: { action: 'unsustainable', mix: { sandbag: 4 } },
    3: { action: 'sustainable', mix: { stone: 2 } }, // mixed
  });
  assert.equal(s.phase, 'trade');
  assert.deepEqual(s.players[0].materials, { wood: 3, stone: 1, sandbag: 1 });
  assert.deepEqual(s.players[1].materials, { wood: 3, stone: 2, sandbag: 2 });
  assert.deepEqual(s.players[2].materials, { wood: 1, stone: 1, sandbag: 5 });
  assert.deepEqual(s.players[3].materials, { wood: 1, stone: 3, sandbag: 1 });
  assert.equal(s.flood, 4);
});

test('choices can be changed until the last player locks in', () => {
  let s = allReady(newGame());
  s = act(s, 0, 'choose', { action: 'unsustainable', mix: U4 });
  s = act(s, 0, 'choose', { action: 'sustainable' });
  s = allChoose(s, { 0: { action: 'sustainable' } });
  assert.equal(s.flood, 2);
});

// ---------------------------------------------------------------- catastrophe
test('catastrophe: Flood reaching the threshold ends the game for everyone', () => {
  let s = newGame({ settings: (c) => (c.base.startingFlood = 6) }); // threshold 8
  s = allReady(s);
  s = allChoose(s, { 0: { action: 'unsustainable', mix: U4 }, 1: { action: 'unsustainable', mix: U4 } });
  assert.equal(s.flood, 8);
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.reason, 'catastrophe');
  assert.deepEqual(s.outcome.winners, []);
  assert.ok(s.outcome.results.every((r) => !r.survived));
  assert.throws(() => act(s, 0, 'ready'), /game is over/);
});

test('catastrophe: one below the threshold is still safe; seawall bonus counts', () => {
  let s = newGame({ settings: (c) => (c.base.startingFlood = 7) });
  s = setMats(s, 0, { wood: 6 });
  s = act(s, 0, 'donate', { materials: { wood: 6 } }); // threshold 9
  s = allReady(s);
  s = allChoose(s, { 1: { action: 'unsustainable', mix: U4 } }); // Flood 8
  assert.equal(s.flood, 8);
  assert.equal(s.phase, 'trade');
});

// ---------------------------------------------------------------- raids
function raidSetup() {
  // Ana raids Ben. Ana has 2 wood, Ben has 1 wood + plenty to steal.
  let s = newGame();
  s = setMats(s, 0, { wood: 2 });
  s = setMats(s, 1, { wood: 1, stone: 3, sandbag: 3 });
  return allReady(s);
}

test('raid: both pay 1 wood; raider must roll strictly higher (tie = defence)', () => {
  let s = forceDice(raidSetup(), [4, 4]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 } });
  assert.equal(s.phase, 'trade');
  assert.equal(s.players[0].materials.wood, 1); // paid 1
  assert.equal(s.players[1].materials.wood, 0); // paid 1 to defend
  assert.equal(s.players[1].materials.stone, 5); // 3 + 2 collected, nothing stolen
  assert.equal(s.players[0].stats.raidsLost, 1);
  const entry = s.log.filter((l) => l.dice).pop();
  assert.deepEqual(entry.dice.sides.map((x) => x.rolls[0]), [4, 4]);
});

test('raid: higher roll wins and the raider picks up to 3 tokens', () => {
  let s = forceDice(raidSetup(), [5, 2]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 } });
  assert.equal(s.phase, 'loot');
  assert.deepEqual(engine.waitingFor(s), [0]);
  assert.throws(() => act(s, 1, 'pickLoot', { materials: { stone: 3 } }), /Only the winning raider/);
  assert.throws(() => act(s, 0, 'pickLoot', { materials: { stone: 2 } }), /exactly 3/);
  assert.throws(() => act(s, 0, 'pickLoot', { materials: { stone: 4 } }), /exactly 3|doesn't have/);
  s = act(s, 0, 'pickLoot', { materials: { stone: 1, sandbag: 2 } });
  assert.equal(s.phase, 'trade');
  assert.deepEqual(s.players[0].materials, { wood: 1, stone: 1, sandbag: 2 });
  assert.deepEqual(s.players[1].materials, { wood: 0, stone: 4, sandbag: 1 }); // had 3+2 collected stone
});

test('raid: defender with no wood loses automatically (raider still pays)', () => {
  let s = newGame();
  s = setMats(s, 0, { wood: 1 });
  s = setMats(s, 1, { stone: 2 });
  s = allChoose(allReady(s), { 0: { action: 'raid', target: 1 } });
  assert.equal(s.players[0].materials.wood, 0);
  // Ben has 4 stone (2 + 2 collected) — only one kind, so 3 stone are taken automatically
  assert.equal(s.players[0].materials.stone, 3);
  assert.equal(s.players[1].materials.stone, 1);
});

test('raid: a raider who lost their wood to an earlier raid fizzles', () => {
  // Starting player Ana raids Ben first and takes Ben's only wood; Ben's own raid fizzles.
  let s = newGame();
  s = setMats(s, 0, { wood: 1, stone: 5 });
  s = setMats(s, 1, { wood: 1 });
  s = forceDice(allReady(s), [6, 1]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 }, 1: { action: 'raid', target: 0 } });
  // Ben paid 1 wood to defend, then had none for his own raid.
  assert.equal(s.players[1].materials.wood, 0);
  assert.ok(s.log.some((l) => /fizzles/.test(l.text)));
  assert.equal(s.players[0].materials.stone, 5);
});

test('raid: several raids resolve clockwise from the starting player', () => {
  let s = newGame();
  s = setMats(s, 0, { wood: 3, stone: 3 });
  s = setMats(s, 1, { wood: 3 });
  s = setMats(s, 2, { wood: 3 });
  // Round 2, so Ben is the starting player: order Ben, Cara, Ana
  s = allReady(allChoose(allReady(s)));
  assert.equal(s.startingPlayer, 1);
  s = allReady(s);
  s = forceDice(s, [1, 6, 1, 6, 1, 6]); // every raid fails
  s = allChoose(s, { 0: { action: 'raid', target: 1 }, 1: { action: 'raid', target: 0 }, 2: { action: 'raid', target: 0 } });
  const raidLines = s.log.filter((l) => / raided /.test(l.text)).map((l) => l.text.split(' raided')[0]);
  assert.deepEqual(raidLines, ['Ben', 'Cara', 'Ana']);
});

test('raid: if the raider does not pick in time, loot is chosen at random', () => {
  let s = forceDice(raidSetup(), [6, 1]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 } });
  assert.throws(() => act(s, 0, 'lootTimeout'), /server/);
  s = act(s, 'system', 'lootTimeout');
  assert.equal(s.phase, 'trade');
  const got = s.players[0].materials;
  assert.equal(got.stone + got.sandbag, 3);
  assert.equal(s.players[1].materials.stone + s.players[1].materials.sandbag, 5); // 6 + 2 collected - 3
});

test('raid: no Flood change', () => {
  let s = forceDice(raidSetup(), [1, 6]);
  s = allChoose(s, { 0: { action: 'raid', target: 1 } });
  assert.equal(s.flood, 2);
});

// ---------------------------------------------------------------- rounds & ending
test('rounds: starting player passes clockwise; game ends after the last round', () => {
  let s = newGame({ settings: (c) => (c.base.rounds = 3) });
  for (let r = 1; r <= 3; r++) {
    assert.equal(s.round, r);
    assert.equal(s.startingPlayer, (r - 1) % 3);
    s = allReady(allChoose(allReady(s)));
  }
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.reason, 'rounds');
});

test('storm: from the set round, a roll of 1-2 ends the game', () => {
  const opts = { settings: (c) => Object.assign(c.base, { stormEnabled: true, stormFromRound: 2 }) };
  let s = newGame(opts);
  s = allReady(allChoose(allReady(s))); // round 1: no roll
  assert.equal(s.round, 2);
  s = forceDice(s, [3]);
  s = allReady(allChoose(allReady(s))); // round 2: roll 3 -> continues
  assert.equal(s.round, 3);
  s = forceDice(s, [2]);
  s = allReady(allChoose(allReady(s))); // round 3: roll 2 -> ends
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.reason, 'storm');
});

test('storm: off by default', () => {
  let s = newGame();
  assert.equal(s.settings.base.stormEnabled, false);
  for (let r = 0; r < 6; r++) s = allReady(allChoose(allReady(s)));
  assert.equal(s.round, 7);
});

// ---------------------------------------------------------------- scoring
function finishWith(setup) {
  let s = newGame({ settings: (c) => (c.base.rounds = 1) });
  s = setup(s);
  return allReady(allChoose(allReady(s), { 0: { action: 'sustainable' }, 1: { action: 'sustainable' }, 2: { action: 'sustainable' } }));
}

test('scoring: survive if protection >= final Flood; score = spare + seawall points', () => {
  const s = finishWith((s) => {
    s = setMats(s, 0, { wood: 5 });
    s = act(s, 0, 'donate', { materials: { wood: 2 } }); // Ana: 3 wood left (+2 collected) + 2 seawall points
    s = structuredClone(s);
    s.players[2].walls = 0; // Cara will flood
    return s;
  });
  const r = s.outcome.results;
  assert.equal(s.flood, 2);
  assert.equal(r[0].survived, true); // protection 2 >= Flood 2
  assert.equal(r[0].spare, 5);
  assert.equal(r[0].seawallPoints, 2);
  assert.equal(r[0].score, 7);
  assert.equal(r[1].score, 5);
  assert.equal(r[2].survived, false);
  assert.equal(r[2].score, 0);
  assert.deepEqual(s.outcome.winners, [0]);
});

test('scoring: ties share the win', () => {
  const s = finishWith((s) => s); // everyone ends with 5 materials
  assert.deepEqual(s.outcome.winners, [0, 1, 2]);
});

test('scoring: if nobody survives, nobody wins', () => {
  const s = finishWith((s) => {
    s = structuredClone(s);
    s.players.forEach((p) => (p.walls = 0));
    return s;
  });
  assert.deepEqual(s.outcome.winners, []);
  assert.ok(s.outcome.results.every((r) => !r.survived));
});

// ---------------------------------------------------------------- server-side safety
test('safety: unknown actions, out-of-phase actions and non-players are rejected', () => {
  const s = newGame();
  assert.throws(() => act(s, 0, 'stealEverything'), /Unknown action/);
  assert.throws(() => act(s, 0, 'pickLoot', { materials: {} }), /no loot/);
  assert.throws(() => act(s, 7, 'ready'), /Only seated players/);
  assert.throws(() => act(s, 0, 'skip', { seat: 1 }), /Only the host/);
  assert.throws(() => act(s, 0, 'constructor'), /Unknown action/);
});

test('safety: applyAction never changes the old state', () => {
  const s = newGame();
  const before = JSON.stringify(s);
  act(s, 0, 'ready');
  assert.equal(JSON.stringify(s), before);
});

test('view: secret choices, trades, seed and (optionally) materials are hidden', () => {
  let s = allReady(newGame());
  s = act(s, 0, 'choose', { action: 'unsustainable', mix: U4 });
  const v = engine.viewFor(s, 1);
  assert.equal(v.players[0].choice, null);
  assert.equal(v.players[0].hasChosen, true);
  assert.equal(v.rng, undefined);
  assert.ok(engine.viewFor(s, 0).players[0].choice); // you see your own

  let t = act(newGame(), 0, 'proposeTrade', { to: 1, give: { wood: 1 }, get: { stone: 1 } });
  assert.equal(engine.viewFor(t, 2).trades.length, 0);
  assert.equal(engine.viewFor(t, 1).trades.length, 1);

  const h = newGame({ settings: (c) => (c.general.hideOtherMaterials = true) });
  const hv = engine.viewFor(h, 0);
  assert.equal(hv.players[1].materials, null);
  assert.equal(hv.players[1].materialTotal, 3);
  assert.ok(hv.players[0].materials);
});

test('host: skip marks ready, plays Sustainable, or picks loot; end game scores now', () => {
  let s = newGame({ n: 4 });
  s = act(s, 0, 'ready');
  s = act(s, 1, 'ready');
  s = act(s, 2, 'ready');
  s = act(s, 'host', 'skip', { seat: 3 });
  assert.equal(s.phase, 'choose');
  s = allChoose(s, { 3: undefined, 0: { action: 'sustainable' } });
  // (allChoose chose for everyone; test skip in choose on a fresh round)
  s = allReady(s);
  s = allReady(s);
  for (const seat of [0, 1, 2]) s = act(s, seat, 'choose', { action: 'sustainable' });
  s = act(s, 'host', 'skip', { seat: 3 }); // Mixed player gets an even mix
  assert.equal(s.phase, 'trade');
  s = act(s, 'host', 'endGame');
  assert.equal(s.phase, 'ended');
  assert.equal(s.outcome.reason, 'host');
});

// ---------------------------------------------------------------- config & record
test('config: setSetting checks types and ranges', () => {
  const c = cloneDefaults();
  assert.equal(setSetting(c, 'base.rounds', '9').base.rounds, 9);
  assert.equal(setSetting(c, 'base.catastrophe.4', 12).base.catastrophe[4], 12);
  assert.equal(setSetting(c, 'base.stormEnabled', true).base.stormEnabled, true);
  assert.throws(() => setSetting(c, 'base.rounds', 0), /whole number/);
  assert.throws(() => setSetting(c, 'base.rounds', 2.5), /whole number/);
  assert.throws(() => setSetting(c, 'base.nope', 1), /Unknown setting/);
  assert.throws(() => setSetting(c, 'base', 1), /Unknown setting/);
  assert.equal(c.base.rounds, 7); // original untouched
});

test('record: playtest record has the summary fields and a CSV row per player', () => {
  let s = newGame({ settings: (c) => (c.base.rounds = 1) });
  s = allReady(allChoose(allReady(s), { 1: { action: 'unsustainable', mix: U4 } }));
  const rec = engine.playtestRecord(s, { startedAt: 0 + 1, endedAt: 1 + 600000 });
  assert.equal(rec.mode, 'base');
  assert.equal(rec.finalFlood, 3);
  assert.equal(rec.lengthMinutes, 10);
  assert.equal(rec.players[1].actions.unsustainable, 1);
  const csv = engine.recordToCsv(rec).trim().split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^date,mode,/);
});
