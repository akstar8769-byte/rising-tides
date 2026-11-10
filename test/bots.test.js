'use strict';
// Bots: they must be able to play whole games by themselves (every mode, every
// personality) without getting stuck, and work through the real server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { engine, newGame } = require('./helpers');
const bots = require('../server/bots');
const { startServer } = require('../server');

/** Play a game with only bots, the way the server does: one action at a time. */
function botsOnlyGame(mode, n, stationed, seed) {
  let s = newGame({
    n,
    mode,
    seed,
    biomes: ['forest', 'quarry', 'riverbank', 'mixed', 'forest'].slice(0, n),
    settings: (c) => {
      c.war.stationedUnits = stationed;
      c.general.treatiesEnabled = seed % 2 === 0; // half the games with treaties on
    },
  });
  const personalities = ['cautious', 'balanced', 'warlike', 'balanced', 'warlike'];
  const mem = s.players.map((p, i) => ({ personality: personalities[i], tried: new Set(), phaseKey: null, failures: 0 }));
  let steps = 0;
  let skips = 0;
  while (s.phase !== 'ended' && steps < 4000) {
    steps++;
    const seat = engine.waitingFor(s)[0];
    const view = engine.viewFor(s, seat);
    const idea = bots.decide(view, mem[seat]);
    if (idea) {
      try {
        s = engine.applyAction(s, seat, idea.action);
        continue;
      } catch (e) {
        if (e.name !== 'RuleError') throw e;
        mem[seat].tried.add(idea.key);
        mem[seat].failures++;
        if (mem[seat].failures <= 12) continue;
      }
    }
    skips++;
    s = engine.applyAction(s, 'host', { type: 'skip', seat });
  }
  return { s, steps, skips };
}

for (const [mode, stationed] of [
  ['base', false],
  ['war', true],
  ['war', false],
  ['empire', true],
  ['empire', false],
]) {
  test(`bots finish ${mode}${mode === 'base' ? '' : stationed ? ' (stationed)' : ' (one army)'} games on their own`, () => {
    let attacks = 0;
    let pacts = 0;
    for (let g = 0; g < 8; g++) {
      const { s, steps, skips } = botsOnlyGame(mode, 3 + (g % 3), stationed, g + 1);
      pacts += s.players.reduce((a, p) => a + p.stats.pactsMade, 0);
      assert.equal(s.phase, 'ended', `game ${g} did not finish (${steps} steps)`);
      assert.ok(skips <= 3, `bots needed ${skips} skips in game ${g}`);
      attacks += s.players.reduce((a, p) => a + (p.stats.attack || 0) + (p.stats.raid || 0), 0);
    }
    assert.ok(attacks > 0, 'bots never fought'); // the warlike bots should start something
    assert.ok(pacts > 0, 'bots never made a pact');
  });
}

test('bots only build walls they expect to need, and save the rest', () => {
  const rich = (s, walls) => {
    const c = structuredClone(s);
    c.players[1].materials = { wood: 10, stone: 10, sandbag: 10 };
    c.players[1].walls = walls;
    return c;
  };
  const mem = () => ({ personality: 'balanced', tried: new Set(), phaseKey: null, failures: 0 });
  // Round 1, Flood 2, 7 rounds: expects roughly Flood 2 + 0.5 x 7 = 6 -> wants protection 6
  let s = rich(newGame({ n: 3, settings: (c) => (c.general.pactsEnabled = false) }), 1); // protection 2
  let idea = bots.decide(engine.viewFor(s, 1), mem());
  assert.equal(idea.action.type, 'buildWall');
  s = rich(newGame({ n: 3, settings: (c) => (c.general.pactsEnabled = false) }), 4); // protection 8: already enough
  idea = bots.decide(engine.viewFor(s, 1), mem());
  assert.notEqual(idea.action.type, 'buildWall');
  // At most one wall per round for a balanced bot
  s = rich(newGame({ n: 3, settings: (c) => (c.general.pactsEnabled = false) }), 1);
  const m = mem();
  const first = bots.decide(engine.viewFor(s, 1), m);
  s = engine.applyAction(s, 1, first.action);
  const second = bots.decide(engine.viewFor(s, 1), m);
  assert.notEqual(second.action.type, 'buildWall');
});

test('bots reply to chat keywords and react when attacked', () => {
  const realRandom = Math.random;
  Math.random = () => 0; // make every "chance" succeed, so the test is predictable
  test.after?.(() => (Math.random = realRandom));
  let s = newGame({ n: 3 });
  const mem = { personality: 'cautious', tried: new Set(), phaseKey: null, failures: 0 };
  const v = engine.viewFor(s, 1);
  const r = bots.reply('Bram, peace?', 0, v, mem, 'Bot Bram');
  assert.equal(r.action.type, 'proposePact');
  assert.equal(r.action.to, 0);
  assert.equal(bots.reply('nice weather', 0, v, mem, 'Bot Bram'), null); // not addressed
  assert.ok(bots.reply('hi everyone', 0, v, mem, 'Bot Bram').say);
  bots.react(v, mem); // first look: nothing to react to
  s = structuredClone(s);
  s.players[1].hits = { 0: 1 };
  assert.match(bots.react(engine.viewFor(s, 1), mem), /Ana/);
  assert.equal(bots.react(engine.viewFor(s, 1), mem), null); // only once
  Math.random = realRandom;
});

test('server: one human plus bots can play a whole game', async () => {
  const srv = await startServer(0);
  const c = io(`http://localhost:${srv.port}`, { transports: ['websocket'], forceNew: true });
  let last = null;
  c.on('state', (d) => (last = d));
  const call = (e, d) => new Promise((r) => c.emit(e, d, r));
  try {
    const { code } = await call('createRoom', { name: 'Solo' });
    assert.ok((await call('lobby', { op: 'addBot' })).ok);
    assert.ok((await call('lobby', { op: 'addBot' })).ok);
    assert.ok((await call('lobby', { op: 'setBotPersonality', seat: 2, personality: 'warlike' })).ok);
    await call('lobby', { op: 'setMode', mode: 'war' });
    await call('lobby', { op: 'setSetting', path: 'general.botThinkMs', value: 0 });
    await call('lobby', { op: 'setSetting', path: 'war.rounds', value: 3 });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(last.members.map((m) => m.bot), [null, 'balanced', 'warlike']);
    const joiner = io(`http://localhost:${srv.port}`, { transports: ['websocket'], forceNew: true });
    const res = await new Promise((r) => joiner.emit('joinRoom', { code, name: 'Bot Ada' }, r));
    assert.match(res.error, /belongs to a bot/);
    joiner.disconnect();
    assert.ok((await call('startGame')).ok);

    // The human just plays Sustainable and presses Ready; bots do the rest.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 30));
      const g = last.game;
      if (!g || g.phase === 'ended') break;
      if (!g.waitingFor.includes(g.you)) continue;
      const me = g.players[g.you];
      if (g.phase === 'choose' && !me.choice) {
        const prod = me.production;
        const mix = { wood: 0, stone: 0, sandbag: 0 };
        for (let i = 0; i < prod.free; i++) mix[prod.allowed[i % prod.allowed.length]]++;
        await call('action', { type: 'choose', action: 'sustainable', mix });
      } else if (g.phase === 'loot') {
        await call('action', { type: 'pickLoot', materials: g.players[g.pendingLoot.target].materials ? pickAny(g) : {} });
      } else if (!me.ready) await call('action', { type: 'ready' });
    }
    assert.equal(last.game.phase, 'ended');
    assert.equal(last.record.botCount, 2);
    assert.match(last.recordCsv, /,bot,/);
  } finally {
    c.disconnect();
    await srv.close();
  }
});

function pickAny(g) {
  const from = g.players[g.pendingLoot.target].materials;
  const take = { wood: 0, stone: 0, sandbag: 0 };
  let n = g.pendingLoot.count;
  for (const m of ['wood', 'stone', 'sandbag']) {
    const x = Math.min(n, from[m]);
    take[m] = x;
    n -= x;
  }
  return take;
}
