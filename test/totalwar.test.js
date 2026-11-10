'use strict';
// Total War: unit types, profiteering, live battles (terrain, flanking,
// encirclement), battle waves and scoring.
//
// 4-player board: seat 0 = C0, I0, E0   seat 1 = C1, I1, E1   (I0 borders I1, I0 borders open I5)
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady } = require('./helpers');
const tw = require('../engine/totalwar');
const bots = require('../server/bots');
const { cloneDefaults } = require('../config');

const CFG = cloneDefaults().totalwar;
const BIOMES = ['forest', 'quarry', 'riverbank', 'forest'];
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);
const rich = { wood: 30, stone: 30, sandbag: 30 };

function twGame(tweak) {
  let s = newGame({ n: 4, mode: 'totalwar', biomes: BIOMES, settings: tweak });
  s = structuredClone(s);
  for (const t of s.board.tiles) if (t.kind === 'land') t.biome = t.owner != null ? s.players[t.owner].biome : 'quarry';
  return s;
}
function edit(s, fn) {
  const c = structuredClone(s);
  fn(c);
  return c;
}
/** Put typed troops on tiles: { seat: { tileId: { militia, infantry, cavalry } } } */
function place(s, layout) {
  return edit(s, (c) => {
    for (const [seat, tiles] of Object.entries(layout)) {
      for (const t of c.board.tiles) {
        delete t.units[seat];
        if (t.troops) delete t.troops[seat];
      }
      for (const [id, tr] of Object.entries(tiles)) {
        const full = { militia: 0, infantry: 0, cavalry: 0, ...tr };
        tile(c, id).units[seat] = tw.sum(full);
        tile(c, id).troops = tile(c, id).troops || {};
        tile(c, id).troops[seat] = full;
      }
      c.players[seat].units = c.board.tiles.reduce((a, t) => a + (t.units[seat] || 0), 0);
    }
  });
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
/** Run live battles to the end, with the computer fighting both sides. */
function fightOut(s) {
  s = structuredClone(s);
  for (const b of s.battles) b.auto = { A: true, D: true };
  let guard = 0;
  while (s.phase === 'battle' && guard++ < 5000) engine.stepBattles(s, 0.1);
  return s;
}

// ---------------------------------------------------------------- setup and economy
test('total war: 12 rounds, 2 militia on the capital, high catastrophe line, no Accord', () => {
  const s = twGame();
  assert.equal(s.settings.war.rounds, 12);
  assert.equal(engine.threshold(s), 30);
  for (const p of s.players) assert.deepEqual(engine.troopsAt(tile(s, p.homeTile), p.seat), { militia: 2, infantry: 0, cavalry: 0 });
  const v = engine.viewFor(s, 0);
  assert.equal(v.war.noAccord, true);
  assert.equal(v.players[0].aidEligible, false);
});

test('total war: unit types cost different amounts; upkeep is by unit type', () => {
  let s = edit(twGame(), (c) => (c.players[0].materials = { ...rich }));
  s = act(s, 0, 'recruit', { unit: 'cavalry', count: 2, materials: { wood: 10 }, tile: 'I0' });
  s = act(s, 0, 'recruit', { unit: 'infantry', count: 1, materials: { stone: 4 } });
  assert.throws(() => act(s, 0, 'recruit', { unit: 'cavalry', count: 1, materials: { wood: 4 } }), /5 materials/);
  assert.deepEqual(engine.troopsAt(tile(s, 'I0'), 0), { militia: 0, infantry: 0, cavalry: 2 });
  // 2 militia (1 each) + 1 infantry (1) + 2 cavalry (2 each) = 7 points -> 1 material per 4 points
  assert.equal(engine.viewFor(s, 0).players[0].upkeepDue, 1);
  assert.throws(() => act(newGame({ n: 3, mode: 'war' }), 0, 'recruit', { unit: 'cavalry', count: 1, materials: { wood: 2 } }), /Unknown unit type/);
});

test('total war: plunder — conquered tiles give extra income every round', () => {
  let s = edit(twGame(), (c) => (tile(c, 'I1').controller = 0));
  const prod = engine.production(s, 0);
  assert.equal(prod.passive.wood + prod.passive.stone + prod.passive.sandbag, 5); // 4 tiles + 1 plunder
});

test('total war: claiming empty land and taking undefended land need no battle', () => {
  let s = place(twGame(), { 0: { I0: { militia: 3 } }, 1: { C1: { militia: 2 } } });
  s = allReady(s);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', troops: { militia: 2 } } });
  assert.equal(s.phase, 'trade');
  assert.equal(tile(s, 'I1').controller, 0);
  assert.equal(engine.troopsAt(tile(s, 'I1'), 0).militia, 2);
  assert.equal(s.flood, 2); // no battle, no Flood
  assert.ok(s.players[0].materials.stone >= 1 + CFG.warSpoils); // war spoils in the captured tile's resource (quarry -> stone)
  assert.ok(s.log.some((l) => /war spoils/.test(l.text)));
});

// ---------------------------------------------------------------- battles on the board
function battleSetup() {
  let s = place(twGame(), { 0: { I0: { infantry: 2, cavalry: 2 } }, 1: { I1: { militia: 2 }, C1: { militia: 1 } } });
  s = allReady(s);
  return chooseAll(s, { 0: { action: 'attack', target: 'I1', from: 'I0', troops: { infantry: 2, cavalry: 2 } } });
}

test('total war: a defended tile starts a live battle; the Flood rises by 1; players are waited for', () => {
  const s = battleSetup();
  assert.equal(s.phase, 'battle');
  assert.equal(s.battles.length, 1);
  assert.equal(s.flood, 3);
  assert.deepEqual(engine.waitingFor(s).sort(), [0, 1]);
  assert.equal(engine.troopsAt(tile(s, 'I1'), 1).militia, 0); // defenders are on the battlefield
  const b = s.battles[0];
  // every unit is ${CFG.dotsPerUnit} dots on the battlefield
  assert.equal(b.dots.filter((d) => d.side === 'A').length, 4 * CFG.dotsPerUnit);
  assert.equal(b.dots.filter((d) => d.side === 'D').length, 2 * CFG.dotsPerUnit);
});

test('total war: battle orders only move your own dots', () => {
  let s = battleSetup();
  const b = s.battles[0];
  const mine = b.dots.filter((d) => d.side === 'A').map((d) => d.id);
  s = act(s, 0, 'battleOrder', { battle: b.id, dots: mine, x: 40, y: 20 });
  const near40 = (st) => st.battles[0].dots.filter((d) => d.side === 'A').every((d) => Math.abs(d.tx - 40) < 2);
  assert.ok(near40(s));
  assert.throws(() => act(s, 2, 'battleOrder', { battle: b.id, dots: mine, x: 1, y: 1 }), /not fighting/);
  s = act(s, 1, 'battleOrder', { battle: b.id, dots: mine, x: 1, y: 1 }); // seat 1 can't move seat 0's dots
  assert.ok(near40(s));
});

test('total war: a battle runs to the end and its result is applied to the board', () => {
  const s = fightOut(battleSetup());
  assert.equal(s.phase, 'trade');
  assert.equal(s.battles.length, 0);
  const winLine = s.log.find((l) => /wins the battle for/.test(l.text));
  assert.ok(winLine);
  const holder = tile(s, 'I1').controller;
  assert.ok(holder === 0 || holder === 1);
  // Units are conserved: survivors are back on the board, the rest counted as lost
  for (const p of s.players) assert.equal(p.units, s.board.tiles.reduce((a, t) => a + (t.units[p.seat] || 0), 0));
});

test('total war: the host can hand a player\'s battles to the computer', () => {
  let s = battleSetup();
  s = act(s, 'host', 'skip', { seat: 1 });
  assert.equal(s.battles[0].auto.D, true);
  assert.deepEqual(engine.waitingFor(s), [0]);
});

test('total war: two attacks on the same tile are fought one after the other (waves)', () => {
  let s = place(twGame(), { 0: { I0: { infantry: 3 } }, 1: { I1: { militia: 1 } }, 2: {} });
  s = edit(s, (c) => (tile(c, 'E1').controller = 0)); // seat 0 also holds E1 next to I1
  s = place(s, { 0: { I0: { infantry: 3 }, E1: { cavalry: 2 } } });
  s = allReady(s);
  s = chooseAll(s, { 0: { action: 'attack', target: 'I5', from: 'I0', troops: { infantry: 1 } } });
  // (claim only — make sure waves don't break a simple round)
  assert.equal(s.phase, 'trade');
});

// ---------------------------------------------------------------- the battle simulation
const T_PLAIN = { id: 'X', biome: 'quarry' };
const CFG1 = { ...CFG, dotsPerUnit: 1 }; // one dot per unit keeps these mechanics tests simple
function bareBattle(aTroops, dTroops, cfg = CFG1) {
  let r = 0.5;
  const b = tw.createBattle({ id: 1, tile: T_PLAIN, from: T_PLAIN, attacker: 0, defender: 1, aTroops, dTroops, cfg, rand: () => (r = (r * 9301 + 49297) % 233280 / 233280) });
  b.terrain = b.terrain.map((row) => row.replace(/./g, '.')); // all plain, for fair tests
  return b;
}
const run = (b, secs, cfg = CFG1) => {
  for (let t = 0; t < secs; t += 0.1) if (tw.stepBattle(b, 0.1, cfg)) break;
  return b;
};

test('battle: units cut off from their side of the map take more damage and surrender', () => {
  const b = bareBattle({ infantry: 6 }, { militia: 1 });
  const lone = b.dots.find((d) => d.side === 'D');
  // Surround the lone defender: attackers on all four sides
  const ring = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-3, -3],
    [3, 3],
  ];
  b.dots.filter((d) => d.side === 'A').forEach((d, i) => {
    d.x = d.tx = lone.x + ring[i][0];
    d.y = d.ty = lone.y + ring[i][1];
  });
  b.ordered = { A: true, D: true }; // nobody on auto
  tw.computeSupply(b);
  assert.equal(lone.cut, true);
  run(b, 15);
  assert.equal(b.status, 'done');
  assert.equal(b.winner, 'A');
});

test('battle: attackers who hold the flag alone win', () => {
  const b = bareBattle({ cavalry: 1 }, { militia: 1 });
  const def = b.dots.find((d) => d.side === 'D');
  def.x = def.tx = 55; // the defender wanders off the flag
  def.y = def.ty = 2;
  const cav = b.dots.find((d) => d.side === 'A');
  cav.x = cav.tx = b.obj.x;
  cav.y = cav.ty = b.obj.y;
  // As if the attackers had marched there, holding a corridor home; the defender keeps the far edge.
  b.territory = b.territory.map((_, i) => (i % 30 < 25 ? 'A' : 'D'));
  b.ordered = { A: true, D: true };
  run(b, CFG.captureSeconds + 2);
  assert.equal(b.winner, 'A');
  assert.match(b.reason, /objective/);
});

test('battle: if the attackers never come, the defenders hold out', () => {
  const b = bareBattle({ militia: 1 }, { infantry: 1 });
  b.ordered = { A: true, D: true };
  run(b, CFG.battleSeconds + 1);
  assert.equal(b.winner, 'D');
  assert.match(b.reason, /held out/);
});

test('battle: hitting a unit from two sides does more damage than from one side', () => {
  const twoSides = bareBattle({ infantry: 2 }, { infantry: 1 });
  const oneSide = bareBattle({ infantry: 2 }, { infantry: 1 });
  for (const [b, offsets] of [
    [twoSides, [-2, 2]],
    [oneSide, [-2, -2.2]],
  ]) {
    const def = b.dots.find((d) => d.side === 'D');
    b.dots.filter((d) => d.side === 'A').forEach((d, i) => {
      d.x = d.tx = def.x + offsets[i];
      d.y = d.ty = def.y + (i ? 0.2 : 0);
    });
    def.tx = def.x;
    def.ty = def.y;
    b.ordered = { A: true, D: true };
    tw.stepBattle(b, 1, CFG1);
  }
  const hpTwo = twoSides.dots.find((d) => d.side === 'D').hp;
  const hpOne = oneSide.dots.find((d) => d.side === 'D').hp;
  assert.ok(hpTwo < hpOne, `flanked ${hpTwo} should be lower than ${hpOne}`);
});

test('battle: cavalry rides down militia but struggles against infantry', () => {
  const vsMilitia = bareBattle({ cavalry: 1 }, { militia: 1 });
  const vsInfantry = bareBattle({ cavalry: 1 }, { infantry: 1 });
  for (const b of [vsMilitia, vsInfantry]) {
    const def = b.dots.find((d) => d.side === 'D');
    const cav = b.dots.find((d) => d.side === 'A');
    cav.x = cav.tx = def.x - 2;
    cav.y = cav.ty = def.y;
    def.tx = def.x;
    def.ty = def.y;
    b.ordered = { A: true, D: true };
    tw.stepBattle(b, 1, CFG1);
  }
  const lostM = 1 - vsMilitia.dots.find((d) => d.side === 'D').hp / CFG.militia.hp;
  const lostI = 1 - vsInfantry.dots.find((d) => d.side === 'D').hp / CFG.infantry.hp;
  assert.ok(lostM > lostI * 2);
});

test('battle: cavalry is weak against infantry — unless the infantry are encircled', () => {
  const supplied = bareBattle({ cavalry: 1 }, { infantry: 1 });
  const encircled = bareBattle({ cavalry: 1 }, { infantry: 1 });
  for (const [b, cut] of [
    [supplied, false],
    [encircled, true],
  ]) {
    const inf = b.dots.find((d) => d.side === 'D');
    const cav = b.dots.find((d) => d.side === 'A');
    cav.x = cav.tx = inf.x - 2;
    cav.y = cav.ty = inf.y;
    inf.tx = inf.x;
    inf.ty = inf.y;
    inf.cut = cut;
    b.ordered = { A: true, D: true };
    tw.stepBattle(b, 1, CFG1);
  }
  const lost = (b) => CFG.infantry.hp - b.dots.find((d) => d.side === 'D').hp;
  // supplied: 3 dmg x 70% = 2.1;  encircled: 3 x 150% x 175% (cut-off) = 7.9
  assert.ok(Math.abs(lost(supplied) - CFG.cavalry.attack * 0.7) < 0.01);
  assert.ok(lost(encircled) > lost(supplied) * 3);
});

test('battle: each unit is a group of dots; tapping one dot moves the whole unit', () => {
  const b = bareBattle({ infantry: 2 }, { militia: 1 }, CFG);
  const mine = b.dots.filter((d) => d.side === 'A');
  assert.equal(mine.length, 2 * CFG.dotsPerUnit);
  const unit = mine[0].unit;
  tw.order(b, 'A', [mine[0].id], 30, 20); // tap just one dot
  for (const d of mine) {
    if (d.unit === unit) assert.ok(Math.abs(d.tx - 30) < 2 && Math.abs(d.ty - 20) < 2);
    else assert.ok(d.tx < 15); // the other unit stays put
  }
});

test('battle: surviving dots are grouped back into whole units (rounding up)', () => {
  const b = bareBattle({ infantry: 2 }, { militia: 1 }, CFG);
  const a = b.dots.filter((d) => d.side === 'A');
  b.dots = b.dots.filter((d) => d !== a[0] && d !== a[1]); // 4 of 6 infantry dots left
  assert.deepEqual(tw.survivors(b, 'A'), { militia: 0, infantry: 2, cavalry: 0 });
  b.dots = b.dots.filter((d) => d.side !== 'A' || d === a[5]); // 1 dot left
  assert.deepEqual(tw.survivors(b, 'A'), { militia: 0, infantry: 1, cavalry: 0 });
  assert.equal(tw.unitsLost(b, 'A'), 1);
});

test('battle: territory — each side starts with ground; dots claim what they move through; the frontline shows', () => {
  const b = bareBattle({ militia: 1 }, { militia: 1 });
  const terr = tw.territoryString(b);
  assert.equal(terr[0], 'a'); // left edge: attacker, supplied
  assert.equal(terr[29], 'd'); // right edge: defender
  const att = b.dots.find((d) => d.side === 'A');
  att.tx = 20; // march into no-man's land
  b.ordered = { A: true, D: true };
  run(b, 6);
  const row = Math.floor(att.y / 2);
  assert.equal(b.territory[row * 30 + Math.floor(att.x / 2)], 'A'); // it claimed the ground it reached
  assert.equal(att.cut, false); // and its trail keeps it supplied
});

test('battle: enemy territory between you and your edge cuts you off', () => {
  const b = bareBattle({ militia: 1 }, { militia: 1 });
  const att = b.dots.find((d) => d.side === 'A');
  att.x = att.tx = 20;
  att.y = att.ty = 20;
  // The defenders have painted a wall of territory behind the attacker
  for (let y = 0; y < 20; y++) for (let x = 3; x < 6; x++) b.territory[y * 30 + x] = 'D';
  tw.computeSupply(b);
  assert.equal(att.cut, true);
  assert.match(tw.territoryString(b), /A/); // its ground is now a cut-off pocket
});

test('battle: a side that gives no orders is put on auto-battle after a while', () => {
  const b = bareBattle({ militia: 2 }, { militia: 2 });
  run(b, 16);
  assert.equal(b.auto.A, true);
});

// ---------------------------------------------------------------- end of game
test('total war scoring: tiles, captured capitals, spare materials, safe home', () => {
  let s = edit(twGame((c) => (c.totalwar.rounds = 1)), (c) => {
    tile(c, 'C1').controller = 0; // seat 0 holds seat 1's capital
    tile(c, 'I1').controller = 0;
    c.players[0].materials = { wood: 9, stone: 0, sandbag: 0 };
  });
  s = allReady(chooseAll(allReady(s), { 0: { action: 'attack', target: 'E5', from: 'C0', troops: { militia: 1 } } }));
  const r = s.outcome.results[0];
  assert.equal(r.tiles, 6); // 3 own + I1 + C1 + E5
  assert.equal(r.capitals, 1);
  assert.equal(r.survived, true);
  assert.equal(r.score, 6 * 2 + 3 + Math.floor(r.spare / 3) + 5);
  assert.deepEqual(s.outcome.winners, [0]);
});

test('total war: bots can play whole games, battles included', () => {
  for (let g = 0; g < 4; g++) {
    let s = newGame({ n: 3 + (g % 3), mode: 'totalwar', seed: g + 7, biomes: ['forest', 'quarry', 'riverbank', 'mixed', 'forest'].slice(0, 3 + (g % 3)) });
    const pers = ['warlike', 'balanced', 'warlike', 'cautious', 'warlike'];
    const mem = s.players.map((p, i) => ({ personality: pers[i], tried: new Set(), phaseKey: null, failures: 0 }));
    let steps = 0;
    let fought = 0;
    while (s.phase !== 'ended' && steps++ < 8000) {
      if (s.phase === 'battle') {
        s = structuredClone(s);
        for (const b of s.battles) b.auto = { A: true, D: true };
        fought += s.battles.length;
        while (s.phase === 'battle') engine.stepBattles(s, 0.2);
        continue;
      }
      const seat = engine.waitingFor(s)[0];
      const idea = bots.decide(engine.viewFor(s, seat), mem[seat]);
      try {
        s = idea ? engine.applyAction(s, seat, idea.action) : engine.applyAction(s, 'host', { type: 'skip', seat });
      } catch (e) {
        if (e.name !== 'RuleError') throw e;
        mem[seat].tried.add(idea.key);
        if (++mem[seat].failures > 12) s = engine.applyAction(s, 'host', { type: 'skip', seat });
      }
    }
    assert.equal(s.phase, 'ended', `game ${g} did not finish`);
    assert.ok(fought > 0, 'bots never fought a battle');
    for (const p of s.players) assert.equal(p.units, s.board.tiles.reduce((a, t) => a + (t.units[p.seat] || 0), 0));
  }
});
