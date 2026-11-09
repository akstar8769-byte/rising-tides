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
  return pick(options)();
}

test('random games: no crashes, no negative materials, always finishes', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let g = 0; g < 300; g++) {
    const n = 3 + (g % 3);
    let s = newGame({ n, seed: g + 1, settings: (c) => (c.base.stormEnabled = g % 2 === 0) });
    let steps = 0;
    while (s.phase !== 'ended' && steps < 5000) {
      const [actor, action] = randomAction(s, rnd);
      try {
        s = engine.applyAction(s, actor, action);
      } catch (e) {
        if (e.name !== 'RuleError') throw e; // only rule errors are allowed
      }
      // Invariants
      for (const p of s.players) for (const m of ['wood', 'stone', 'sandbag']) assert.ok(p.materials[m] >= 0, 'negative material');
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
