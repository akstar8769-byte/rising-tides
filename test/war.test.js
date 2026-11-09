'use strict';
// Unit tests for War mode and the Empire rules. Run with: npm test
//
// 4-player board (engine/layouts.js): seat 0 = C0 (capital), I0, E0
//   seat 1 = C1, I1, E1   seat 2 = C3, I3, E3   seat 3 = C4, I4, E4
//   open tiles: C2, I2, E2, C5, I5, E5
// Seat 0 borders seat 1 (I0–I1, E0–I1, E0–C1) and the open tiles I5, E5.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady, forceDice } = require('./helpers');

const BIOMES = ['forest', 'quarry', 'riverbank', 'forest']; // no Mixed: keeps production simple

/**
 * A War/Empire game where every territory tile has its owner's biome (no random odd tile).
 * These tests use the PDF's "one army everywhere" rules; stationed units are in stationed.test.js.
 */
function warGame(mode = 'war', tweak) {
  let s = newGame({
    n: 4,
    mode,
    biomes: BIOMES,
    settings: (c) => {
      c.war.stationedUnits = false;
      c.war.occupationFlood = 1; // the PDF's numbers, so these mechanics stay tested
      c.war.capitalOpensAfter = 2;
      c.war.armyFloodPerUnits = 0; // army and destruction Flood are tested in war-flood.test.js
      c.war.destructionFloodPerUnits = 0;
      if (tweak) tweak(c);
    },
  });
  s = structuredClone(s);
  for (const t of s.board.tiles) if (t.kind === 'land') t.biome = t.owner != null ? s.players[t.owner].biome : 'quarry';
  return s;
}
/** Change the state directly (tests only). */
function edit(s, fn) {
  const c = structuredClone(s);
  fn(c);
  return c;
}
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);
const total = (b) => b.wood + b.stone + b.sandbag;

/** Everyone chooses; default Sustainable (with an even mix if they must pick one). */
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
/** Finish the current round (trade phase Ready) and land in the next round's Talk & Build. */
const nextRound = (s) => allReady(s);

// ---------------------------------------------------------------- setup
test('war setup: 3-tile territories, 6 open tiles with 4 players, 1 unit, threshold 20, Accord 10', () => {
  const s = warGame();
  for (const p of s.players) {
    const mine = s.board.tiles.filter((t) => t.owner === p.seat);
    assert.equal(mine.length, 3);
    assert.equal(mine.filter((t) => t.role === 'capital').length, 1);
    assert.equal(p.units, 1);
  }
  assert.equal(s.board.tiles.filter((t) => t.kind === 'land' && t.owner == null).length, 6);
  assert.equal(engine.threshold(s), 20);
  assert.equal(engine.viewFor(s, 0).war.accordLine, 10);
});

test('war setup: two tiles are the home biome, one province is a different biome', () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = newGame({ n: 4, mode: 'war', biomes: BIOMES, seed });
    for (const p of s.players) {
      const biomes = s.board.tiles.filter((t) => t.owner === p.seat).map((t) => t.biome);
      assert.equal(biomes.filter((b) => b === p.biome).length, 2);
    }
  }
});

test('war setup: 3 and 5 players get territories too', () => {
  for (const n of [3, 5]) {
    const s = newGame({ n, mode: 'war', biomes: ['forest', 'quarry', 'riverbank', 'mixed', 'forest'].slice(0, n) });
    assert.equal(s.board.tiles.filter((t) => t.role === 'capital').length, n);
    assert.equal(s.board.tiles.filter((t) => t.role === 'province').length, 2 * n);
  }
});

// ---------------------------------------------------------------- production
test('income: every tile gives 1 of its resource each round; Sustainable +2 home resource; Unsustainable +6 any mix, Flood +1', () => {
  let s = allReady(warGame());
  s = chooseAll(s, { 1: { action: 'unsustainable', mix: { wood: 2, stone: 2, sandbag: 2 } } });
  assert.deepEqual(s.players[0].materials, { wood: 6, stone: 1, sandbag: 1 }); // 3 forest tiles + 2 wood
  assert.deepEqual(s.players[1].materials, { wood: 3, stone: 6, sandbag: 3 }); // 3 quarry tiles + any 6
  assert.equal(s.flood, 3);
});

test('income: a Mixed home picks its Sustainable bonus; Mixed tiles give what you hold least of', () => {
  let s = newGame({ n: 4, mode: 'war', biomes: ['forest', 'quarry', 'riverbank', 'mixed'] });
  s = edit(s, (c) => {
    c.board.tiles.filter((t) => t.owner === 3).forEach((t) => (t.biome = 'mixed'));
    c.players[3].materials = { wood: 5, stone: 5, sandbag: 0 };
  });
  const prod = engine.production(s, 3);
  assert.equal(prod.free, 2);
  assert.deepEqual(prod.passive, { wood: 0, stone: 0, sandbag: 3 }); // fills the smallest pile
  s = allReady(s);
  assert.throws(() => act(s, 3, 'choose', { action: 'sustainable', mix: { wood: 3 } }), /exactly 2/);
  s = act(s, 3, 'choose', { action: 'sustainable', mix: { stone: 2 } });
  s = chooseAll(s);
  assert.deepEqual(s.players[3].materials, { wood: 5, stone: 7, sandbag: 3 });
});

test('attack: you still get your tile income, and the Flood rises by 1, win or lose', () => {
  let s = forceDice(allReady(warGame()), [1, 6]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' } });
  assert.deepEqual(s.players[0].materials, { wood: 4, stone: 1, sandbag: 1 }); // 3 tiles x 1 wood
  assert.equal(s.flood, 3);
  assert.equal(tile(s, 'I1').controller, 1);
});

// ---------------------------------------------------------------- militia
test('recruit: 1 unit for any 2 materials, only in build phases', () => {
  let s = warGame();
  s = act(s, 0, 'recruit', { count: 1, materials: { wood: 1, stone: 1 } });
  assert.equal(s.players[0].units, 2);
  assert.throws(() => act(s, 0, 'recruit', { count: 1, materials: { sandbag: 1 } }), /2 materials/);
  assert.throws(() => act(s, 0, 'recruit', { count: 1, materials: { sandbag: 2 } }), /don't have/);
});

test('upkeep: 1 material per 3 units, rounded down, from round 2', () => {
  let s = warGame();
  s = edit(s, (c) => {
    [2, 3, 6, 8].forEach((u, i) => (c.players[i].units = u));
    c.players.forEach((p) => (p.materials = { wood: 5, stone: 5, sandbag: 5 }));
  });
  s = chooseAll(allReady(s), { 0: { action: 'attack', target: 'I5' } }); // seat 0 collects nothing
  const before = s.players.map((p) => total(p.materials));
  s = nextRound(s);
  assert.equal(s.round, 2);
  const paid = s.players.map((p, i) => before[i] - total(p.materials));
  assert.deepEqual(paid, [0, 1, 2, 2]);
});

test('upkeep: if you cannot pay, units are disbanded until you can', () => {
  let s = warGame();
  s = nextRound(chooseAll(allReady(s)));
  s = chooseAll(allReady(s), { 0: { action: 'attack', target: 'I5' } });
  s = edit(s, (c) => {
    c.players[0].units = 6; // due 2
    c.players[0].materials = { wood: 1, stone: 0, sandbag: 0 };
  });
  s = nextRound(s);
  assert.equal(s.players[0].units, 5); // 5 units -> due 1 -> paid with the 1 wood
  assert.equal(total(s.players[0].materials), 0);
  assert.equal(s.players[0].stats.unitsDisbanded, 1);
});

// ---------------------------------------------------------------- dice
test('dice: highest vs highest, ties to the defender, attacker needs more pairs (1-1 = defence)', () => {
  assert.deepEqual(engine.compareDice([6, 5, 3], [4, 4], 'defender'), { a: [6, 5, 3], d: [4, 4], aWon: 2, dWon: 0, ties: 0 });
  assert.deepEqual(engine.compareDice([3, 6], [6, 1], 'defender'), { a: [6, 3], d: [6, 1], aWon: 1, dWon: 1, ties: 0 });
  assert.equal(engine.compareDice([4], [4], 'defender').dWon, 1);
  assert.equal(engine.compareDice([4], [4], 'attacker').aWon, 1);
  assert.equal(engine.compareDice([5, 4], [5, 2], 'both').ties, 1);
});

// ---------------------------------------------------------------- attacks
function winProvince() {
  // Seat 0 attacks seat 1's province I1 and wins 6 vs 3.
  let s = forceDice(allReady(warGame()), [6, 3]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' } });
  return s;
}

test('attack: winning a province occupies it, takes up to 3 tokens, Damages the defender', () => {
  let s = winProvince();
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(tile(s, 'I1').owner, 1);
  assert.equal(s.players[1].units, 0);
  assert.equal(s.players[1].damaged, true);
  assert.equal(s.phase, 'loot'); // seat 1 has 1 wood, 4 stone, 1 sandbag: a real choice
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  assert.equal(s.players[0].materials.stone, 4);
  assert.equal(s.phase, 'trade');
});

test('attack: you can only target a tile next to one you control, and need a unit', () => {
  let s = allReady(warGame());
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: 'I3' }), /can't attack/); // not adjacent
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: 'C1' }), /can't attack/); // capital closed
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: 'V' }), /can't attack/); // village
  s = edit(s, (c) => (c.players[0].units = 0));
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: 'I1' }), /at least 1 unit/);
});

test('attack: a defender with 0 units loses automatically', () => {
  let s = edit(allReady(warGame()), (c) => (c.players[1].units = 0));
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' } });
  assert.equal(tile(s, 'I1').controller, 0);
  assert.ok(s.log.some((l) => /no units to defend/.test(l.text)));
});

test('attack: losses carry over — units lost defending cannot attack later', () => {
  // Starting player 0 attacks seat 1 first (seat 1 loses its only unit), then seat 1's attack on seat 2 fizzles.
  let s = edit(allReady(warGame()), (c) => {
    tile(c, 'E1').controller = 2; // pretend seat 2 holds E1 so seat 1 can attack it
    tile(c, 'E1').owner = null;
  });
  s = forceDice(s, [6, 1]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' }, 1: { action: 'attack', target: 'E1' } });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout'); // finish the first battle's loot
  assert.ok(s.log.some((l) => /fizzles: no units left/.test(l.text)));
});

test('occupation: Flood +1 per occupying player (not per tile) at upkeep; withdrawing returns the tile', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  s = edit(s, (c) => (tile(c, 'E1').controller = 0)); // seat 0 now holds two of seat 1's tiles
  const flood = s.flood;
  s = nextRound(s);
  assert.equal(s.flood, flood + 1);
  s = act(s, 0, 'planWithdraw', { tile: 'E1' });
  s = act(s, 0, 'planWithdraw', { tile: 'I1' });
  s = nextRound(chooseAll(allReady(s)));
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(tile(s, 'E1').controller, 1);
});

test('occupied tiles produce for the occupier', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  s = nextRound(s);
  const before = { ...s.players[0].materials };
  s = chooseAll(allReady(s));
  assert.equal(s.players[0].materials.wood, before.wood + 5); // 3 forest tiles + Sustainable 2
  assert.equal(s.players[0].materials.stone, before.stone + 1); // + seat 1's quarry province
});

test('Damaged: collect 1 less on the next development; international aid gives 1 more', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  s = nextRound(s);
  const before = total(s.players[1].materials);
  s = allReady(s);
  s = act(s, 1, 'choose', { action: 'sustainable', aid: 'wood' });
  s = chooseAll(s);
  // 2 tiles left (2 stone) + 2 stone − 1 Damaged + 1 aid wood
  assert.equal(total(s.players[1].materials), before + 4);
  assert.equal(s.players[1].damaged, false);
});

test("Damaged applies to the next round's income, even in a round you attack", () => {
  let s = edit(allReady(warGame()), (c) => (c.players[0].damaged = true));
  s = chooseAll(s, { 0: { action: 'attack', target: 'I5' } });
  assert.equal(s.players[0].damaged, false);
  assert.deepEqual(s.players[0].materials, { wood: 3, stone: 1, sandbag: 1 }); // 3 tile income − 1
});

test('capital: by default it can be attacked after just one province falls', () => {
  let s = newGame({ n: 4, mode: 'war', biomes: BIOMES, settings: (c) => (c.war.stationedUnits = false) });
  s = edit(allReady(s), (c) => (tile(c, 'I1').controller = 0));
  assert.equal(s.settings.war.capitalOpensAfter, 1);
  assert.ok(engine.attackTargets(s, 0).includes('C1'));
});

test('occupation adds no Flood by default', () => {
  let s = newGame({ n: 4, mode: 'war', biomes: BIOMES, settings: (c) => (c.war.stationedUnits = false) });
  s = edit(s, (c) => (tile(c, 'I1').controller = 0));
  s = nextRound(chooseAll(allReady(s)));
  assert.equal(s.flood, 2);
});

test('capital: can only be attacked once both provinces are occupied; defender gets +1 die; War never captures it', () => {
  let s = edit(allReady(warGame()), (c) => {
    tile(c, 'I1').controller = 0;
    tile(c, 'E1').controller = 0;
    c.players[0].units = 3;
  });
  assert.ok(engine.attackTargets(s, 0).includes('C1'));
  s = forceDice(s, [6, 6, 6, 1, 1]); // 3 attack dice vs 1 unit's die + 1 extra
  s = chooseAll(s, { 0: { action: 'attack', target: 'C1' } });
  const battle = s.log.filter((l) => l.dice).pop();
  assert.equal(battle.dice.sides[1].rolls.length, 2);
  assert.equal(tile(s, 'C1').controller, 1);
  assert.equal(s.players[1].damaged, true);
  assert.equal(s.players[1].puppetOf, null);
});

test('resistance: retaking your own tile — ties go to the owner and there are no sanctions', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  s = nextRound(s);
  s = act(s, 1, 'recruit', { count: 1, materials: { wood: 1, stone: 1 } });
  s = forceDice(allReady(s), [4, 4]);
  s = chooseAll(s, { 1: { action: 'attack', target: 'I1' } });
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(s.players[1].sanctionedThrough, null);
  assert.equal(s.players[0].damaged, true);
});

test('clash: two players attacking each other fight one battle; a tie costs both; Flood still +2', () => {
  let s = edit(allReady(warGame()), (c) => {
    c.players[0].units = 2;
    c.players[1].units = 2;
  });
  s = forceDice(s, [5, 3, 5, 2]); // seat 0: 5,3 vs seat 1: 5,2 -> tie + seat 0 wins
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' }, 1: { action: 'attack', target: 'E0' } });
  assert.equal(s.clashCount, 1);
  assert.equal(s.flood, 4);
  assert.equal(s.players[0].units, 1);
  assert.equal(s.players[1].units, 0);
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(tile(s, 'E0').controller, 0);
});

test('clash: an even split changes nothing', () => {
  let s = edit(allReady(warGame()), (c) => {
    c.players[0].units = 2;
    c.players[1].units = 2;
  });
  s = forceDice(s, [6, 1, 2, 5]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' }, 1: { action: 'attack', target: 'E0' } });
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(tile(s, 'E0').controller, 0);
  assert.ok(s.log.some((l) => /even split/.test(l.text)));
});

// ---------------------------------------------------------------- open tiles
test('open tiles: claiming wins automatically, no loot, no sanction, then counts as occupation', () => {
  let s = chooseAll(allReady(warGame()), { 0: { action: 'attack', target: 'I5' } });
  assert.equal(tile(s, 'I5').controller, 0);
  assert.equal(s.players[0].sanctionedThrough, null);
  const flood = s.flood;
  s = nextRound(s);
  assert.equal(s.flood, flood + 1);
});

test('open tiles: the host can make them impassable', () => {
  const s = allReady(warGame('war', (c) => (c.war.openTilesClaimable = false)));
  assert.ok(!engine.attackTargets(s, 0).includes('I5'));
  assert.ok(engine.attackTargets(s, 0).includes('I1'));
});

// ---------------------------------------------------------------- Climate Accord
test('Accord: an attacker is sanctioned for the next round — no trade, gifts or market', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  assert.equal(s.players[0].sanctionedThrough, 2);
  assert.throws(() => act(s, 0, 'proposeTrade', { to: 2, give: { wood: 1 }, get: { stone: 1 } }), /sanctions/);
  assert.throws(() => act(s, 2, 'gift', { to: 0, materials: { sandbag: 1 } }), /sanctions/);
  s = nextRound(s);
  assert.throws(() => act(s, 0, 'market', { give: 'stone', get: 'wood' }), /sanctions/);
  s = nextRound(chooseAll(allReady(s)));
  assert.equal(s.round, 3);
  s = act(s, 0, 'market', { give: 'stone', get: 'wood' }); // sanction over
});

test('Accord: breaks at Flood 10, permanently; no sanctions or aid after; running sanctions end that round', () => {
  let s = warGame('war', (c) => (c.general.startingFlood = 8));
  s = edit(allReady(s), (c) => (c.players[2].sanctionedThrough = 5));
  s = forceDice(s, [6, 1]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1' }, 3: { action: 'unsustainable', mix: { wood: 6 } } });
  assert.equal(s.flood, 10);
  assert.equal(s.accordBroken, true);
  assert.equal(s.accordBrokeRound, 1);
  assert.equal(s.players[0].sanctionedThrough, null); // its own +1 broke the Accord (Q15)
  assert.equal(s.players[2].sanctionedThrough, 1);
  const v = engine.viewFor(s, 1);
  assert.equal(v.players[1].aidEligible, false);
});

test('Accord: aid is judged on the Flood before this round rises (Q16)', () => {
  let s = warGame('war', (c) => (c.general.startingFlood = 9));
  s = edit(allReady(s), (c) => (c.players[1].damaged = true));
  s = chooseAll(s, { 1: { action: 'sustainable', aid: 'sandbag' }, 0: { action: 'unsustainable', mix: { wood: 6 } } });
  assert.equal(s.accordBroken, true);
  assert.equal(s.players[1].stats.aidReceived, 1);
});

// ---------------------------------------------------------------- Empire
function capture() {
  // Seat 0 holds both of seat 1's provinces and storms the capital.
  let s = warGame('empire');
  s = edit(allReady(s), (c) => {
    tile(c, 'I1').controller = 0;
    tile(c, 'E1').controller = 0;
    c.players[0].units = 3;
    c.players[1].materials = { wood: 3, stone: 3, sandbag: 3 };
  });
  s = forceDice(s, [6, 6, 6, 1, 1]);
  s = chooseAll(s, { 0: { action: 'attack', target: 'C1' }, 1: { action: 'sustainable', aid: 'wood' } });
  return s;
}

test('empire: capturing a capital makes a puppet, takes half the stockpile (rounded down), returns its provinces', () => {
  let s = capture();
  assert.equal(s.players[1].puppetOf, 0);
  assert.equal(tile(s, 'I1').controller, 1);
  assert.equal(tile(s, 'E1').controller, 1);
  // seat 1 had 3/3/3, collected 1 stone (tile) + 2 stone + 1 aid wood = 13 -> 6 taken
  assert.equal(s.pendingLoot.count, 6);
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  assert.equal(total(s.players[1].materials), 7);
  assert.equal(s.players[1].damaged, false);
});

test('empire: tribute is half of everything the puppet collects, rounded up; garrison 1 for one puppet; puppet counts as occupying', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  const ovBefore = total(s.players[0].materials);
  const flood = s.flood;
  s = nextRound(s);
  assert.equal(s.flood, flood + 1); // holding a puppet = occupying
  assert.equal(total(s.players[0].materials), ovBefore - 2); // garrison 1 + militia upkeep 1 (3 units)
  assert.ok(s.log.some((l) => /paid .* garrison for 1 puppet/.test(l.text)));
  s = allReady(s);
  const pupBefore = total(s.players[1].materials);
  s = act(s, 1, 'choose', { action: 'sustainable', aid: 'stone' }); // 3 tiles + 2 + 1 aid = 6 -> tribute 3
  s = chooseAll(s, { 0: { action: 'attack', target: 'I5' } });
  assert.equal(total(s.players[1].materials), pupBefore + 3);
  assert.equal(s.players[0].stats.tributeReceived, 3);
});

test('empire: tribute rounds up (5 collected -> 3 paid)', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  s = nextRound(s);
  s = edit(allReady(s), (c) => (c.accordBroken = true)); // no aid this time
  const before = total(s.players[1].materials);
  s = act(s, 1, 'choose', { action: 'sustainable' });
  s = chooseAll(s, { 0: { action: 'attack', target: 'I5' } });
  assert.equal(total(s.players[1].materials), before + 2);
  assert.equal(s.players[1].stats.tributePaid, 3);
});

test('empire: commands — a puppet must play its command or revolt', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  s = nextRound(s);
  assert.throws(() => act(s, 2, 'setCommand', { puppet: 1, action: 'sustainable' }), /not your puppet/);
  s = act(s, 0, 'setCommand', { puppet: 1, action: 'unsustainable' });
  s = allReady(s);
  assert.throws(() => act(s, 1, 'choose', { action: 'sustainable' }), /commanded Unsustainable/);
  assert.throws(() => act(s, 1, 'choose', { action: 'revolt' }), /at least 1 unit/);
  s = act(s, 1, 'choose', { action: 'unsustainable', mix: { stone: 6 } });
});

test('empire: revolt — ties go to the rebel, overlord defends alone, winner is freed and takes up to 3', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  s = nextRound(s);
  s = act(s, 1, 'recruit', { count: 1, materials: { stone: 2 } });
  s = forceDice(allReady(s), [5, 5, 1, 1]); // rebel 5 vs overlord 5,1 (+1 capital die): tie -> rebel
  s = chooseAll(s, { 1: { action: 'revolt' } });
  assert.equal(s.players[1].puppetOf, null);
  assert.equal(s.players[1].sanctionedThrough, null); // revolts are never sanctioned
  assert.equal(s.players[1].stats.revoltsWon, 1);
});

test('empire: an unpaid garrison frees the puppet', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  s = edit(s, (c) => (c.players[0].materials = { wood: 0, stone: 0, sandbag: 0 }));
  s = nextRound(s);
  assert.equal(s.players[1].puppetOf, null);
});

test('empire: when an overlord is captured, its own puppets are freed first (a puppet cannot have puppets)', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  s = nextRound(s);
  // Now seat 3 storms seat 0's capital.
  s = edit(allReady(s), (c) => {
    tile(c, 'I0').controller = 3;
    tile(c, 'E0').controller = 3;
    tile(c, 'I5').controller = 3; // a path from seat 3 to seat 0
    tile(c, 'C5').controller = 3;
    c.players[3].units = 3;
    c.players[0].units = 0;
  });
  s = chooseAll(s, { 3: { action: 'attack', target: 'C0' } });
  if (s.phase === 'loot') s = act(s, 'system', 'lootTimeout');
  assert.equal(s.players[0].puppetOf, 3);
  assert.equal(s.players[1].puppetOf, null);
});

test('empire: production access lets an overlord take puppet resource types', () => {
  let s = capture();
  s = act(s, 0, 'pickLoot', { materials: { wood: 4, stone: 2 } });
  const prod = engine.production(s, 0);
  assert.equal(prod.access, true);
  assert.deepEqual(prod.allowed, ['wood', 'stone']);
  assert.equal(prod.free, 2);
});

test('record: War stats appear in the playtest record', () => {
  let s = winProvince();
  s = act(s, 0, 'pickLoot', { materials: { stone: 3 } });
  s = act(s, 'host', 'endGame');
  const rec = engine.playtestRecord(s);
  assert.equal(rec.attacks, 1);
  assert.equal(rec.clashes, 0);
  assert.equal(rec.accordBrokeRound, null);
  assert.match(engine.recordToCsv(rec), /attacks_won/);
});
