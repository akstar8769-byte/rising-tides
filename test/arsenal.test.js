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
