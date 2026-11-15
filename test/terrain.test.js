'use strict';
// Battlefield terrain (Total War): every land tile has a terrain type separate from
// its biome — plains, woods, hills or river — and battles are built from it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { newGame } = require('./helpers');
const tw = require('../engine/totalwar');
const BOARD = require('../engine/board');
const { terrainFit } = require('../server/bots');

const open = (grid) => {
  let n = 0;
  let all = 0;
  for (const r of grid) for (const c of r) (all++, c === '.' && n++);
  return n / all;
};
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);

test('every land tile in a War game gets a terrain type; Base tiles do not', () => {
  const s = newGame({ mode: 'totalwar', n: 4, oceans: true });
  const land = s.board.tiles.filter((t) => t.kind === 'land');
  assert.ok(land.every((t) => BOARD.TERRAINS[t.terrain]), 'all land tiles have a terrain');
  assert.ok(s.board.tiles.filter((t) => t.kind !== 'land').every((t) => !t.terrain), 'sea has none');
  const base = newGame({ mode: 'base' });
  assert.ok(base.board.tiles.every((t) => !t.terrain));
});

test('about 40% of land tiles are Plains, and every terrain shows up', () => {
  const counts = { plains: 0, woods: 0, hills: 0, river: 0 };
  let all = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = newGame({ mode: 'totalwar', n: 4, oceans: true, seed });
    for (const t of s.board.tiles) if (t.kind === 'land') (counts[t.terrain]++, all++);
  }
  const pct = counts.plains / all;
  assert.ok(pct > 0.33 && pct < 0.47, `plains ${pct}`);
  for (const k of ['woods', 'hills', 'river']) assert.ok(counts[k] / all > 0.12, `${k} ${counts[k] / all}`);
});

test('terrain does not change the game dice (same seed, same biomes as before)', () => {
  const a = newGame({ mode: 'totalwar', n: 4, oceans: true, seed: 9 });
  const b = newGame({ mode: 'totalwar', n: 4, oceans: true, seed: 9 });
  assert.deepEqual(a.board.tiles.map((t) => t.terrain), b.board.tiles.map((t) => t.terrain));
  assert.equal(a.rng, b.rng);
});

test('terrain leans towards the biome: forest tiles are more often Woods than quarry tiles are', () => {
  const by = { forest: { woods: 0, n: 0 }, quarry: { woods: 0, n: 0 } };
  for (let seed = 1; seed <= 30; seed++) {
    const s = newGame({ mode: 'totalwar', n: 4, oceans: true, seed });
    for (const t of s.board.tiles) if (by[t.biome]) (by[t.biome].n++, t.terrain === 'woods' && by[t.biome].woods++);
  }
  assert.ok(by.forest.woods / by.forest.n > by.quarry.woods / by.quarry.n + 0.08);
});

test('a Plains battlefield is open tank country; Woods and Hills are rough; River has a river', () => {
  let plains = 0;
  let woods = 0;
  let hills = 0;
  const r = rng(5);
  for (let i = 0; i < 100; i++) {
    plains += open(tw.makeTerrain('plains', 'plains', r));
    woods += open(tw.makeTerrain('woods', 'plains', r));
    hills += open(tw.makeTerrain('hills', 'plains', r));
  }
  assert.ok(plains / 100 > 0.95, `plains ${plains / 100}`);
  assert.ok(woods / 100 < 0.9 && hills / 100 < 0.9);
  assert.ok(tw.makeTerrain('woods', 'plains', r).join('').includes('f'));
  assert.ok(tw.makeTerrain('hills', 'plains', r).join('').includes('h'));
  const river = tw.makeTerrain('river', 'plains', r).join('');
  assert.ok(river.includes('w') && river.includes('='));
});

test('battles are built from the tile terrain, not the biome', () => {
  const s = newGame({ mode: 'totalwar', n: 4, oceans: true });
  const T = s.board.tiles.find((t) => t.kind === 'land' && t.biome === 'riverbank');
  T.terrain = 'plains';
  const from = { ...T, id: 'X', terrain: 'plains' };
  const b = tw.createBattle({ id: 1, tile: T, from, attacker: 0, defender: 1, aTroops: { infantry: 1 }, dTroops: { infantry: 1 }, cfg: s.settings.totalwar, rand: rng(3) });
  assert.ok(!b.terrain.join('').includes('w'), 'no river on a plains riverbank tile');
  // Old saves without a terrain fall back to the biome.
  assert.equal(BOARD.terrainOf({ biome: 'riverbank' }), 'river');
  assert.equal(BOARD.terrainOf({ biome: 'forest' }), 'woods');
});

test('bots rate a tank army higher on Plains and lower in Woods', () => {
  const tanks = { mediumTank: 3, infantry: 1 };
  assert.ok(terrainFit(tanks, 'plains') > 1.15);
  assert.ok(terrainFit(tanks, 'woods') < 0.8);
  assert.equal(terrainFit({ infantry: 4 }, 'woods'), 1);
});

test('continent board: one big landmass, west against east, every capital with two provinces', () => {
  for (const n of [3, 4, 5]) {
    const s = newGame({ mode: 'totalwar', n, oceans: true, settings: (c) => (c.totalwar.boardLayout = 'continent') });
    const land = s.board.tiles.filter((t) => t.kind === 'land');
    assert.equal(land.length, 86);
    assert.ok(s.board.seaLanes);
    for (const p of s.players) {
      assert.equal(s.board.tiles.filter((t) => t.owner === p.seat).length, 3);
      assert.ok(['B', 'A', 'L', 'M'].includes(p.homeTile[0]), 'capitals sit on the far west or east edge');
    }
    // All the land is one piece: walk it from the first tile.
    const seen = new Set([land[0].id]);
    const todo = [land[0]];
    while (todo.length) {
      const t = todo.pop();
      for (const o of BOARD.landNeighbours(s.board, t.id)) if (!seen.has(o.id)) (seen.add(o.id), todo.push(o));
    }
    assert.equal(seen.size, land.length);
  }
});

test('generals: the view lists only the tiles a general can reach, and bots stick to them', () => {
  const { engine } = require('./helpers');
  const s = newGame({ mode: 'totalwar', n: 4, oceans: true, settings: (c) => (c.totalwar.boardLayout = 'continent') });
  const v = engine.viewFor(s, 0);
  const gen = v.generals.find((g) => g.seat === 0);
  assert.deepEqual([...gen.moves].sort(), s.board.tiles.filter((t) => t.owner === 0 && t.role === 'province').map((t) => t.id).sort());
  assert.ok(!v.generals.find((g) => g.seat === 1).moves, "rivals' routes stay hidden");
  // Cut a province off: give the bot a far tile it can't walk to; it must not be offered.
  const far = s.board.tiles.find((t) => t.id === 'G6');
  Object.assign(far, { controller: 0 });
  const v2 = engine.viewFor(s, 0);
  assert.ok(!v2.generals.find((g) => g.seat === 0).moves.includes('G6'));
});
