'use strict';
// Total War arsenal: research, upgrades, the sea board, ships, amphibious
// attacks, air battles, bombardment and formations.
//
// sea37 board, 4 players: seat 0 = C0, M0, E0   seat 1 = C1, M1, E1
// Sea bay S0 touches E0 (seat 0's coast) and C1/M1 (seat 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame, act, allReady } = require('./helpers');
const tw = require('../engine/totalwar');
const ARS = require('../engine/arsenal');
const { cloneDefaults } = require('../config');

const CFG = cloneDefaults().totalwar;
const tile = (s, id) => s.board.tiles.find((t) => t.id === id);
const rich = { wood: 40, stone: 40, sandbag: 40 };
const bag = (n) => ({ wood: n, stone: 0, sandbag: 0 });

function game(tweak) {
  let s = newGame({ n: 4, mode: 'totalwar', biomes: ['forest', 'quarry', 'riverbank', 'forest'], settings: tweak });
  s = structuredClone(s);
  for (const p of s.players) p.materials = { ...rich };
  return s;
}
function edit(s, fn) {
  const c = structuredClone(s);
  fn(c);
  return c;
}
/** Give a player finished research. */
const learn = (s, seat, ...techs) => edit(s, (c) => c.players[seat].research.done.push(...techs));
/** Put troops on a tile (replacing that player's troops there). */
function put(s, id, seat, troops) {
  return edit(s, (c) => {
    const t = tile(c, id);
    const full = { ...ARS.zero(), ...troops };
    t.units[seat] = ARS.sum(full);
    t.troops = t.troops || {};
    t.troops[seat] = full;
    t.controller = seat;
    for (const p of c.players) p.units = c.board.tiles.reduce((a, x) => a + ((x.units && x.units[p.seat]) || 0), 0);
  });
}
/** Advance to the start of the next round (everyone Sustainable). */
function nextRound(s) {
  s = allReady(s);
  for (const p of s.players) if (!p.choice) s = act(s, p.seat, 'choose', { action: 'sustainable', mix: p.biome === 'mixed' ? { wood: 3 } : undefined });
  if (s.phase === 'trade') s = allReady(s);
  return s;
}
const runBattle = (s, max = 400) => {
  for (let i = 0; i < max && s.phase === 'battle'; i++) engine.stepBattles(s, 0.5);
  return s;
};

// ---------------------------------------------------------------- board
test('sea board: 37 hexes with 6 sea bays; Total War uses it by default', () => {
  const s = game();
  assert.equal(s.board.layout, 'sea37');
  assert.equal(s.board.tiles.length, 37);
  const seas = s.board.tiles.filter((t) => t.kind === 'sea');
  assert.equal(seas.length, 6);
  assert.ok(seas.every((t) => t.biome === 'sea' && t.controller == null));
  assert.equal(tile(s, 'C0').owner, 0);
  assert.equal(tile(s, 'E0').owner, 0);
  assert.equal(tile(s, 'C1').owner, 1);
});

// ---------------------------------------------------------------- research
test('research: pay in a build phase, ready at the start of next round, one at a time', () => {
  let s = game();
  assert.throws(() => act(s, 0, 'recruit', { unit: 'artillery', materials: bag(CFG.artillery.cost) }), /Research Artillery first/);
  assert.throws(() => act(s, 0, 'research', { tech: 'lightTanks', materials: bag(CFG.research.lightTanks) }), /Research Artillery first/);
  assert.throws(() => act(s, 0, 'research', { tech: 'artillery', materials: bag(3) }), /costs 5/);
  s = act(s, 0, 'research', { tech: 'artillery', materials: bag(CFG.research.artillery) });
  assert.equal(s.players[0].research.current, 'artillery');
  assert.equal(s.players[0].materials.wood, 40 - CFG.research.artillery);
  assert.throws(() => act(s, 0, 'research', { tech: 'motorised', materials: bag(5) }), /already researching/);
  assert.throws(() => act(s, 0, 'recruit', { unit: 'artillery', materials: bag(CFG.artillery.cost) }), /Research Artillery first/);
  s = nextRound(s);
  assert.equal(s.round, 2);
  assert.deepEqual(s.players[0].research.done, ['artillery']);
  assert.equal(s.players[0].research.current, null);
  s = act(s, 0, 'recruit', { unit: 'artillery', materials: bag(CFG.artillery.cost) });
  assert.equal(engine.troopsAt(tile(s, 'C0'), 0).artillery, 1);
  assert.throws(() => act(s, 0, 'research', { tech: 'artillery', materials: bag(5) }), /already have/);
});

test('research tree: tanks need artillery; aircraft need mechanised; not in other modes', () => {
  let s = learn(game(), 0, 'artillery', 'lightTanks', 'mediumTanks');
  s = act(s, 0, 'research', { tech: 'heavyTanks', materials: bag(CFG.research.heavyTanks) });
  assert.throws(() => act(learn(game(), 0, 'motorised'), 0, 'research', { tech: 'aircraft', materials: bag(CFG.research.aircraft) }), /Mechanised/);
  const w = newGame({ n: 3, mode: 'war' });
  assert.throws(() => act(w, 0, 'research', { tech: 'artillery', materials: bag(5) }), /part of Total War/);
});

test('upgrades: pay the difference in cost along a unit line', () => {
  let s = put(learn(game(), 0, 'motorised', 'mechanised', 'antiTank'), 'C0', 0, { militia: 2, infantry: 2 });
  // infantry (4) -> mechanised (7): 3 each
  assert.throws(() => act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'infantry', to: 'mechanised', count: 2, materials: bag(4) }), /costs 6/);
  s = act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'infantry', to: 'mechanised', count: 2, materials: bag(6) });
  assert.equal(engine.troopsAt(tile(s, 'C0'), 0).mechanised, 2);
  assert.equal(engine.troopsAt(tile(s, 'C0'), 0).infantry, 0);
  s = act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'militia', to: 'antitank', count: 1, materials: bag(2) });
  assert.equal(engine.troopsAt(tile(s, 'C0'), 0).antitank, 1);
  assert.throws(() => act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'militia', to: 'antiair', count: 1, materials: bag(2) }), /Anti-air guns first/);
  assert.throws(() => act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'militia', to: 'mechanised', count: 1, materials: bag(5) }), /can't be upgraded/);
  assert.equal(s.players[0].units, 4); // same number of units
});

// ---------------------------------------------------------------- ships
test('ships: launched into a bay next to your coast; ocean links every bay', () => {
  let s = learn(game(), 0, 'shipyards');
  assert.throws(() => act(s, 0, 'recruit', { unit: 'destroyer', tile: 'C0', materials: bag(6) }), /sea bay/);
  assert.throws(() => act(s, 0, 'recruit', { unit: 'destroyer', tile: 'S2', materials: bag(6) }), /next to your own coast/);
  assert.throws(() => act(s, 0, 'recruit', { unit: 'militia', tile: 'S0', materials: bag(2) }), /Only ships/);
  s = act(s, 0, 'recruit', { unit: 'destroyer', tile: 'S0', materials: bag(6) });
  assert.equal(tile(s, 'S0').controller, 0);
  // Sail to a far bay; the old one empties
  s = act(s, 0, 'moveUnits', { from: 'S0', to: 'S3', count: 1 });
  assert.equal(tile(s, 'S3').controller, 0);
  assert.equal(tile(s, 'S0').controller, null);
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'S3', to: 'C0', count: 1 }), /Ships stay at sea/);
  // Ships can attack any bay they don't hold
  assert.ok(engine.attackTargets(s, 0).includes('S1'));
});

test('naval battle: ships fight for a bay; the winner holds it', () => {
  let s = put(put(game(), 'S0', 0, { battleship: 2 }), 'S1', 1, { destroyer: 1 });
  s = allReady(s);
  s = act(s, 0, 'choose', { action: 'attack', target: 'S1', from: 'S0', troops: { battleship: 2 } });
  assert.throws(() => act(s, 1, 'choose', { action: 'attack', target: 'S0', from: 'S1', troops: { militia: 1 } }), /Only ships/);
  for (const p of s.players) if (!p.choice) s = act(s, p.seat, 'choose', { action: 'sustainable', mix: undefined });
  assert.equal(s.phase, 'battle');
  assert.equal(s.battles[0].kind, 'sea');
  s = runBattle(s);
  assert.equal(tile(s, 'S1').controller, 0);
  assert.ok(engine.troopsAt(tile(s, 'S1'), 0).battleship >= 1);
});

test('amphibious: ships in a bay let your coastal troops land across it', () => {
  // Seat 0 holds bay S5 (touches C0 and seat 1? no) — use S0, which touches seat 1's capital C1 and M1.
  let s = put(game(), 'S0', 0, { destroyer: 1 });
  s = put(s, 'C0', 0, { infantry: 3 }); // C0 is coastal (next to S5), not next to M1
  const targets = engine.attackTargets(s, 0);
  assert.ok(targets.includes('M1'), 'M1 is reachable across S0');
  const src = engine.attackSources(s, 0, 'M1');
  assert.ok(src.some((x) => x.tile === 'C0' && x.amphibious));
  // Without the bay, no landing
  const s2 = put(game(), 'C0', 0, { infantry: 3 });
  assert.ok(!engine.attackTargets(s2, 0).includes('M1'));
  // Ships can't go ashore
  s = allReady(s);
  assert.throws(() => act(s, 0, 'choose', { action: 'attack', target: 'M1', from: 'S0', troops: { destroyer: 1 } }), /attack from one of your tiles|across a sea bay|Ships can't go ashore/i);
});

// ---------------------------------------------------------------- air
test('air battle first when both sides have aircraft; the winner bombs the land battle', () => {
  let s = put(game(), 'M0', 0, { infantry: 3, interceptor: 3, bomber: 2 });
  s = put(s, 'N0', 1, { infantry: 2, interceptor: 1 });
  s = allReady(s);
  s = act(s, 0, 'choose', { action: 'attack', target: 'N0', from: 'M0', troops: { infantry: 3, interceptor: 3, bomber: 2 } });
  for (const p of s.players) if (!p.choice) s = act(s, p.seat, 'choose', { action: 'sustainable' });
  assert.equal(s.phase, 'battle');
  assert.equal(s.battles[0].kind, 'air');
  // Fight the air battle
  for (let i = 0; i < 200 && s.battles.every((b) => b.kind === 'air'); i++) engine.stepBattles(s, 0.5);
  const land = s.battles.find((b) => b.kind === 'land');
  assert.ok(land, 'the land battle follows');
  assert.equal(land.airSuperiority, 'A');
  assert.ok(land.dots.some((d) => d.side === 'A' && d.type === 'bomber'), "the winner's bombers fly over the land battle");
  assert.ok(!land.dots.some((d) => d.side === 'D' && ARS.UNITS[d.type].domain === 'air'));
  s = runBattle(s);
  // Planes always fly home; they never occupy ground
  const planesOnM1 = engine.troopsAt(tile(s, 'N0'), 0);
  assert.equal(planesOnM1.bomber + planesOnM1.interceptor, 0);
});

test('only anti-air (and aircraft) can hurt aircraft', () => {
  assert.equal(ARS.matchup('infantry', 'bomber', CFG), 0);
  assert.equal(ARS.matchup('heavyTank', 'bomber', CFG), 0);
  assert.ok(ARS.matchup('antiair', 'bomber', CFG) > 1);
  assert.ok(ARS.matchup('interceptor', 'bomber', CFG) > ARS.matchup('interceptor', 'interceptor', CFG));
  assert.ok(ARS.matchup('antitank', 'heavyTank', CFG) > 2);
  assert.ok(ARS.matchup('infantry', 'heavyTank', CFG) < 0.5);
  assert.equal(ARS.matchup('destroyer', 'infantry', CFG), 0);
});

test('bombers in a land battle hurt troops that have no anti-air', () => {
  const T = { id: 'X', biome: 'quarry' };
  const make = (dTroops) => tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { bomber: 2 }, dTroops, cfg: CFG, rand: () => 0.5 });
  const b = make({ infantry: 2 });
  for (const d of b.dots) if (d.side === 'A') Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
  for (let i = 0; i < 20; i++) tw.stepBattle(b, 0.25, CFG);
  assert.ok(b.dots.filter((d) => d.side === 'D').reduce((a, d) => a + d.hp, 0) < 2 * CFG.infantry.hp, 'infantry took damage');
  assert.ok(Math.abs(b.dots.filter((d) => d.side === 'A').reduce((a, d) => a + d.hp, 0) - 2 * CFG.bomber.hp) < 1e-6, "and couldn't shoot back");
  const c = make({ antiair: 2 });
  for (const d of c.dots) if (d.side === 'A') Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
  for (let i = 0; i < 20; i++) tw.stepBattle(c, 0.25, CFG);
  assert.ok(c.dots.filter((d) => d.side === 'A').reduce((a, d) => a + d.hp, 0) < 2 * CFG.bomber.hp, 'anti-air shoots bombers down');
});

test('artillery fires at range; shore bombardment hits troops near the flag', () => {
  const T = { id: 'X', biome: 'quarry' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { artillery: 1 }, dTroops: { infantry: 1 }, cfg: { ...CFG, dotsPerUnit: 1 }, rand: () => 0.5 });
  const art = b.dots.find((d) => d.side === 'A');
  const inf = b.dots.find((d) => d.side === 'D');
  Object.assign(art, { x: 40, y: 20, tx: 40, ty: 20 });
  Object.assign(inf, { x: 47, y: 20, tx: 47, ty: 20 });
  tw.stepBattle(b, 0.5, { ...CFG, dotsPerUnit: 1 });
  assert.ok(inf.hp < inf.max, 'shelled from 7 squares away');
  const c = tw.createBattle({ id: 2, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 1 }, dTroops: { infantry: 1 }, cfg: CFG, rand: () => 0.5, bombard: { A: 4, D: 0 } });
  tw.stepBattle(c, 1, CFG);
  assert.ok(c.dots.filter((d) => d.side === 'D').some((d) => d.hp < d.max), 'ships offshore hit the defenders');
});

// ---------------------------------------------------------------- formations
test('formations: availability depends on your units; bonuses apply; cooldown', () => {
  const T = { id: 'X', biome: 'quarry' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 2, mediumTank: 1, artillery: 1 }, dTroops: { militia: 1 }, cfg: CFG, rand: () => 0.5 });
  const avail = tw.availableFormations(b, 'A');
  for (const f of ['line', 'square', 'wedge', 'pincer', 'spearhead', 'combined', 'firebase']) assert.ok(avail.includes(f), f);
  assert.deepEqual(tw.availableFormations(b, 'D'), ['line', 'square']);
  assert.equal(tw.setFormation(b, 'D', 'spearhead'), false);
  assert.equal(tw.setFormation(b, 'A', 'spearhead'), true);
  assert.ok(['pincer', 'spearhead'].includes(b.formation.A), b.formation.A); // strong attacker with tanks
  // The tank leads: it's sent furthest forward (towards the defenders on the right)
  const tankT = b.dots.find((d) => d.type === 'mediumTank').tx;
  const artT = b.dots.find((d) => d.type === 'artillery').tx;
  assert.ok(tankT > artT);
  assert.equal(tw.setFormation(b, 'A', 'line'), false, 'cooldown');
  b.time += 3;
  assert.equal(tw.setFormation(b, 'A', 'line'), true);
});

test('formations: the square makes units tougher; changing is a player action', () => {
  const T = { id: 'X', biome: 'plain' };
  const run = (form) => {
    const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 1 }, dTroops: { infantry: 1 }, cfg: { ...CFG, dotsPerUnit: 1 }, rand: () => 0.5 });
    const [a, d] = [b.dots.find((x) => x.side === 'A'), b.dots.find((x) => x.side === 'D')];
    Object.assign(a, { x: 46, y: 20, tx: 46, ty: 20 });
    Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
    if (form) b.formation.D = form;
    tw.stepBattle(b, 1, { ...CFG, dotsPerUnit: 1 });
    return d.max - d.hp;
  };
  assert.ok(run('square') < run(null));
  let s = put(game(), 'M0', 0, { infantry: 3 });
  s = put(s, 'N0', 1, { infantry: 2 });
  s = allReady(s);
  s = act(s, 0, 'choose', { action: 'attack', target: 'N0', from: 'M0', troops: { infantry: 3 } });
  for (const p of s.players) if (!p.choice) s = act(s, p.seat, 'choose', { action: 'sustainable' });
  const id = s.battles[0].id;
  s = act(s, 0, 'battleFormation', { battle: id, formation: 'square' });
  assert.equal(s.battles[0].formation.A, 'square');
  assert.throws(() => act(s, 0, 'battleFormation', { battle: id, formation: 'spearhead' }), /right units/);
  assert.throws(() => act(s, 2, 'battleFormation', { battle: id, formation: 'line' }), /not fighting/);
});

test('auto-battle picks formations and changes them as the fight turns', () => {
  const T = { id: 'X', biome: 'quarry' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { lightTank: 2, infantry: 3 }, dTroops: { infantry: 1 }, cfg: CFG, rand: () => 0.5 });
  b.auto.A = true;
  tw.stepBattle(b, 0.1, CFG);
  assert.ok(['pincer', 'spearhead'].includes(b.formation.A), b.formation.A); // strong attacker with tanks
  // Now badly outnumbered: it closes ranks
  b.time += 5;
  for (const d of b.dots) if (d.side === 'A') d.hp = 0.5;
  for (let i = 0; i < 2; i++) tw.runAI(b, 'A');
  assert.equal(b.formation.A, 'square');
});

// ---------------------------------------------------------------- the view
test('view: unit catalogue with what I have unlocked, the research tree and formations', () => {
  const s = learn(game(), 0, 'artillery');
  const v = engine.viewFor(s, 0);
  assert.ok(v.tw.units.find((u) => u.type === 'artillery').unlocked);
  assert.ok(!v.tw.units.find((u) => u.type === 'bomber').unlocked);
  assert.equal(v.tw.techs.find((t) => t.id === 'lightTanks').cost, CFG.research.lightTanks);
  assert.ok(v.tw.formations.some((f) => f.id === 'pincer'));
  assert.deepEqual(v.players[0].research.done, ['artillery']);
  assert.ok(v.tw.seas.includes('S0')); // a bay next to my coast where ships can be launched
});

test('artillery: very weak up close (deals 15%, takes 150%), and its shots are sent for animation', () => {
  const T = { id: 'X', biome: 'plain' };
  const cfg1 = { ...CFG, dotsPerUnit: 1 };
  const duel = (type) => {
    const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { [type]: 1 }, dTroops: { militia: 1 }, cfg: cfg1, rand: () => 0.5 });
    const [a, d] = [b.dots.find((x) => x.side === 'A'), b.dots.find((x) => x.side === 'D')];
    Object.assign(a, { x: 46, y: 20, tx: 46, ty: 20 });
    Object.assign(d, { x: 47, y: 20, tx: 47, ty: 20 });
    tw.stepBattle(b, 1, cfg1);
    return { dealt: d.max - d.hp, taken: a.max - a.hp };
  };
  const art = duel('artillery');
  const inf = duel('infantry');
  // 2.2 attack x 15% = 0.33 per second, far below infantry's 1.5
  assert.ok(Math.abs(art.dealt - CFG.artillery.attack * 0.15) < 1e-9, `artillery dealt ${art.dealt}`);
  assert.ok(art.dealt < inf.dealt / 4);
  assert.ok(Math.abs(art.taken - inf.taken * 1.5) < 1e-9, 'overrun guns take 150%');
  // Firing at range records a shot; the snapshot hands it over once
  const b = tw.createBattle({ id: 2, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { artillery: 1 }, dTroops: { infantry: 1 }, cfg: cfg1, rand: () => 0.5 });
  Object.assign(b.dots.find((x) => x.side === 'A'), { x: 40, y: 20, tx: 40, ty: 20 });
  Object.assign(b.dots.find((x) => x.side === 'D'), { x: 47, y: 20, tx: 47, ty: 20 });
  for (let i = 0; i < 5; i++) tw.stepBattle(b, 0.1, cfg1);
  const snap = tw.snapshot(b);
  assert.equal(snap.shots.length, 1, 'about one visible shell a second');
  assert.equal(snap.shots[0][4], 'artillery');
  assert.deepEqual(snap.shots[0].slice(2, 4), [47, 20]);
  assert.equal(tw.snapshot(b).shots.length, 0, 'each shot is sent once');
});

test('several units ordered together move as one block and keep their shape', () => {
  const T = { id: 'X', biome: 'quarry' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { infantry: 3 }, dTroops: { infantry: 1 }, cfg: CFG, rand: () => 0.5 });
  const mine = b.dots.filter((d) => d.side === 'A');
  const before = mine.map((d) => [d.x, d.y]);
  const c = { x: mine.reduce((a, d) => a + d.x, 0) / mine.length, y: mine.reduce((a, d) => a + d.y, 0) / mine.length };
  tw.order(b, 'A', mine.map((d) => d.id), c.x + 5, c.y + 2);
  mine.forEach((d, i) => {
    assert.ok(Math.abs(d.tx - (before[i][0] + 5)) < 1e-6 && Math.abs(d.ty - (before[i][1] + 2)) < 1e-6, 'each dot shifts by the same amount');
  });
});

test('artillery follows the army until the player parks it by hand', () => {
  const T = { id: 'X', biome: 'quarry' };
  const cfg = { ...CFG, dotsPerUnit: 1 };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { artillery: 1, infantry: 1 }, dTroops: { infantry: 1 }, cfg, rand: () => 0.5 });
  b.ordered.A = true; // the player is in charge (not auto-battle)
  const art = b.dots.find((d) => d.side === 'A' && d.type === 'artillery');
  const foe = b.dots.find((d) => d.side === 'D');
  Object.assign(art, { x: 5, y: 20, tx: 5, ty: 20 });
  Object.assign(foe, { x: 50, y: 20, tx: 50, ty: 20 });
  tw.stepBattle(b, 0.1, cfg);
  assert.ok(art.tx > 30, 'guns head towards the enemy, to just inside their range');
  assert.ok(50 - art.tx <= cfg.artillery.range, 'and stop within range');
  assert.ok(50 - art.tx >= cfg.artillery.range * 0.5, 'but stay well back');
  // The player parks the guns: they stay put.
  tw.order(b, 'A', [art.id], 8, 20);
  for (let i = 0; i < 30; i++) tw.stepBattle(b, 0.1, cfg);
  assert.ok(Math.abs(art.tx - 8) < 2, 'parked guns stay where they were put');
});

test('anti-tank and anti-air are specialists: deadly against their target, weak against troops', () => {
  assert.ok(ARS.matchup('antitank', 'heavyTank', CFG) >= 5);
  assert.ok(ARS.matchup('antitank', 'infantry', CFG) <= 0.2);
  assert.ok(ARS.matchup('antiair', 'bomber', CFG) >= 4);
  assert.ok(ARS.matchup('antiair', 'infantry', CFG) <= 0.2);
  assert.ok(ARS.matchup('antiair', 'mediumTank', CFG) <= 0.2);
  // Head to head: 2 anti-tank beat a medium tank, but lose to 2 infantry.
  const duel = (a, d) => {
    const T = { id: 'X', biome: 'quarry' };
    const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: a, dTroops: d, cfg: CFG, rand: () => 0.5 });
    for (const x of b.dots) Object.assign(x, { x: 30 + (x.side === 'A' ? -0.5 : 0.5), y: 20 + (x.id % 5) * 0.3, tx: 30, ty: 20 });
    const start = { A: 0, D: 0 };
    for (const x of b.dots) start[x.side] += x.max;
    const hp = (side) => b.dots.filter((x) => x.side === side).reduce((t, x) => t + x.hp, 0) / start[side];
    for (let i = 0; i < 300 && b.status === 'live' && hp('A') > 0.05 && hp('D') > 0.05; i++) tw.stepBattle(b, 0.1, CFG);
    return hp('A') - hp('D');
  };
  assert.ok(duel({ antitank: 2 }, { mediumTank: 1 }) > 0, 'anti-tank beats a tank');
  assert.ok(duel({ antitank: 2 }, { infantry: 2 }) < 0, 'but loses to infantry');
});

test('bombers over ground troops drop bombs the battle screen can animate', () => {
  const T = { id: 'X', biome: 'quarry' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { bomber: 1 }, dTroops: { infantry: 1 }, cfg: CFG, rand: () => 0.5 });
  const inf = b.dots.find((d) => d.side === 'D');
  for (const d of b.dots) if (d.side === 'A') Object.assign(d, { x: inf.x, y: inf.y, tx: inf.x, ty: inf.y });
  for (let i = 0; i < 12; i++) tw.stepBattle(b, 0.25, CFG);
  const snap = tw.snapshot(b);
  const bombs = snap.shots.filter((s) => s[4] === 'bomb');
  assert.ok(bombs.length >= CFG.dotsPerUnit, 'each bomber dot drops bombs');
  assert.ok(bombs.length <= CFG.dotsPerUnit * 4, 'about one per second, not every tick');
});

test('bombs splash onto ground units packed next to the target', () => {
  const T = { id: 'X', biome: 'quarry' };
  const cfg = { ...CFG, dotsPerUnit: 1 };
  const run = (splashPct) => {
    const c = { ...cfg, bomberSplashPct: splashPct };
    const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { bomber: 1 }, dTroops: { infantry: 3 }, cfg: c, rand: () => 0.5 });
    const foes = b.dots.filter((d) => d.side === 'D');
    foes.forEach((d, i) => Object.assign(d, { x: 40 + i * 1.1, y: 20, tx: 40 + i * 1.1, ty: 20 }));
    const bomber = b.dots.find((d) => d.side === 'A');
    Object.assign(bomber, { x: 41.1, y: 20, tx: 41.1, ty: 20 });
    tw.stepBattle(b, 0.5, c);
    return foes.filter((d) => d.hp < d.max).length;
  };
  assert.equal(run(0), 1, 'without splash only the target is hurt');
  assert.ok(run(50) >= 2, 'with splash its neighbours are hurt too');
});

// ---------------------------------------------------------------- unit levels
test('unit levels: research level 2-4 in order, after the unit itself; costs from config', () => {
  let s = game();
  assert.equal(ARS.levelOf(s.players[0], 'lightTank'), 1);
  assert.throws(() => act(s, 0, 'research', { tech: 'lightTankL2', materials: bag(CFG.levelCost[2]) }), /Research Light tanks first/);
  assert.throws(() => act(s, 0, 'research', { tech: 'infantryL3', materials: bag(CFG.levelCost[3]) }), /Infantry level 2 first/);
  s = act(s, 0, 'research', { tech: 'infantryL2', materials: bag(CFG.levelCost[2]) });
  s = nextRound(s);
  assert.equal(ARS.levelOf(s.players[0], 'infantry'), 2);
  assert.ok(s.log.some((e) => /reaches Infantry level 2/.test(e.text)));
  const v = engine.viewFor(s, 0);
  assert.equal(v.tw.units.find((u) => u.type === 'infantry').level, 2);
  assert.equal(v.tw.techs.find((t) => t.id === 'infantryL3').cost, CFG.levelCost[3]);
  assert.ok(!v.tw.units.find((u) => u.type === 'militia').leveled);
});

test('unit levels make every unit of that type tougher, harder-hitting and faster in battle', () => {
  const T = { id: 'M1', kind: 'land' };
  const make = (lv) => tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { lightTank: 1 }, dTroops: { infantry: 1 }, cfg: { ...CFG, dotsPerUnit: 1 }, rand: () => 0.5, levels: { A: lv, D: {} } });
  const plain = make({});
  const vet = make({ lightTank: 4 });
  const hp = (b) => b.dots.find((d) => d.side === 'A').max;
  assert.equal(Math.round(hp(vet) * 100) / 100, Math.round(hp(plain) * (1 + 3 * CFG.levelHpPct / 100) * 100) / 100);
  // Same fight, one with level-4 tanks: the defender loses more HP.
  for (const b of [plain, vet]) {
    const a = b.dots.find((d) => d.side === 'A');
    const d = b.dots.find((x) => x.side === 'D');
    a.x = d.x - 1; a.y = d.y; a.tx = a.x; a.ty = a.y; d.tx = d.x; d.ty = d.y;
    b.auto = { A: false, D: false };
    tw.stepBattle(b, 0.5, CFG);
  }
  const lost = (b) => { const d = b.dots.find((x) => x.side === 'D'); return d.max - d.hp; };
  assert.ok(lost(vet) > lost(plain) * 1.3, `level 4 should hit harder (${lost(vet)} vs ${lost(plain)})`);
});

test('self-propelled artillery: needs artillery + motorised; artillery upgrades to it; fires at range and keeps up', () => {
  assert.deepEqual(ARS.TECHS.selfPropelled.needs, ['artillery', 'motorised']);
  assert.ok(ARS.upgradePath('artillery', 'spArtillery'));
  assert.ok(CFG.spArtillery.speed > CFG.artillery.speed * 2);
  assert.equal(CFG.spArtillery.range, CFG.artillery.range);
  let s = learn(game(), 0, 'artillery', 'motorised', 'selfPropelled');
  s = put(s, 'C0', 0, { artillery: 2 });
  s = act(s, 0, 'upgradeUnits', { tile: 'C0', from: 'artillery', to: 'spArtillery', count: 1, materials: bag(CFG.spArtillery.cost - CFG.artillery.cost) });
  assert.equal(tile(s, 'C0').troops[0].spArtillery, 1);
  const T = { id: 'M1', kind: 'land' };
  const b = tw.createBattle({ id: 1, kind: 'land', tile: T, from: T, attacker: 0, defender: 1, aTroops: { spArtillery: 1 }, dTroops: { infantry: 1 }, cfg: { ...CFG, dotsPerUnit: 1 }, rand: () => 0.5 });
  const g = b.dots.find((d) => d.side === 'A');
  const e = b.dots.find((d) => d.side === 'D');
  g.x = e.x - 10; g.y = e.y; g.tx = g.x; g.ty = g.y;
  b.auto = { A: false, D: false };
  b.gunsHeld.A[g.unit] = true;
  tw.stepBattle(b, 0.5, CFG);
  assert.ok(e.hp < e.max, 'shelled from range');
});

// ---------------------------------------------------------------- the oceans board
// Seat 0 = B2 (capital), C1, C3 on the west coast; seat 1 = I2, I3, J2 on the east.
// Row 3 of the map is sea from D3 to H3 (E3 is a fishing ground).
function ocean() {
  let s = newGame({ n: 4, mode: 'totalwar', oceans: true, biomes: ['forest', 'quarry', 'riverbank', 'forest'] });
  s = structuredClone(s);
  for (const p of s.players) p.materials = { ...rich };
  return s;
}
const views = (s, seat) => engine.viewFor(s, seat);

test('oceans board: two continents, 84 hexes, the default for Total War, with fishing grounds', () => {
  const d = cloneDefaults();
  assert.equal(d.totalwar.boardLayout, 'oceans');
  const s = ocean();
  assert.equal(s.board.tiles.length, 84);
  assert.ok(s.board.seaLanes);
  assert.equal(s.board.tiles.filter((t) => t.fish).length, 5);
  assert.equal(tile(s, 'B2').owner, 0);
  assert.equal(tile(s, 'I2').owner, 1);
});

test('sea lanes: fleets attack only the sea next to them and sail through free sea', () => {
  let s = learn(ocean(), 0, 'shipyards');
  s = put(s, 'D3', 0, { destroyer: 2 });
  const v = views(s, 0);
  assert.ok(v.attackTargets.includes('E3'));
  assert.ok(!v.attackTargets.includes('H3'), 'too far away');
  s = act(s, 0, 'moveUnits', { from: 'D3', to: 'G3', troops: { destroyer: 1 } });
  assert.equal(tile(s, 'G3').controller, 0);
  // An enemy wall of ships across the channel blocks the route.
  for (const id of ['F3', 'F2', 'G2', 'G4', 'H3']) s = put(s, id, 1, { destroyer: 1 }); // boxed in
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'G3', to: 'D3', troops: { destroyer: 1 } }), /No sea route/);
});

test('convoys: troops cross the sea only along an unbroken chain of your ships', () => {
  let s = put(ocean(), 'C3', 0, { infantry: 3 });
  for (const id of ['D3', 'E3', 'F3', 'G3', 'H3']) s = put(s, id, 0, { destroyer: 1 });
  let v = views(s, 0);
  assert.ok(v.attackTargets.includes('I3'), 'the far coast is in reach');
  assert.ok((v.attackSources.I3 || []).some((x) => x.tile === 'C3' && x.amphibious));
  // Sink one ship in the middle: the chain is broken.
  s = edit(s, (c) => {
    const t = tile(c, 'F3');
    t.units = {};
    t.troops = {};
    t.controller = null;
  });
  v = views(s, 0);
  assert.ok(!(v.attackSources.I3 || []).some((x) => x.tile === 'C3'));
});

test('fishing grounds pay their holder; enemy ships off a coast blockade it', () => {
  let s = ocean();
  const income = (st) => {
    const p = views(st, 0).players[0].production.passive;
    return p.wood + p.stone + p.sandbag;
  };
  const before = income(s);
  s = put(s, 'E3', 0, { destroyer: 1 });
  assert.equal(income(s), before + CFG.fishingIncome);
  assert.equal(views(s, 0).players[0].production.fishing, 1);
  // Seat 1 parks a ship next to C3.
  s = put(s, 'D3', 1, { destroyer: 1 });
  const v = views(s, 0);
  assert.ok(v.blockaded.includes('C3'));
  assert.ok(v.players[0].production.blockaded.includes('C3'));
  assert.ok(income(s) < before + CFG.fishingIncome);
});

test('bombardment: cruisers and battleships shell a coast next to them, once a round', () => {
  let s = put(ocean(), 'D3', 0, { battleship: 2, destroyer: 1 });
  s = put(s, 'C3', 0, { infantry: 0 });
  // Seat 1 has troops on a coast next to D3? D3 touches C3 (ours). Use seat 1 troops on C4 instead.
  s = put(s, 'C4', 1, { infantry: 6 });
  let v = views(s, 0);
  assert.ok((v.bombardTargets.D3 || []).includes('C4'));
  s = edit(s, (c) => (c.settings.totalwar.navalHitPct = 100));
  s = act(s, 0, 'bombard', { from: 'D3', target: 'C4' });
  assert.equal(tile(s, 'C4').units[1], 2, '4 shots (2 battleships × 2), all hit');
  assert.ok(s.log.some((e) => /shells/.test(e.text)));
  assert.throws(() => act(s, 0, 'bombard', { from: 'D3', target: 'C4' }), /already fired/);
  // Destroyers alone can't bombard.
  let d = put(ocean(), 'D3', 0, { destroyer: 2 });
  d = put(d, 'C4', 1, { infantry: 3 });
  assert.throws(() => act(d, 0, 'bombard', { from: 'D3', target: 'C4' }), /Only cruisers and battleships/);
});

test('convoy interception: enemy warships beside the chain sink crossing troops; destroyers escort', () => {
  const setup = (escort) => {
    let s = put(ocean(), 'C3', 0, { infantry: 4 });
    s = put(s, 'I3', 1, { infantry: 1 });
    for (const id of ['D3', 'E3', 'F3', 'G3', 'H3']) s = put(s, id, 0, escort && id === 'E3' ? { destroyer: 2 } : { cruiser: 1 });
    s = put(s, 'G4', 1, { battleship: 1 }); // next to the chain
    return edit(s, (c) => (c.settings.totalwar.navalHitPct = 100));
  };
  let s = setup(false);
  s = act(allReady(s), 0, 'choose', { action: 'attack', target: 'I3', from: 'C3', count: 4, troops: { infantry: 4 } });
  for (const p of s.players) if (p.seat !== 0 && !p.choice) s = act(s, p.seat, 'choose', { action: 'sustainable', mix: p.biome === 'mixed' ? { wood: 3 } : undefined });
  assert.ok(s.log.some((e) => /fire on Ana's convoy/.test(e.text) && /2 infantry sunk/.test(e.text)), 'battleship: 2 shots, both hit');
  let e = setup(true);
  e = act(allReady(e), 0, 'choose', { action: 'attack', target: 'I3', from: 'C3', count: 4, troops: { infantry: 4 } });
  for (const p of e.players) if (p.seat !== 0 && !p.choice) e = act(e, p.seat, 'choose', { action: 'sustainable', mix: p.biome === 'mixed' ? { wood: 3 } : undefined });
  assert.ok(!e.log.some((x) => /convoy/.test(x.text)), 'two destroyers screen both shots');
});

// ---------------------------------------------------------------- random maps
const { areAdjacent } = require('../engine/board');
function randomGame(n, seed) {
  return newGame({ n, mode: 'totalwar', oceans: true, seed, biomes: ['forest', 'quarry', 'riverbank', 'mixed', 'forest'].slice(0, n), settings: (c) => (c.totalwar.boardLayout = 'random') });
}
const groupsOf = (tiles) => {
  const seen = new Set();
  let n = 0;
  for (const t of tiles) {
    if (seen.has(t)) continue;
    n++;
    const q = [t];
    seen.add(t);
    while (q.length) {
      const x = q.pop();
      for (const y of tiles) if (!seen.has(y) && areAdjacent(x, y)) { seen.add(y); q.push(y); }
    }
  }
  return n;
};

test('random maps: a valid new map for 3-5 players — one ocean, fair coastal starts, fishing, the Village', () => {
  for (const n of [3, 4, 5]) {
    for (let seed = 1; seed <= 6; seed++) {
      const s = randomGame(n, seed * 13);
      assert.equal(s.board.layout, 'random');
      assert.ok(s.board.seaLanes);
      const T = s.board.tiles;
      const sea = T.filter((t) => t.kind === 'sea');
      assert.equal(groupsOf(sea), 1, `seed ${seed}: the ocean is one connected sea`);
      assert.equal(T.filter((t) => t.kind === 'village').length, 1);
      assert.ok(T.filter((t) => t.fish).every((t) => t.kind === 'sea') && T.some((t) => t.fish));
      const homes = s.players.map((p) => p.homeTile);
      assert.equal(new Set(homes).size, n);
      for (const p of s.players) {
        const mine = T.filter((t) => t.owner === p.seat);
        assert.equal(mine.length, 3, 'capital + 2 provinces');
        assert.ok(mine.every((t) => t.kind === 'land'));
        assert.ok(mine.some((t) => sea.some((x) => areAdjacent(x, t))), 'every player has a coast');
      }
    }
  }
});

test('random maps: the same seed makes the same map; different seeds make different maps', () => {
  const ids = (s) => s.board.tiles.map((t) => t.id + t.kind[0] + (t.owner ?? '')).join();
  assert.equal(ids(randomGame(4, 99)), ids(randomGame(4, 99)));
  assert.notEqual(ids(randomGame(4, 99)), ids(randomGame(4, 100)));
});

test('reinforcements: land units move to land you hold overseas along your chain of ships', () => {
  let s = put(ocean(), 'C3', 0, { infantry: 4 });
  s = put(s, 'I3', 0, { infantry: 1 }); // a beachhead we took across the sea
  assert.throws(() => act(s, 0, 'moveUnits', { from: 'C3', to: 'I3', troops: { infantry: 2 } }), /No route/);
  for (const id of ['D3', 'E3', 'F3', 'G3', 'H3']) s = put(s, id, 0, { destroyer: 1 });
  s = act(s, 0, 'moveUnits', { from: 'C3', to: 'I3', troops: { infantry: 2 } });
  assert.equal(tile(s, 'I3').troops[0].infantry, 3);
  assert.equal(tile(s, 'C3').troops[0].infantry, 2);
  assert.ok(s.log.some((e) => /shipped 2 units .* by sea/.test(e.text)));
  // Enemy guns next to the chain fire on them (the destroyers screen 5 shots; a battleship fires 2 → not enough).
  let t = put(ocean(), 'C3', 0, { infantry: 4 });
  t = put(t, 'I3', 0, { infantry: 1 });
  for (const id of ['D3', 'E3', 'F3', 'G3', 'H3']) t = put(t, id, 0, { cruiser: 1 });
  t = put(t, 'G4', 1, { battleship: 1 });
  t = edit(t, (c) => (c.settings.totalwar.navalHitPct = 100));
  t = act(t, 0, 'moveUnits', { from: 'C3', to: 'I3', troops: { infantry: 3 } });
  assert.equal(tile(t, 'I3').troops[0].infantry, 2, '1 + 3 shipped − 2 sunk');
  assert.ok(t.log.some((e) => /reinforcements to/.test(e.text)));
});
