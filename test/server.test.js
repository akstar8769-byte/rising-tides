'use strict';
// End-to-end test: start the real server, connect 3 socket clients,
// create a room, join, start, and play a whole Base game.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { startServer } = require('../server');

function client(port) {
  const c = io(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  c.last = null;
  c.on('state', (s) => (c.last = s));
  c.call = (event, data) => new Promise((res) => c.emit(event, data, res));
  return c;
}
const tick = () => new Promise((r) => setTimeout(r, 30));

test('server: create, join, start, play a full Base game, rejoin by name', async () => {
  const srv = await startServer(0);
  const [a, b, c] = [client(srv.port), client(srv.port), client(srv.port)];
  try {
    const made = await a.call('createRoom', { name: 'Ana' });
    assert.ok(made.ok && /^[A-Z]{4}$/.test(made.code));
    assert.ok((await b.call('joinRoom', { code: made.code.toLowerCase(), name: 'Ben' })).ok);
    assert.ok((await c.call('joinRoom', { code: made.code, name: 'Cara' })).ok);
    assert.match((await b.call('joinRoom', { code: 'ZZZZ', name: 'X' })).error, /No room/);

    // Only the host can change settings or start
    assert.match((await b.call('lobby', { op: 'setSetting', path: 'base.rounds', value: 2 })).error, /Only the host/);
    assert.ok((await a.call('lobby', { op: 'setSetting', path: 'base.rounds', value: 2 })).ok);
    assert.match((await a.call('lobby', { op: 'setSetting', path: 'base.rounds', value: -1 })).error, /whole number/);
    assert.match((await a.call('lobby', { op: 'setMode', mode: 'nuclear' })).error, /Unknown mode/);
    assert.ok((await a.call('startGame')).ok);
    await tick();
    assert.equal(a.last.game.phase, 'talk');
    assert.equal(a.last.game.settings.base.rounds, 2);

    // New names can't join a running game; old names can rejoin their seat
    const d = (globalThis.__d = client(srv.port));
    assert.match((await d.call('joinRoom', { code: made.code, name: 'Dev' })).error, /already started/);
    b.disconnect();
    const b2 = (globalThis.__b2 = client(srv.port));
    assert.ok((await b2.call('joinRoom', { code: made.code, name: 'ben' })).ok);
    await tick();
    assert.equal(b2.last.you.seat, 1);

    // Players can't use host-only actions
    assert.match((await b2.call('action', { type: 'endGame' })).error, /Not allowed/);

    const players = [a, b2, c];
    for (let round = 1; round <= 2; round++) {
      for (const p of players) assert.ok((await p.call('action', { type: 'ready' })).ok);
      await tick();
      assert.equal(a.last.game.phase, 'choose');
      assert.ok((await a.call('action', { type: 'choose', action: 'unsustainable', mix: { wood: 4 } })).ok);
      await tick();
      // Ben can't see Ana's secret choice
      assert.equal(b2.last.game.players[0].choice, null);
      assert.equal(b2.last.game.players[0].hasChosen, true);
      assert.ok((await b2.call('action', { type: 'choose', action: 'sustainable' })).ok);
      assert.ok((await c.call('action', { type: 'choose', action: 'sustainable' })).ok);
      await tick();
      assert.equal(a.last.game.phase, 'trade');
      for (const p of players) assert.ok((await p.call('action', { type: 'ready' })).ok);
    }
    await tick();
    assert.equal(a.last.game.phase, 'ended');
    // Base starts at Flood 3; each round 2 of 3 players chose Sustainable, so the majority lowers it by 1.
    assert.equal(a.last.game.flood, 1);
    assert.ok(a.last.record);
    assert.match(a.last.recordCsv, /^date,mode/);

    // Host goes back to the lobby for another game
    assert.ok((await a.call('host', { op: 'backToLobby' })).ok);
    await tick();
    assert.equal(a.last.game, null);
  } finally {
    // Close every connection, even after a failure, so a failing test can never hang the run.
    for (const x of [a, c, globalThis.__b2, globalThis.__d]) if (x) x.disconnect();
    await srv.close();
  }
});

test('server: pause blocks actions; host can skip a player', async () => {
  const srv = await startServer(0);
  const cs = [client(srv.port), client(srv.port), client(srv.port)];
  try {
    const { code } = await cs[0].call('createRoom', { name: 'Ana' });
    await cs[1].call('joinRoom', { code, name: 'Ben' });
    await cs[2].call('joinRoom', { code, name: 'Cara' });
    await cs[0].call('startGame');
    assert.ok((await cs[0].call('host', { op: 'pause' })).ok);
    assert.match((await cs[1].call('action', { type: 'ready' })).error, /paused/);
    assert.match((await cs[1].call('host', { op: 'resume' })).error, /Only the host/);
    await cs[0].call('host', { op: 'resume' });
    await cs[0].call('action', { type: 'ready' });
    await cs[1].call('action', { type: 'ready' });
    assert.ok((await cs[0].call('host', { op: 'skip', seat: 2 })).ok);
    await tick();
    assert.equal(cs[0].last.game.phase, 'choose');

    // A host who refreshes the page (disconnects and comes straight back) stays host.
    cs[0].disconnect();
    await tick();
    cs[0] = client(srv.port);
    assert.ok((await cs[0].call('joinRoom', { code, name: 'Ana' })).ok);
    await tick();
    assert.equal(cs[0].last.you.isHost, true);
  } finally {
    cs.forEach((c) => c.disconnect());
    await srv.close();
  }
});

test('server: War and War + Empire are hidden from the lobby', async () => {
  const srv = await startServer(0);
  const a = client(srv.port);
  try {
    const meta = await new Promise((res) => a.once('meta', res));
    assert.deepEqual(meta.modes.sort(), ['base', 'totalwar']);
    await a.call('createRoom', { name: 'Ana' });
    assert.match((await a.call('lobby', { op: 'setMode', mode: 'war' })).error, /no longer offered/);
  } finally {
    a.close();
    await srv.close();
  }
});

test('server: the host can save a game and load it into a new room to carry on', async () => {
  const srv = await startServer(0);
  const a = client(srv.port);
  const a2 = client(srv.port);
  try {
    await a.call('createRoom', { name: 'Ana' });
    assert.ok((await a.call('lobby', { op: 'setMode', mode: 'totalwar' })).ok);
    assert.ok((await a.call('lobby', { op: 'setSetting', path: 'totalwar.scenario', value: 'eastFront41' })).ok);
    assert.ok((await a.call('lobby', { op: 'addBot' })).ok);
    assert.ok((await a.call('startGame')).ok);
    await tick();
    assert.ok((await a.call('action', { type: 'ready' })).ok);
    await tick();
    const saved = await a.call('saveGame');
    assert.equal(saved.save.format, 'rising-tides-save');
    assert.equal(saved.save.state.scenario.id, 'eastFront41');
    const round = saved.save.state.round;

    // A new room: the seats must match the save before it loads.
    await a2.call('createRoom', { name: 'Zed' });
    assert.match((await a2.call('loadGame', { save: saved.save })).error, /has 2 players/);
    assert.ok((await a2.call('lobby', { op: 'addBot' })).ok);
    assert.match((await a2.call('loadGame', { save: { format: 'nope' } })).error, /isn't a Rising Tides save/);
    const loaded = await a2.call('loadGame', { save: JSON.parse(JSON.stringify(saved.save)) });
    assert.ok(loaded.ok, loaded.error);
    await tick();
    const g = a2.last.game;
    assert.equal(g.round, round);
    assert.equal(g.scenario.name, 'Eastern Front, 1941');
    assert.equal(g.players[0].name, 'Zed', 'the new host takes over seat 1');
    assert.equal(g.board.tiles.find((t) => t.name === 'Moscow').controller, 1);
    // ...and play carries on.
    assert.ok((await a2.call('action', { type: 'ready' })).ok);
  } finally {
    a.close();
    a2.close();
    await srv.close();
  }
});

test('server: a Europe 1939 campaign — pick a nation, bots take the other 22, save and reload', async () => {
  const srv = await startServer(0);
  const a = client(srv.port);
  const a2 = client(srv.port);
  try {
    await a.call('createRoom', { name: 'Ana' });
    assert.ok((await a.call('lobby', { op: 'setMode', mode: 'totalwar' })).ok);
    assert.ok((await a.call('lobby', { op: 'setSetting', path: 'totalwar.scenario', value: 'europe39' })).ok);
    await tick();
    assert.equal(a.last.lobby.nations.length, 23);
    assert.match((await a.call('startGame')).error, /Pick a nation/);
    assert.ok((await a.call('lobby', { op: 'setNation', seat: 0, nation: 'UK' })).ok);
    assert.ok((await a.call('startGame')).ok);
    await tick();
    const g = a.last.game;
    assert.equal(g.players.length, 23);
    assert.equal(g.scenario.nations[g.you].id, 'UK', 'Ana plays Britain');
    assert.equal(a.last.members.filter((m) => m.bot).length, 22);
    assert.equal(g.scenario.date, 'Sep 1939');
    // Save, then load into a new room where Zed picks Britain.
    const saved = await a.call('saveGame');
    await a2.call('createRoom', { name: 'Zed' });
    assert.ok((await a2.call('lobby', { op: 'setMode', mode: 'totalwar' })).ok);
    assert.ok((await a2.call('lobby', { op: 'setSetting', path: 'totalwar.scenario', value: 'europe39' })).ok);
    assert.ok((await a2.call('lobby', { op: 'setNation', seat: 0, nation: 'UK' })).ok);
    const loaded = await a2.call('loadGame', { save: JSON.parse(JSON.stringify(saved.save)) });
    assert.ok(loaded.ok, loaded.error);
    await tick();
    assert.equal(a2.last.game.players[a2.last.game.you].name, 'Zed');
    assert.equal(a2.last.game.scenario.nations[a2.last.game.you].id, 'UK');
  } finally {
    a.close();
    a2.close();
    await srv.close();
  }
});

test('server: a civil war seats a bot for the breakaway nation, and the save still loads', async () => {
  const srv = await startServer(0);
  const a = client(srv.port);
  const b = client(srv.port);
  const setup = async (c, name) => {
    await c.call('createRoom', { name });
    assert.ok((await c.call('lobby', { op: 'setMode', mode: 'totalwar' })).ok);
    assert.ok((await c.call('lobby', { op: 'setSetting', path: 'totalwar.scenario', value: 'europe39' })).ok);
    assert.ok((await c.call('lobby', { op: 'setNation', seat: 0, nation: 'FRA' })).ok);
  };
  try {
    await setup(a, 'Ana');
    assert.ok((await a.call('startGame')).ok);
    // Give France a strong communist movement via a doctored save, then load it.
    const save = (await a.call('saveGame')).save;
    const fra = save.state.players.findIndex((p) => p.nation === 'FRA');
    save.state.players[fra].pop = { democracy: 50, fascism: 10, communism: 35, nonaligned: 5 };
    await setup(b, 'Bea');
    assert.ok((await b.call('loadGame', { save })).ok);
    const r = await b.call('action', { type: 'changeGovernment', ideology: 'communism' });
    assert.ok(r.ok, r.error);
    await tick();
    assert.equal(b.last.game.players.length, 24);
    assert.equal(b.last.members.length, 24);
    assert.ok(b.last.members[23].bot, 'a bot leads the loyalists');
    // A save made after the civil war loads, with the breakaway nation still a bot.
    const after = (await b.call('saveGame')).save;
    await a.call('leaveRoom').catch(() => {});
    const c = client(srv.port);
    await setup(c, 'Cy');
    const loaded = await c.call('loadGame', { save: after });
    assert.ok(loaded.ok, loaded.error);
    await tick();
    assert.equal(c.last.members.length, 24);
    assert.equal(c.last.game.scenario.nations[c.last.game.you].id, 'FRA');
    c.close();
  } finally {
    a.close();
    b.close();
    await srv.close();
  }
});

test('an old campaign save without governments gets them on load', () => {
  const CAMP = require('../engine/campaign');
  const { cloneDefaults } = require('../config');
  const engine = require('../engine');
  const st = cloneDefaults();
  st.totalwar.scenario = 'europe39';
  const s = engine.createGame({ mode: 'totalwar', settings: st, players: CAMP.nationsOf('europe39').map((n) => ({ name: n.name, biome: 'forest', bot: true })), seed: 2 });
  for (const p of s.players) delete p.gov, delete p.pop;
  delete s.campaign.extra;
  CAMP.upgradeSave(s);
  assert.equal(s.players[0].gov, 'fascism');
  assert.ok(s.campaign.extra);
});
