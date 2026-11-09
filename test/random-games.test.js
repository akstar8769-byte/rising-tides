'use strict';
// Plays hundreds of random Base games with random (sometimes illegal) actions
// and checks that nothing crashes and no invariant is ever broken.
const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, newGame } = require('./helpers');

function randomAction(s, rnd) {
  const n = s.players.length;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const seat = Math.floor(rnd() * n);
  const bag = () => ({ wood: Math.floor(rnd() * 3), stone: Math.floor(rnd() * 3), sandbag: Math.floor(rnd() * 3) });
  const mix = (k) => {
    const b = { wood: 0, stone: 0, sandbag: 0 };
    for (let i = 0; i < k; i++) b[pick(['wood', 'stone', 'sandbag'])]++;
    return b;
  };
  const options = [
    () => [seat, { type: 'ready' }],
    () => [seat, { type: 'buildWall' }],
    () => [seat, { type: 'market', give: pick(['wood', 'stone', 'sandbag']), get: pick(['wood', 'stone', 'sandbag']) }],
    () => [seat, { type: 'donate', materials: bag() }],
    () => [seat, { type: 'gift', to: Math.floor(rnd() * n), materials: bag() }],
    () => [seat, { type: 'proposeTrade', to: Math.floor(rnd() * n), give: bag(), get: bag() }],
    () => [seat, { type: 'acceptTrade', id: s.trades.length ? pick(s.trades).id : 0 }],
    () => [seat, { type: 'choose', action: 'sustainable', mix: mix(2) }],
    () => [seat, { type: 'choose', action: 'unsustainable', mix: mix(4) }],
    () => [seat, { type: 'choose', action: 'raid', target: Math.floor(rnd() * n) }],
    () => [s.pendingLoot ? s.pendingLoot.raider : seat, { type: 'pickLoot', materials: mix(s.pendingLoot ? s.pendingLoot.count : 3) }],
    () => ['system', { type: 'lootTimeout' }],
  ];
  if (s.mode !== 'base') {
    const tiles = s.board.tiles.filter((t) => t.kind === 'land').map((t) => t.id);
    options.push(
      () => [seat, { type: 'recruit', count: 1, materials: mix(s.settings.war.unitCost) }],
      () => [seat, { type: 'recruit', count: 1, materials: mix(s.settings.war.unitCost) }],
      () => [seat, { type: 'choose', action: 'attack', target: pick(tiles) }],
      () => [seat, { type: 'choose', action: 'attack', target: pick(tiles) }],
      () => [seat, { type: 'choose', action: 'attack', target: pick(tiles) }],
      () => [seat, { type: 'choose', action: 'revolt' }],
      () => [seat, { type: 'choose', action: 'sustainable', mix: mix(3) }],
      () => [seat, { type: 'choose', action: 'unsustainable', mix: mix(6) }],
      () => [seat, { type: 'setCommand', puppet: Math.floor(rnd() * n), action: pick(['sustainable', 'unsustainable', 'attack']), target: pick(tiles) }],
      () => [seat, { type: 'planWithdraw', tile: pick(tiles) }],
      () => [seat, { type: 'planRelease', puppet: Math.floor(rnd() * n) }],
    );
  }
  return pick(options)();
}

// Set RANDOM_GAMES=100 (for example) to run more games per mode.
const PER_MODE = Number(process.env.RANDOM_GAMES) || 15;
for (const [mode, games] of [['base', PER_MODE], ['war', PER_MODE], ['empire', PER_MODE]]) test(`random ${mode} games: no crashes, no negative materials or units, always finishes`, () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let g = 0; g < games; g++) {
    const n = 3 + (g % 3);
    let s = newGame({ n, mode, seed: g + 1, settings: (c) => (c.base.stormEnabled = g % 2 === 0) });
    let steps = 0;
    while (s.phase !== 'ended' && steps < 5000) {
      const [actor, action] = randomAction(s, rnd);
      try {
        s = engine.applyAction(s, actor, action);
      } catch (e) {
        if (e.name !== 'RuleError') throw e; // only rule errors are allowed
      }
      // Invariants
      for (const p of s.players) {
        for (const m of ['wood', 'stone', 'sandbag']) assert.ok(p.materials[m] >= 0, 'negative material');
        assert.ok(p.units >= 0, 'negative units');
        if (p.puppetOf != null) assert.equal(s.players[p.puppetOf].puppetOf, null, 'a puppet has a puppet');
      }
      for (const t of s.board.tiles) if (t.role === 'capital') assert.equal(t.controller, t.owner, 'capital changed hands');
      assert.ok(s.flood >= 2);
      steps++;
      // Unstick: if a build phase drags on, the host skips everyone
      if (steps % 200 === 0) for (const seat of engine.waitingFor(s)) if (s.phase !== 'ended') s = engine.applyAction(s, 'host', { type: 'skip', seat });
    }
    assert.equal(s.phase, 'ended', `game ${g} did not finish`);
    engine.viewFor(s, 0);
    engine.recordToCsv(engine.playtestRecord(s));
  }
});
