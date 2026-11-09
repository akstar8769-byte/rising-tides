// MAIN CLIENT FILE
// Connects to the server, keeps the latest state, and redraws the screen.
// The server is the referee: this page only SENDS requests and SHOWS what the
// server says. Changing this code can't change the rules.

import { renderLanding } from './landing.js';
import { renderLobby } from './lobby.js';
import { renderGame } from './game.js';
import { renderEnd } from './end.js';
import { onState as diceOnState } from './dice.js';

/* global io */
const socket = io();

// Everything the screen needs. `data` is the latest message from the server;
// `ui` holds things you are typing/choosing that the server doesn't know yet.
export const store = {
  meta: null,
  data: null,
  chat: [],
  unreadChat: 0,
  lootDeadline: null,
  ui: freshUi(),
};

function freshUi() {
  return {
    tab: 'play',
    name: '',
    code: new URLSearchParams(location.search).get('room')?.toUpperCase() || '',
    choice: { action: null, mix: { wood: 0, stone: 0, sandbag: 0 }, target: null },
    market: { give: 'wood', get: 'stone', times: 1 },
    donate: { wood: 0, stone: 0, sandbag: 0 },
    trade: { to: null, give: { wood: 0, stone: 0, sandbag: 0 }, get: { wood: 0, stone: 0, sandbag: 0 } },
    loot: { wood: 0, stone: 0, sandbag: 0 },
    walls: 1,
    recruit: { count: 1, mix: { wood: 0, stone: 0, sandbag: 0 }, tile: null },
    move: { from: null, to: null, count: 1 }, // stationed units: the "Move units" form
    cmdAttackFor: null, // Empire: which puppet we're picking an attack target for
    hostOpen: false,
    chatDraft: '',
  };
}

// ---------------------------------------------------------------- session (for rejoining)
const SESSION_KEY = 'rising-tides-session';
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}
function saveSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: rejoining by name still works */
  }
}

// ---------------------------------------------------------------- talking to the server
/** Send a message; shows the error as a toast if the server says no. */
export function send(event, data = {}) {
  return new Promise((resolve) => {
    socket.emit(event, data, (res) => {
      if (res && res.error) toast(res.error, 'error');
      resolve(res || {});
    });
  });
}
export const act = (action) => send('action', action);

socket.on('meta', (m) => {
  store.meta = m;
  render();
});

socket.on('state', (d) => {
  const prev = store.data;
  store.data = d;
  store.lootDeadline = d.lootSecondsLeft != null ? Date.now() + d.lootSecondsLeft * 1000 : null;
  saveSession({ code: d.code, name: d.you.name, token: d.you.id });
  if (location.search !== `?room=${d.code}`) history.replaceState(null, '', `?room=${d.code}`);
  // Reset per-round drafts when a new choose phase starts
  if (d.game && prev?.game && prev.game.phase !== 'choose' && d.game.phase === 'choose') {
    store.ui.choice = { action: null, mix: { wood: 0, stone: 0, sandbag: 0 }, target: null };
    store.ui.cmdAttackFor = null;
  }
  if (d.game?.phase === 'loot' && prev?.game?.phase !== 'loot') store.ui.loot = { wood: 0, stone: 0, sandbag: 0 };
  diceOnState(d);
  render();
});

socket.on('chatHistory', (msgs) => {
  store.chat = msgs;
  render();
});
socket.on('chat', (msg) => {
  store.chat.push(msg);
  if (store.chat.length > 200) store.chat.shift();
  if (store.ui.tab !== 'log') store.unreadChat++;
  render();
});
socket.on('kicked', () => {
  saveSession(null);
  store.data = null;
  toast('The host removed you from the room.', 'error');
  render();
});

socket.on('connect', () => {
  document.getElementById('connection').hidden = true;
  const saved = loadSession();
  const urlCode = store.ui.code;
  if (saved && (!urlCode || urlCode === saved.code)) {
    send('joinRoom', saved).then((res) => {
      if (res.error) {
        saveSession(null);
        store.data = null;
        render();
      }
    });
  }
});
socket.on('disconnect', () => {
  document.getElementById('connection').hidden = false;
});

// ---------------------------------------------------------------- toasts
export function toast(text, kind = 'info') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 5000 : 3000);
}

// ---------------------------------------------------------------- drawing
const root = document.getElementById('app');

export function render() {
  // Remember which text box had focus so redrawing doesn't interrupt typing.
  const active = document.activeElement;
  const focus = active && active.id && root.contains(active) ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const scrollers = [...root.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]);

  const d = store.data;
  if (!d) root.innerHTML = renderLanding(store);
  else if (!d.game) root.innerHTML = renderLobby(store);
  else if (d.game.phase === 'ended') root.innerHTML = renderEnd(store);
  else root.innerHTML = renderGame(store);

  for (const [key, top] of scrollers) {
    const el = root.querySelector(`[data-keep-scroll="${key}"]`);
    if (el) el.scrollTop = top;
  }
  if (focus) {
    const el = document.getElementById(focus.id);
    if (el) {
      if ('value' in el && focus.value !== undefined) el.value = focus.value;
      el.focus();
      try {
        el.setSelectionRange(focus.start, focus.end);
      } catch {
        /* not a text input */
      }
    }
  }
}

// Loot countdown text updates every half second without a full redraw.
setInterval(() => {
  if (!store.lootDeadline) return;
  const left = Math.max(0, Math.ceil((store.lootDeadline - Date.now()) / 1000));
  document.querySelectorAll('.countdown').forEach((el) => (el.textContent = `${left}s`));
}, 500);

// ---------------------------------------------------------------- helpers for ui paths
function getPath(path) {
  return path.split('.').reduce((o, k) => o[k], store.ui);
}
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], store.ui)[last] = value;
}
const emptyBag = () => ({ wood: 0, stone: 0, sandbag: 0 });

// ---------------------------------------------------------------- button handlers
// Every clickable thing has data-act="name"; this table says what each one does.
const actions = {
  // UI-only
  step: (ds) => {
    const v = Math.min(+ds.max, Math.max(+ds.min, getPath(ds.path) + +ds.d));
    setPath(ds.path, v);
    render();
  },
  tab: (ds) => {
    store.ui.tab = ds.tab;
    if (ds.tab === 'log') store.unreadChat = 0;
    render();
    window.scrollTo(0, 0);
  },
  set: (ds) => {
    setPath(ds.path, ds.json !== undefined ? JSON.parse(ds.json) : ds.value);
    render();
  },
  toggleHost: () => {
    store.ui.hostOpen = !store.ui.hostOpen;
    render();
  },

  // Landing
  create: async () => {
    const res = await send('createRoom', { name: store.ui.name });
    if (res.ok) store.ui.code = res.code;
  },
  join: async () => {
    const res = await send('joinRoom', { code: store.ui.code, name: store.ui.name });
    if (res.ok) store.ui.code = res.code;
  },
  leave: async () => {
    await send('leaveRoom');
    saveSession(null);
    store.data = null;
    store.ui = freshUi();
    store.ui.code = '';
    history.replaceState(null, '', '/');
    render();
  },
  copyLink: async () => {
    const link = `${location.origin}/?room=${store.data.code}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Rising Tides', text: `Join my Rising Tides room: ${store.data.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link copied!');
      }
    } catch {
      toast(link);
    }
  },

  // Lobby (host)
  lobby: (ds) => send('lobby', JSON.parse(ds.json)),
  start: () => send('startGame'),

  // Game
  ready: () => act({ type: 'ready' }),
  unready: () => act({ type: 'unready' }),
  buildWall: () => act({ type: 'buildWall', count: store.ui.walls }).then((r) => r.ok && (store.ui.walls = 1)),
  market: () => act({ type: 'market', give: store.ui.market.give, get: store.ui.market.get, times: store.ui.market.times }),
  donate: () => act({ type: 'donate', materials: store.ui.donate }).then((r) => r.ok && ((store.ui.donate = emptyBag()), render())),
  proposeTrade: () => {
    const t = store.ui.trade;
    act({ type: 'proposeTrade', to: t.to, give: t.give, get: t.get }).then((r) => {
      if (r.ok) {
        toast('Offer sent.');
        store.ui.trade = { to: t.to, give: emptyBag(), get: emptyBag() };
        render();
      }
    });
  },
  gift: () => {
    const t = store.ui.trade;
    act({ type: 'gift', to: t.to, materials: t.give }).then((r) => {
      if (r.ok) {
        store.ui.trade = { to: t.to, give: emptyBag(), get: emptyBag() };
        render();
      }
    });
  },
  acceptTrade: (ds) => act({ type: 'acceptTrade', id: +ds.id }),
  rejectTrade: (ds) => act({ type: 'rejectTrade', id: +ds.id }),
  cancelTrade: (ds) => act({ type: 'cancelTrade', id: +ds.id }),
  pickAction: (ds) => {
    const c = store.ui.choice;
    c.action = ds.value;
    if (ds.value !== 'raid') c.target = null;
    c.from = null;
    c.count = null;
    c.mix = emptyBag();
    render();
  },
  lockIn: () => {
    const c = store.ui.choice;
    const msg = { type: 'choose', action: c.action };
    if (c.action === 'raid' || c.action === 'attack') msg.target = c.target;
    else if (c.action !== 'revolt') msg.mix = c.mix;
    if (store.data.game.stationed && (c.action === 'attack' || c.action === 'revolt')) Object.assign(msg, { from: c.from, count: c.count });
    if (c.aid) msg.aid = c.aid;
    act(msg).then((r) => {
      if (r.ok) {
        c.editing = false;
        render();
      }
    });
  },
  pickLoot: () => act({ type: 'pickLoot', materials: store.ui.loot }),

  // War / Empire
  recruit: () => {
    const r = store.ui.recruit;
    const msg = { type: 'recruit', count: r.count, materials: r.mix };
    if (store.data.game.stationed) msg.tile = r.tile || store.data.game.players[store.data.game.you].homeTile;
    act(msg).then((res) => {
      if (res.ok) {
        store.ui.recruit = { count: 1, mix: emptyBag(), tile: r.tile };
        render();
      }
    });
  },
  pickTile: (ds) => {
    // Tapped an outlined tile on the board.
    if (store.ui.cmdAttackFor != null) {
      actions.setCommand({ puppet: String(store.ui.cmdAttackFor), action: 'attack', target: ds.tile });
      return;
    }
    store.ui.choice.target = ds.tile;
    toast('Target chosen — lock in on the Play tab.');
    render();
  },
  setCommand: (ds) => {
    const msg = { type: 'setCommand', puppet: +ds.puppet, action: ds.action };
    if (ds.target) msg.target = ds.target;
    act(msg).then((r) => {
      if (r.ok) {
        store.ui.cmdAttackFor = null;
        render();
      }
    });
  },
  planWithdraw: (ds) => act({ type: 'planWithdraw', tile: ds.tile }),
  moveUnits: () => {
    const mv = store.ui.move;
    act({ type: 'moveUnits', from: mv.from, to: mv.to, count: mv.count }).then((r) => {
      if (r.ok) {
        mv.count = 1;
        render();
      }
    });
  },
  planRelease: (ds) => act({ type: 'planRelease', puppet: +ds.puppet }),

  // Host controls
  host: (ds) => {
    if (ds.op === 'endGame' && !confirm('End the game now and score at the current Flood?')) return;
    send('host', { op: ds.op, seat: ds.seat !== undefined ? +ds.seat : undefined });
  },

  download: (ds) => {
    const d = store.data;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const isCsv = ds.kind === 'csv';
    const blob = new Blob([isCsv ? d.recordCsv : JSON.stringify(d.record, null, 2)], { type: isCsv ? 'text/csv' : 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rising-tides-${d.code}-${stamp}.${isCsv ? 'csv' : 'json'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  e.preventDefault();
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, el);
});

// Text boxes and selects: data-model="path" stores what you type in store.ui
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.model) {
    const v = el.type === 'number' ? Number(el.value) : el.value;
    setPath(el.dataset.model, el.dataset.model === 'code' ? String(v).toUpperCase() : v);
  }
});

// Lobby settings: data-setting="base.rounds" sends the new value when changed
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.setting) {
    const value = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
    send('lobby', { op: 'setSetting', path: el.dataset.setting, value }).then((r) => r.error && render());
  } else if (el.dataset.botSeat !== undefined) {
    send('lobby', { op: 'setBotPersonality', seat: +el.dataset.botSeat, personality: el.value });
  } else if (el.dataset.biomeMode !== undefined) {
    send('lobby', { op: 'setBiomeMode', biomeMode: el.value });
  } else if (el.dataset.biomeSeat !== undefined) {
    send('lobby', { op: 'setBiome', seat: +el.dataset.biomeSeat, biome: el.value });
  } else if (el.dataset.model && el.tagName === 'SELECT') {
    render();
  }
});

// Forms: Enter key submits (landing and chat)
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'chat-form') {
    const text = store.ui.chatDraft.trim();
    if (text) send('chat', { text });
    store.ui.chatDraft = '';
    const input = document.getElementById('chat-input');
    if (input) input.value = '';
  } else if (form.dataset.submit && actions[form.dataset.submit]) {
    actions[form.dataset.submit]({});
  }
});

render();
