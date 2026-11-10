/**
 * ROOMS: lobby, seats, rejoining, host controls and real-time sync.
 * =================================================================
 * Rooms live in server memory only. If the server restarts, rooms are lost.
 *
 * The server is the referee: every game action goes through the rules
 * engine (engine/index.js), which throws an error if it's not allowed.
 * Each player is sent only their own filtered view of the game.
 *
 * Messages from the browser (all use an "ack" callback that gets
 * { ok: true, ... } or { error: 'message' }):
 *   createRoom { name }               joinRoom { code, name, token }
 *   leaveRoom                         lobby { op, ... }      (host, lobby only)
 *   startGame                         action { type, ... }   (game actions)
 *   host { op, seat }                 chat { text }
 *   (lobby ops include addBot / setBotPersonality / kick for computer players)
 * Messages to the browser:
 *   meta   (once, on connect): settings defaults, labels, limits
 *   state  (after every change): the room + your view of the game
 *   chat   (one new chat message)
 */
'use strict';

const crypto = require('crypto');
const engine = require('../engine');
const config = require('../config');
const bots = require('./bots');

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (look like 1 and 0)
const MAX_PLAYERS = 5;
const MIN_PLAYERS = 3;
const ROOM_IDLE_HOURS = 6; // rooms with nobody connected for this long are deleted

function newCode(rooms) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function cleanName(name) {
  if (typeof name !== 'string') throw new Error('Please enter a name.');
  const n = name.replace(/\s+/g, ' ').trim();
  if (!n) throw new Error('Please enter a name.');
  if (n.length > 20) throw new Error('Names can be at most 20 characters.');
  return n;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function attachRooms(io) {
  const rooms = new Map();

  // ------------------------------------------------------------ helpers
  function memberOf(socket) {
    const room = rooms.get(socket.data.code);
    if (!room) return {};
    const member = room.members.find((m) => m.id === socket.data.memberId);
    return { room, member };
  }

  function seatOf(room, member) {
    return room.members.indexOf(member);
  }

  function payloadFor(room, member) {
    const seat = seatOf(room, member);
    const state = room.state;
    const out = {
      code: room.code,
      you: { id: member.id, name: member.name, seat, isHost: member.id === room.hostId },
      members: room.members.map((m, i) => ({
        seat: i,
        name: m.name,
        connected: m.sockets.size > 0 || !!m.bot,
        isHost: m.id === room.hostId,
        bot: m.bot ? m.bot.personality : null,
      })),
      lobby: {
        mode: room.mode,
        settings: room.settings,
        biomeMode: room.biomeMode,
        manualBiomes: room.members.map((m) => room.manualBiomes[m.id] || null),
      },
      game: state ? engine.viewFor(state, seat) : null,
      paused: room.paused,
      lootSecondsLeft: room.loot.deadline ? Math.max(0, Math.round((room.loot.deadline - Date.now()) / 1000)) : null,
      startedAt: room.startedAt,
    };
    if (state && state.phase === 'ended' && room.record) {
      out.record = room.record;
      out.recordCsv = engine.recordToCsv(room.record);
    }
    return out;
  }

  function broadcast(room) {
    room.lastActive = Date.now();
    for (const m of room.members) {
      if (!m.sockets.size) continue;
      const data = payloadFor(room, m);
      for (const sid of m.sockets) io.to(sid).emit('state', data);
    }
    scheduleBots(room);
    botReactions(room);
  }

  // ------------------------------------------------------------ bots
  /** Give every bot that has something to do a turn, after a short "thinking" pause. */
  function scheduleBots(room) {
    const s = room.state;
    if (!s || s.phase === 'ended' || room.paused) return;
    room.members.forEach((m, seat) => {
      if (!m.bot || room.botTimers[seat]) return;
      const view = engine.viewFor(s, seat);
      // Offers waiting for this bot's answer (trades, pact offers, treaty invitations) also wake it up.
      const tried = (key) => m.bot.tried && m.bot.tried.has(key);
      const offers =
        engine.BUILD_PHASES.includes(s.phase) &&
        (view.trades.some((t) => t.to === seat && !tried('trade-' + t.id)) ||
          (view.pacts || []).some((p) => p.status === 'proposed' && p.b === seat && !tried('pact-' + p.id)) ||
          (view.treaties || []).some((x) => x.invited.includes(seat) && ![...x.signed, ...x.declined, ...x.broken].includes(seat) && !tried('treaty-' + x.id)));
      if (!view.waitingFor.includes(seat) && !offers) return;
      room.botTimers[seat] = setTimeout(() => {
        room.botTimers[seat] = null;
        botTurn(room, seat);
      }, s.settings.general.botThinkMs);
      room.botTimers[seat].unref();
    });
  }

  function botTurn(room, seat) {
    const s = room.state;
    const m = room.members[seat];
    if (!s || s.phase === 'ended' || room.paused || !m || !m.bot) return;
    const view = engine.viewFor(s, seat);
    const idea = bots.decide(view, m.bot);
    if (idea) {
      try {
        applyToRoom(room, seat, idea.action);
        if (idea.say) botSay(room, seat, idea.say);
      } catch (e) {
        if (e.name !== 'RuleError') console.error(e);
        m.bot.tried.add(idea.key); // try something else next time
        m.bot.failures = (m.bot.failures || 0) + 1;
      }
    }
    // A bot that has run out of ideas (or keeps failing) is moved along like a skipped player.
    if ((!idea || m.bot.failures > 12) && room.state.phase !== 'ended' && engine.viewFor(room.state, seat).waitingFor.includes(seat)) {
      try {
        applyToRoom(room, 'host', { type: 'skip', seat });
      } catch (e) {
        if (e.name !== 'RuleError') console.error(e);
      }
    }
    broadcast(room);
  }

  /** A bot posts in the room chat. */
  function botSay(room, seat, text) {
    const m = room.members[seat];
    if (!m || !text) return;
    const msg = { name: m.name, seat, text, time: Date.now(), bot: true };
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    io.to('room:' + room.code).emit('chat', msg);
  }

  /** Bots react in chat to what just happened (attacks on them, broken pacts, a high Flood). */
  function botReactions(room) {
    const s = room.state;
    if (!s || s.phase === 'ended') return;
    room.members.forEach((m, seat) => {
      if (!m.bot) return;
      const line = bots.react(engine.viewFor(s, seat), m.bot);
      if (line) setTimeout(() => botSay(room, seat, line), 400 + Math.random() * 900).unref();
    });
  }

  /** Bots answer chat messages that mention them (or "everyone"). */
  function botReplies(room, fromSeat, text) {
    const s = room.state;
    if (!s || s.phase === 'ended' || fromSeat < 0) return;
    const answers = [];
    room.members.forEach((m, seat) => {
      if (!m.bot || seat === fromSeat) return;
      const r = bots.reply(text, fromSeat, engine.viewFor(s, seat), m.bot, m.name);
      if (r) answers.push({ seat, r, named: text.toLowerCase().includes(m.name.replace(/^bot\s+/i, '').toLowerCase()) });
    });
    // Bots you name all answer; otherwise one bot speaks for the group.
    const chosen = answers.some((a) => a.named) ? answers.filter((a) => a.named) : answers.length ? [answers[Math.floor(Math.random() * answers.length)]] : [];
    chosen.forEach(({ seat, r }, i) => {
      setTimeout(() => {
        if (!room.state || room.state.phase === 'ended') return;
        if (r.action) {
          try {
            applyToRoom(room, seat, r.action);
          } catch (e) {
            if (e.name !== 'RuleError') console.error(e);
            r.say = null; // don't claim we did something we couldn't
          }
        }
        if (r.say) botSay(room, seat, r.say);
        if (r.action) broadcast(room);
      }, 700 + i * 500 + Math.random() * 600).unref();
    });
  }

  function clearBotTimers(room) {
    for (const k of Object.keys(room.botTimers)) clearTimeout(room.botTimers[k]);
    room.botTimers = {};
  }

  function systemChat(room, text) {
    const msg = { name: null, text, time: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    io.to('room:' + room.code).emit('chat', msg);
  }

  /** Start/stop the loot-picking timer so a slow raider can't stall the game. */
  function syncLootTimer(room) {
    const s = room.state;
    const needTimer = s && s.phase === 'loot' && s.pendingLoot && !room.paused;
    const key = needTimer ? s.pendingLoot.id : null;
    if (room.loot.key === key) return;
    clearTimeout(room.loot.timer);
    room.loot = { key: null, timer: null, deadline: null };
    if (!needTimer) return;
    const ms = s.settings.general.lootPickSeconds * 1000;
    room.loot.key = key;
    room.loot.deadline = Date.now() + ms;
    room.loot.timer = setTimeout(() => {
      if (room.state && room.state.phase === 'loot' && room.state.pendingLoot && room.state.pendingLoot.id === key && !room.paused) {
        applyToRoom(room, 'system', { type: 'lootTimeout' });
        broadcast(room);
      }
    }, ms);
  }

  /** Run an action through the rules engine and handle side effects. */
  function applyToRoom(room, actor, action) {
    room.state = engine.applyAction(room.state, actor, action);
    if (room.state.phase === 'ended' && !room.endedAt) {
      room.endedAt = Date.now();
      room.record = engine.playtestRecord(room.state, { startedAt: room.startedAt, endedAt: room.endedAt });
      room.record.players.forEach((p, i) => (p.bot = room.members[i] && room.members[i].bot ? room.members[i].bot.personality : null));
      room.record.botCount = room.members.filter((x) => x.bot).length;
    }
    syncLootTimer(room);
    syncBattleLoop(room);
  }

  // ------------------------------------------------------------ Total War: live battles
  // While battles are being fought, the server advances them 10 times a second and
  // sends a small snapshot of every battle to everyone in the room 5 times a second.
  const BATTLE_TICK_MS = 100;
  function syncBattleLoop(room) {
    const fighting = room.state && room.state.phase === 'battle';
    if (fighting && !room.battleTimer) {
      room.battleTick = 0;
      room.battleTimer = setInterval(() => battleTick(room), BATTLE_TICK_MS);
      room.battleTimer.unref();
    } else if (!fighting && room.battleTimer) {
      clearInterval(room.battleTimer);
      room.battleTimer = null;
    }
  }

  function battleTick(room) {
    const s = room.state;
    if (!s || s.phase !== 'battle') return syncBattleLoop(room);
    if (room.paused) return;
    // Bots — and players who have left — let the computer fight.
    for (const b of s.battles) {
      if (b.status !== 'live') continue;
      const away = (seat) => room.members[seat] && (room.members[seat].bot || room.members[seat].sockets.size === 0);
      if (away(b.attacker)) b.auto.A = true;
      if (away(b.defender)) b.auto.D = true;
    }
    let ended = false;
    try {
      ended = engine.stepBattles(s, BATTLE_TICK_MS / 1000);
    } catch (e) {
      console.error(e);
    }
    room.battleTick++;
    if (s.phase === 'ended' && !room.endedAt) {
      room.endedAt = Date.now();
      room.record = engine.playtestRecord(s, { startedAt: room.startedAt, endedAt: room.endedAt });
    }
    if (ended) {
      broadcast(room); // a battle finished: everyone gets the full new state
      syncBattleLoop(room);
    } else if (room.battleTick % 2 === 0) {
      io.to('room:' + room.code).emit('battles', (s.battles || []).map((b) => engine.battleSnapshot(b)));
    }
  }

  /** Wrap a socket handler: catch errors and reply through the ack callback. */
  function handle(socket, event, fn) {
    socket.on(event, (data, ack) => {
      if (typeof data === 'function') {
        ack = data;
        data = {};
      }
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const result = fn(data || {}) || {};
        reply({ ok: true, ...result });
      } catch (e) {
        if (e.name !== 'RuleError' && !e.friendly) console.error(e);
        reply({ error: e.message || 'Something went wrong.' });
      }
    });
  }

  function friendly(message) {
    const e = new Error(message);
    e.friendly = true;
    return e;
  }

  function requireRoom(socket) {
    const { room, member } = memberOf(socket);
    if (!room || !member) throw friendly('You are not in a room. Please rejoin.');
    return { room, member };
  }

  function requireHost(room, member) {
    if (member.id !== room.hostId) throw friendly('Only the host can do that.');
  }

  function attach(socket, room, member) {
    detach(socket);
    socket.data.code = room.code;
    socket.data.memberId = member.id;
    member.sockets.add(socket.id);
    socket.join('room:' + room.code);
    socket.emit('chatHistory', room.chat);
  }

  function detach(socket) {
    const { room, member } = memberOf(socket);
    if (!room || !member) return;
    member.sockets.delete(socket.id);
    socket.leave('room:' + room.code);
    socket.data.code = null;
    socket.data.memberId = null;
    // If the host stays gone for a while, hand host controls to someone still
    // connected. The wait means a quick page refresh doesn't lose host.
    if (member.id === room.hostId && !member.sockets.size) {
      clearTimeout(room.hostTimer);
      room.hostTimer = setTimeout(() => passHost(room), room.settings.general.hostHandoverSeconds * 1000);
      room.hostTimer.unref(); // never keep the server process alive just for this
    }
    broadcast(room);
  }

  function passHost(room) {
    const host = room.members.find((m) => m.id === room.hostId);
    if (host && host.sockets.size) return; // host came back
    const next = room.members.find((m) => m.sockets.size > 0);
    if (!next) return;
    room.hostId = next.id;
    systemChat(room, `${host ? host.name + ' is away. ' : ''}${next.name} is now the host.`);
    broadcast(room);
  }

  // ------------------------------------------------------------ connections
  io.on('connection', (socket) => {
    socket.emit('meta', {
      defaults: config.DEFAULTS,
      labels: config.LABELS,
      limits: config.LIMITS,
      options: config.OPTIONS,
      groupsForMode: config.GROUPS_FOR_MODE,
      modes: engine.MODES,
      builtModes: engine.BUILT_MODES,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    });

    handle(socket, 'createRoom', ({ name }) => {
      const clean = cleanName(name);
      const code = newCode(rooms);
      const member = { id: crypto.randomUUID(), name: clean, sockets: new Set() };
      const room = {
        code,
        members: [member],
        hostId: member.id,
        mode: 'base',
        settings: config.cloneDefaults(),
        biomeMode: 'random',
        manualBiomes: {},
        state: null,
        paused: false,
        startedAt: null,
        endedAt: null,
        record: null,
        chat: [],
        loot: { key: null, timer: null, deadline: null },
        botTimers: {},
        lastActive: Date.now(),
      };
      rooms.set(code, room);
      attach(socket, room, member);
      broadcast(room);
      return { code, token: member.id };
    });

    handle(socket, 'joinRoom', ({ code, name, token }) => {
      const room = rooms.get(String(code || '').trim().toUpperCase());
      if (!room) throw friendly('No room with that code. Check the code, or ask the host for the link.');
      let member = token && room.members.find((m) => m.id === token);
      if (!member) {
        const clean = cleanName(name);
        member = room.members.find((m) => m.name.toLowerCase() === clean.toLowerCase());
        if (member && member.bot) throw friendly('That name belongs to a bot. Please pick another name.');
        if (!member) {
          if (room.state) {
            const names = room.members.map((m) => m.name).join(', ');
            throw friendly(`This game has already started. To rejoin, use exactly the same name you played with: ${names}.`);
          }
          if (room.members.length >= MAX_PLAYERS) throw friendly('This room is full (5 players).');
          member = { id: crypto.randomUUID(), name: clean, sockets: new Set() };
          room.members.push(member);
          systemChat(room, `${clean} joined.`);
        } else if (member.sockets.size === 0 && room.state) {
          systemChat(room, `${member.name} rejoined.`);
        }
      }
      attach(socket, room, member);
      broadcast(room);
      return { code: room.code, token: member.id };
    });

    handle(socket, 'leaveRoom', () => {
      const { room, member } = memberOf(socket);
      if (!room) return;
      detach(socket);
      if (!room.state && member && !member.sockets.size) {
        room.members = room.members.filter((m) => m !== member);
        systemChat(room, `${member.name} left.`);
        if (!room.members.length) {
          clearTimeout(room.hostTimer);
          rooms.delete(room.code);
          return;
        }
        if (room.hostId === member.id) passHost(room);
        broadcast(room);
      }
    });

    // Host-only lobby changes.
    handle(socket, 'lobby', (msg) => {
      const { room, member } = requireRoom(socket);
      requireHost(room, member);
      if (room.state) throw friendly('The game has already started.');
      switch (msg.op) {
        case 'setMode':
          if (!engine.MODES.includes(msg.mode)) throw friendly('Unknown mode.');
          if (!engine.BUILT_MODES.includes(msg.mode)) throw friendly('That mode is not built yet.');
          room.mode = msg.mode;
          break;
        case 'setSetting':
          try {
            room.settings = config.setSetting(room.settings, String(msg.path), msg.value);
          } catch (e) {
            throw friendly(e.message);
          }
          break;
        case 'resetSettings':
          room.settings = config.cloneDefaults();
          break;
        case 'setBiomeMode':
          if (!['random', 'manual'].includes(msg.biomeMode)) throw friendly('Unknown biome mode.');
          room.biomeMode = msg.biomeMode;
          break;
        case 'setBiome': {
          const m = room.members[msg.seat];
          if (!m) throw friendly('No such player.');
          if (!engine.BIOMES[msg.biome]) throw friendly('Unknown biome.');
          room.manualBiomes[m.id] = msg.biome;
          break;
        }
        case 'moveSeat': {
          const i = msg.seat;
          const j = i + (msg.dir === 'up' ? -1 : 1);
          if (!room.members[i] || !room.members[j]) throw friendly('Cannot move there.');
          [room.members[i], room.members[j]] = [room.members[j], room.members[i]];
          break;
        }
        case 'shuffleSeats':
          room.members = shuffled(room.members);
          break;
        case 'addBot': {
          if (room.members.length >= MAX_PLAYERS) throw friendly('The room is full (5 players).');
          const name = bots.BOT_NAMES.find((n) => !room.members.some((m) => m.name === n));
          const personality = bots.PERSONALITY_ORDER[room.members.filter((m) => m.bot).length % bots.PERSONALITY_ORDER.length];
          room.members.push({ id: crypto.randomUUID(), name, sockets: new Set(), bot: { personality, tried: new Set(), phaseKey: null, failures: 0 } });
          systemChat(room, `${name} (${personality} bot) joined.`);
          break;
        }
        case 'setBotPersonality': {
          const m = room.members[msg.seat];
          if (!m || !m.bot) throw friendly('That player is not a bot.');
          if (!bots.PERSONALITIES[msg.personality]) throw friendly('Unknown personality.');
          m.bot.personality = msg.personality;
          break;
        }
        case 'kick': {
          const m = room.members[msg.seat];
          if (!m || m.id === member.id) throw friendly('Cannot remove that player.');
          for (const sid of m.sockets) {
            const s = io.sockets.sockets.get(sid);
            if (s) {
              s.leave('room:' + room.code);
              s.data.code = null;
              s.emit('kicked');
            }
          }
          room.members = room.members.filter((x) => x !== m);
          systemChat(room, `${m.name} was removed by the host.`);
          break;
        }
        default:
          throw friendly('Unknown lobby command.');
      }
      broadcast(room);
    });

    handle(socket, 'startGame', () => {
      const { room, member } = requireRoom(socket);
      requireHost(room, member);
      if (room.state) throw friendly('The game has already started.');
      const n = room.members.length;
      if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw friendly(`You need ${MIN_PLAYERS} to ${MAX_PLAYERS} players to start (you have ${n}).`);
      let biomes;
      if (room.biomeMode === 'manual') {
        biomes = room.members.map((m) => room.manualBiomes[m.id]);
        if (biomes.some((b) => !b)) throw friendly('Pick a biome for every player, or switch to random biomes.');
      } else {
        biomes = shuffled(engine.defaultBiomeList(n, (arr) => arr[crypto.randomInt(arr.length)]));
      }
      room.state = engine.createGame({
        mode: room.mode,
        settings: room.settings,
        players: room.members.map((m, i) => ({ name: m.name, biome: biomes[i] })),
        seed: crypto.randomInt(2 ** 31),
      });
      room.startedAt = Date.now();
      room.endedAt = null;
      for (const m of room.members) if (m.bot) Object.assign(m.bot, { tried: new Set(), phaseKey: null, failures: 0 });
      room.record = null;
      room.paused = false;
      systemChat(room, 'The game has started. Good luck!');
      broadcast(room);
    });

    handle(socket, 'action', (action) => {
      const { room, member } = requireRoom(socket);
      if (!room.state) throw friendly('The game has not started.');
      if (room.paused) throw friendly('The game is paused by the host.');
      const seat = seatOf(room, member);
      // Host-only and server-only actions can't be sent as normal actions.
      if (['skip', 'endGame', 'lootTimeout'].includes(action.type)) throw friendly('Not allowed.');
      applyToRoom(room, seat, action);
      broadcast(room);
    });

    handle(socket, 'host', ({ op, seat }) => {
      const { room, member } = requireRoom(socket);
      requireHost(room, member);
      if (op === 'backToLobby') {
        if (room.state && room.state.phase !== 'ended') throw friendly('End the game first.');
        room.state = null;
        room.record = null;
        room.paused = false;
        clearBotTimers(room);
        syncLootTimer(room);
        broadcast(room);
        return;
      }
      if (!room.state) throw friendly('The game has not started.');
      if (op === 'pause') {
        room.paused = true;
        systemChat(room, 'The host paused the game.');
      } else if (op === 'resume') {
        room.paused = false;
        systemChat(room, 'The host resumed the game.');
      } else if (op === 'skip') {
        if (room.paused) throw friendly('Resume the game first.');
        applyToRoom(room, 'host', { type: 'skip', seat });
      } else if (op === 'endGame') {
        applyToRoom(room, 'host', { type: 'endGame' });
      } else {
        throw friendly('Unknown host command.');
      }
      syncLootTimer(room);
      broadcast(room);
    });

    handle(socket, 'chat', ({ text }) => {
      const { room, member } = requireRoom(socket);
      const t = String(text || '').trim().slice(0, 300);
      if (!t) return;
      const msg = { name: member.name, seat: seatOf(room, member), text: t, time: Date.now() };
      room.chat.push(msg);
      if (room.chat.length > 200) room.chat.shift();
      io.to('room:' + room.code).emit('chat', msg);
      botReplies(room, msg.seat, t);
    });

    socket.on('disconnect', () => detach(socket));
  });

  // Delete rooms nobody has used for a long time, to free memory.
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - ROOM_IDLE_HOURS * 3600 * 1000;
    for (const [code, room] of rooms) {
      const anyone = room.members.some((m) => m.sockets.size > 0);
      if (!anyone && room.lastActive < cutoff) {
        clearTimeout(room.loot.timer);
        rooms.delete(code);
      }
    }
  }, 15 * 60 * 1000);
  cleanup.unref();

  return {
    rooms,
    stop() {
      clearInterval(cleanup);
      for (const room of rooms.values()) {
        clearTimeout(room.loot.timer);
        clearTimeout(room.hostTimer);
        clearBotTimers(room);
        clearInterval(room.battleTimer);
      }
    },
  };
}

module.exports = { attachRooms };
