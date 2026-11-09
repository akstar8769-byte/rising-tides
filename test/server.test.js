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
    assert.match((await a.call('lobby', { op: 'setMode', mode: 'war' })).error, /not built/);
    assert.ok((await a.call('startGame')).ok);
    await tick();
    assert.equal(a.last.game.phase, 'talk');
    assert.equal(a.last.game.settings.base.rounds, 2);

    // New names can't join a running game; old names can rejoin their seat
    const d = client(srv.port);
    assert.match((await d.call('joinRoom', { code: made.code, name: 'Dev' })).error, /already started/);
    b.disconnect();
    const b2 = client(srv.port);
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
    assert.equal(a.last.game.flood, 4);
    assert.ok(a.last.record);
    assert.match(a.last.recordCsv, /^date,mode/);

    // Host goes back to the lobby for another game
    assert.ok((await a.call('host', { op: 'backToLobby' })).ok);
    await tick();
    assert.equal(a.last.game, null);
    d.disconnect();
    b2.disconnect();
  } finally {
    a.disconnect();
    c.disconnect();
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
